"""Container supervisor. The API and the browser use different, unprivileged UIDs.

Only a local socket owned by the API account can request a browser process.
The supervisor never browses, calls the model, or serves an Internet endpoint.
"""
import asyncio
import base64
import contextlib
import ctypes
import json
import os
import shutil
import signal
import socket
import struct
import sys
import tempfile
from pathlib import Path
from .chromium_launcher import launch_spec

API_UID=10001
BROWSER_UID=10002
RUNTIME=Path('/run/q-research')
SOCKET=RUNTIME/'browser.sock'
PROFILES=RUNTIME/'browser-profiles'


def browser_pids():
    result=[]
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():continue
        try:
            if entry.stat().st_uid==BROWSER_UID:result.append(int(entry.name))
        except (FileNotFoundError,PermissionError):pass
    return result


def kill_browsers():
    for pid in browser_pids():
        with contextlib.suppress(ProcessLookupError):os.kill(pid,signal.SIGKILL)


async def cleanup_browsers():
    # PID 1 (or this subreaper) must also collect orphaned Chrome subprocesses.
    # Killing without reaping leaves zombies across consecutive research jobs.
    for _ in range(60):
        pids=browser_pids()
        if not pids:return
        for pid in pids:
            with contextlib.suppress(ProcessLookupError):os.kill(pid,signal.SIGKILL)
            with contextlib.suppress(ChildProcessError,ProcessLookupError):os.waitpid(pid,os.WNOHANG)
        await asyncio.sleep(.05)
    raise RuntimeError('Browser cleanup could not finish.')


def prepare_runtime():
    if os.geteuid()!=0:raise RuntimeError('The container supervisor must initialise process accounts.')
    if os.getenv('Q_RESEARCH_DATA','/data')!='/data':raise RuntimeError('The container data volume must be mounted at /data.')
    if ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)!=0:
        raise RuntimeError('Browser subprocess cleanup is unavailable.')  # PR_SET_CHILD_SUBREAPER
    data=Path('/data')
    if data.is_symlink():raise RuntimeError('The data volume must be a real directory.')
    data.mkdir(exist_ok=True);os.chown(data,API_UID,API_UID);data.chmod(0o700)
    RUNTIME.mkdir(mode=0o755,exist_ok=True);RUNTIME.chmod(0o755)
    SOCKET.unlink(missing_ok=True)
    PROFILES.mkdir(mode=0o711,exist_ok=True);PROFILES.chmod(0o711)
    kill_browsers()
    for profile in PROFILES.glob('browser-*'):
        if profile.is_dir() and not profile.is_symlink():shutil.rmtree(profile)


class Broker:
    def __init__(self):self.lock=asyncio.Lock();self.handlers=set();self.writers=set();self.failed=False

    async def handle(self,reader,writer):
        task=asyncio.current_task();self.handlers.add(task);self.writers.add(writer)
        try:
            peer=writer.get_extra_info('socket')
            _,uid,_=struct.unpack('3i',peer.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
            if uid!=API_UID:raise ValueError('peer')
            raw=await asyncio.wait_for(reader.readline(),5)
            if len(raw)>32768:raise ValueError('request')
            payload=json.loads(raw)
            if not isinstance(payload,dict) or set(payload)!={'args'}:raise ValueError('request')
            args=payload['args']
            if not isinstance(args,list) or len(args)>160 or any(not isinstance(a,str) or len(a)>4096 or '\0' in a for a in args):raise ValueError('arguments')
            async with self.lock:
                if self.failed:raise RuntimeError('The browser supervisor needs a restart.')
                await self.run(args,reader,writer)
        except (ValueError,KeyError,TypeError,ConnectionError,OSError,RuntimeError,asyncio.TimeoutError):
            with contextlib.suppress(ConnectionError,OSError):
                writer.write(b'{"error":"Browser process could not start."}\n');await writer.drain()
        finally:
            writer.close();self.writers.discard(writer);self.handlers.discard(task)

    async def run(self,args,reader,writer):
        process=None;profile=None;pumps=[];disconnected=None;finished=None
        try:
            # Only the fixed Chromium executable runs, under the browser UID.
            profile=Path(tempfile.mkdtemp(prefix='browser-',dir=PROFILES))
            os.chown(profile,BROWSER_UID,BROWSER_UID)
            for name in ['tmp','cache','config']:
                child=profile/name;child.mkdir(mode=0o700);os.chown(child,BROWSER_UID,BROWSER_UID)
            argv,env=launch_spec(args,os.environ)
            argv=[arg for arg in argv[1:] if not arg.startswith(('--user-data-dir=','--remote-debugging-address='))]
            # Hosted containers commonly block Chrome's namespace sandbox.
            # The container and distinct OS account supply isolation here.
            argv+=['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-address=127.0.0.1','--user-data-dir='+str(profile)]
            env.update(HOME=str(profile),TMPDIR=str(profile/'tmp'),XDG_CACHE_HOME=str(profile/'cache'),XDG_CONFIG_HOME=str(profile/'config'))
            process=await asyncio.create_subprocess_exec(sys.executable,'-m','worker.unprivileged_exec','/usr/bin/chromium',*argv,
                user=BROWSER_UID,group=BROWSER_UID,extra_groups=(),env=env,start_new_session=True,
                stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
            async def send(kind,source):
                while chunk:=await source.read(8192):
                    writer.write(json.dumps({'stream':kind,'data':base64.b64encode(chunk).decode()}).encode()+b'\n')
                    await writer.drain()
            pumps=[asyncio.create_task(send('stdout',process.stdout)),asyncio.create_task(send('stderr',process.stderr))]
            disconnected=asyncio.create_task(reader.read(1));finished=asyncio.create_task(process.wait())
            await asyncio.wait([disconnected,finished],return_when=asyncio.FIRST_COMPLETED,timeout=240)
            if not finished.done():
                with contextlib.suppress(ProcessLookupError):os.killpg(process.pid,signal.SIGKILL)
            await asyncio.wait_for(finished,8)
            await asyncio.wait_for(asyncio.gather(*pumps),8)
        finally:
            if process and process.returncode is None:
                with contextlib.suppress(ProcessLookupError):os.killpg(process.pid,signal.SIGKILL)
                with contextlib.suppress(asyncio.TimeoutError):await asyncio.wait_for(process.wait(),8)
            for pending in [*pumps,disconnected,finished]:
                if pending and not pending.done():pending.cancel()
            await asyncio.gather(*(p for p in [*pumps,disconnected,finished] if p),return_exceptions=True)
            try:await cleanup_browsers()
            except RuntimeError:self.failed=True;raise
            finally:
                if profile:shutil.rmtree(profile,ignore_errors=True)
        # The client observes completion only after the browser and its profile
        # have gone; a new job cannot race cleanup from the previous one.
        writer.write(json.dumps({'exit':process.returncode}).encode()+b'\n');await writer.drain()

    async def close(self):
        for writer in list(self.writers):writer.close()
        for task in list(self.handlers):task.cancel()
        await asyncio.gather(*list(self.handlers),return_exceptions=True)
        await cleanup_browsers()


async def supervise():
    os.umask(0o077);prepare_runtime();broker=Broker()
    server=await asyncio.start_unix_server(broker.handle,path=SOCKET,limit=32769)
    os.chown(SOCKET,API_UID,API_UID);SOCKET.chmod(0o600)
    env={**os.environ,'Q_RESEARCH_BROWSER_SOCKET':str(SOCKET)}
    api=await asyncio.create_subprocess_exec(sys.executable,'-m','worker.unprivileged_exec',sys.executable,'-m','worker.start',
        user=API_UID,group=API_UID,extra_groups=(),env=env,start_new_session=True)
    stopping=asyncio.Event();loop=asyncio.get_running_loop()
    for sig in (signal.SIGTERM,signal.SIGINT):loop.add_signal_handler(sig,stopping.set)
    exited=asyncio.create_task(api.wait());stop=asyncio.create_task(stopping.wait())
    try:
        await asyncio.wait([exited,stop],return_when=asyncio.FIRST_COMPLETED)
        if not exited.done():
            with contextlib.suppress(ProcessLookupError):os.killpg(api.pid,signal.SIGTERM)
            try:await asyncio.wait_for(asyncio.shield(exited),25)
            except asyncio.TimeoutError:
                with contextlib.suppress(ProcessLookupError):os.killpg(api.pid,signal.SIGKILL)
                await exited
        return api.returncode or 0
    finally:
        stop.cancel();await asyncio.gather(stop,return_exceptions=True)
        server.close();await server.wait_closed();await broker.close();SOCKET.unlink(missing_ok=True)


if __name__=='__main__':
    try:sys.exit(asyncio.run(supervise()))
    except (RuntimeError,OSError):sys.exit('Q Research container accounts or private storage could not be initialised.')

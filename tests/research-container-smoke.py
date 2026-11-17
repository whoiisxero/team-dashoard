"""Run the production image locally: real Chrome preflight and signed API, no paid requests."""
import hashlib,hmac,json,os,secrets,subprocess,sys,time,urllib.request,uuid
from pathlib import Path

name='quest-research-check-'+uuid.uuid4().hex[:10]
env={k:v for k,v in os.environ.items() if k not in {'DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'}}
base=['docker','--host=unix:///var/run/docker.sock']
secret=secrets.token_hex(32);member='00000000-0000-4000-8000-000000000001'
image=os.getenv('QUEST_RESEARCH_IMAGE','quest-q-research:release')
def docker(*args):
    result=subprocess.run([*base,*args],env=env,capture_output=True,text=True,timeout=30)
    if result.returncode:raise RuntimeError('Docker '+args[0]+' failed: '+(result.stdout+result.stderr)[-1500:])
    return (result.stdout+(result.stderr if args[0]=='logs' else '')).strip()
try:
    docker('run','-d','--name',name,'--publish','127.0.0.1::8080','--env','OPENAI_API_KEY=test-only-not-a-real-key','--env','Q_RESEARCH_WORKER_SECRET='+secret,image)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    ready=False
    for _ in range(80):
        state=json.loads(docker('inspect','--format','{{json .State}}',name))
        if not state.get('Running'):
            print('Worker container failed startup:',docker('logs',name)[-1200:]);sys.exit(1)
        try:
            binding=docker('port',name,'8080/tcp');origin='http://'+binding
            with opener.open(origin+'/healthz',timeout=1) as r:
                if json.load(r)=={'ok':True}:ready=True;break
        except Exception:time.sleep(.4)
    assert ready,'The worker must pass its production Chromium/storage preflight before becoming healthy'
    timestamp=str(int(time.time()));nonce=str(uuid.uuid4());path='/v1/status'
    canonical='\n'.join([timestamp,nonce,member,'GET',path,hashlib.sha256(b'').hexdigest()])
    signed=hmac.new(secret.encode(),canonical.encode(),hashlib.sha256).hexdigest()
    request=urllib.request.Request(origin+path,headers={'x-q-time':timestamp,'x-q-nonce':nonce,'x-q-member':member,'x-q-signature':signed})
    with opener.open(request,timeout=5) as r:
        status=json.load(r);assert status['configured'] is True;assert status['limits']['calls']==6;assert status['usage']['member_runs']==0
    try:opener.open(origin+path,timeout=5)
    except urllib.error.HTTPError as error:assert error.code==401
    else:raise AssertionError('Unsigned worker requests must be denied')
    # Root supervises processes; the network API and renderer never run as root.
    assert docker('exec',name,'stat','-c','%u:%a','/data')=='10001:700'
    assert docker('exec',name,'stat','-c','%u:%a','/run/q-research/browser.sock')=='10001:600'
    probe="from pathlib import Path;p=Path('/data/isolation-probe');p.write_text('private-research-test');p.chmod(0o600);print('probe ready')"
    assert docker('exec','--user','10001',name,'python','-c',probe)=='probe ready'
    deny="""
import os,socket
for path in ['/data/isolation-probe','/proc/1/environ']:
    try:open(path,'rb').read()
    except PermissionError:pass
    else:raise AssertionError('The browser account read private process or research data')
with socket.socket(socket.AF_UNIX) as s:
    try:s.connect('/run/q-research/browser.sock')
    except PermissionError:pass
    else:raise AssertionError('The browser account reached its privileged launcher')
print('browser access denied')
"""
    assert docker('exec','--user','10002',name,'python','-c',deny)=='browser access denied'
    browser_probe="""
import os,subprocess,time
from pathlib import Path
def renderers():
    result=[]
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():continue
        try:
            values=dict(line.split(':',1) for line in (entry/'status').read_text().splitlines() if ':' in line)
            if values.get('Uid','').split()[0]=='10002':result.append(values)
        except (FileNotFoundError,ProcessLookupError,PermissionError):pass
    return result
env={**os.environ,'Q_RESEARCH_BROWSER_SOCKET':'/run/q-research/browser.sock'}
p=subprocess.Popen(['/app/worker/chromium_launcher.py','--headless=new','--disable-dev-shm-usage','--disable-background-networking','--remote-debugging-port=0','about:blank'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(100):
        rows=renderers()
        if len(rows)>1:break
        if p.poll() is not None:raise AssertionError('The supervised browser exited')
        time.sleep(.1)
    assert len(rows)>1,'Real Chrome subprocesses must start through the broker'
    for row in rows:
        assert row['NoNewPrivs'].strip()=='1'
        assert int(row['CapEff'].strip(),16)==0
finally:
    p.terminate();p.wait(timeout=10)
for _ in range(100):
    if not renderers():break
    time.sleep(.1)
assert not renderers(),'Disconnecting the launcher must remove every browser process'
print('supervised Chrome and disconnect cleanup verified')
"""
    assert docker('exec','--user','10001',name,'python','-c',browser_probe)=='supervised Chrome and disconnect cleanup verified'
    assert docker('exec',name,'python','-c',"from pathlib import Path;assert not list(Path('/run/q-research/browser-profiles').iterdir());print('profiles removed')")=='profiles removed'
    process_probe="""
from pathlib import Path
api=[]
for p in Path('/proc').iterdir():
    if not p.name.isdigit():continue
    try:
        if b'worker.start' not in (p/'cmdline').read_bytes():continue
        status=dict(line.split(':',1) for line in (p/'status').read_text().splitlines() if ':' in line)
        if status['Uid'].split()[0]!='10001':continue
        assert status['NoNewPrivs'].strip()=='1' and int(status['CapEff'].strip(),16)==0
        api.append(p.name)
    except (FileNotFoundError,ProcessLookupError):pass
assert len(api)==1,'Exactly one unprivileged API process must run'
print('API account verified')
"""
    assert docker('exec',name,'python','-c',process_probe)=='API account verified'
    engine=subprocess.run([*base,'exec','-i','--user','10001','--env','Q_RESEARCH_BROWSER_SOCKET=/run/q-research/browser.sock',name,'python','-'],input=Path(__file__).with_name('research-container-engine.py').read_text(),env=env,capture_output=True,text=True,timeout=90)
    assert engine.returncode==0,(engine.stdout+engine.stderr)[-2500:]
    assert 'PASS supervised Browser Use' in engine.stdout
    assert docker('exec',name,'python','-c',"from pathlib import Path;assert not list(Path('/run/q-research/browser-profiles').iterdir());print('profiles removed')")=='profiles removed'
    print(engine.stdout.strip())
    print('PASS production worker container: real Chrome preflight; distinct unprivileged API/browser accounts; no-new-privileges and no process capabilities; private storage/socket/process access denied to browser UID; health; signed API and unsigned denial; browser/profile cleanup after launcher disconnect. Chrome uses container/OS-user isolation, not its namespace sandbox. No paid API request or real credential used.')
finally:
    subprocess.run([*base,'rm','-f','-v',name],env=env,capture_output=True,timeout=30)

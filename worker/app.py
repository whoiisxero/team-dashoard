"""Run as one persistent process: uvicorn worker.app:app --host 0.0.0.0 --port 8080.

The API is HMAC authenticated; browser jobs never receive a Supabase token.
"""
from __future__ import annotations
import asyncio
import hashlib
import hmac
import json
import re
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .settings import Settings, privacy_environment, cleanup_interrupted_files
from .store import Store, Rejected, ACTIVE
from .public_web import public_sources

UUID=re.compile(r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89aAbB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$')


def signature(secret, timestamp, nonce, member, method, path, body):
    message='\n'.join((timestamp,nonce,member,method,path,hashlib.sha256(body).hexdigest()))
    return hmac.new(secret.encode(),message.encode(),hashlib.sha256).hexdigest()


class Runner:
    def __init__(self, store, engine): self.store=store;self.engine=engine;self.current=None;self.job=None

    async def loop(self):
        while True:
            self.store.prune(); job=self.store.next()
            if not job: await asyncio.sleep(.2);continue
            self.job=job;job['status']='running';self.store.put(job)
            settings=self.store.settings
            self.current=asyncio.create_task(self.engine(job,settings.api_key,settings.model,settings))
            stopping=False
            try:
                while not self.current.done():
                    if self.store.get(job['id'])['status']=='stopping' and not stopping:
                        stopping=True;self.current.cancel()
                    self.store.put(job)
                    await asyncio.sleep(.15)
                try: result=await self.current
                except asyncio.CancelledError: result={'status':'cancelled','stage':'Cancelled','message':'This run was stopped. Findings shown so far may be incomplete.'}
                if stopping or self.store.get(job['id'])['status']=='stopping': result={'status':'cancelled','stage':'Cancelled','message':'This run was stopped. Findings shown so far may be incomplete.'}
                job.update(result)
            except asyncio.CancelledError:
                self.current.cancel()
                try: await asyncio.wait_for(self.current,18)
                except (asyncio.CancelledError,Exception): pass
                job.update(status='cancelled',stage='Worker stopping',message='Interrupted. This run will not restart automatically.');self.store.put(job);raise
            except Exception as error:
                from .engine import public_error
                job.update(status='failed',stage='Run ended',message=public_error(error))
            finally:
                self.store.put(job);self.current=None;self.job=None


def create_app(settings=None, *, engine=None, validate_sources=public_sources, clock=time.time):
    settings=settings or Settings.from_env()
    privacy_environment(settings.data)
    if engine is None:
        from .engine import run_research
        engine=run_research
    replay={}

    @asynccontextmanager
    async def lifespan(app):
        store=Store(settings,clock);store.recover();cleanup_interrupted_files(settings.data);app.state.store=store
        runner=Runner(store,engine);task=asyncio.create_task(runner.loop())
        yield
        task.cancel()
        try: await task
        except asyncio.CancelledError: pass
        store.close()

    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)

    @app.middleware('http')
    async def authenticated(request:Request, call_next):
        if request.url.path=='/healthz': return JSONResponse({'ok':True},headers={'Cache-Control':'no-store'})
        if len(settings.secret)<32:return JSONResponse({'code':'worker_not_configured'},503)
        try:
            length=int(request.headers.get('content-length','0'))
            if length>12000:raise ValueError()
            body=bytearray()
            async for block in request.stream():
                body.extend(block)
                if len(body)>12000:raise ValueError()
            raw=bytes(body);request._body=raw
            timestamp=request.headers['x-q-time'];nonce=request.headers['x-q-nonce'];member=request.headers['x-q-member'];given=request.headers['x-q-signature']
            if not timestamp.isdigit() or len(timestamp)>12 or abs(clock()-int(timestamp))>60 or not UUID.fullmatch(nonce) or not UUID.fullmatch(member) or not re.fullmatch('[a-f0-9]{64}',given):raise ValueError()
            if request.url.query:raise ValueError()
            expected=signature(settings.secret,timestamp,nonce,member,request.method,request.url.path,raw)
            if not hmac.compare_digest(expected,given):raise ValueError()
            for key,expiry in list(replay.items()):
                if expiry<clock():replay.pop(key,None)
            if nonce in replay or len(replay)>10000:raise ValueError()
            replay[nonce]=clock()+120;request.state.member=member
        except (ValueError,KeyError):return JSONResponse({'code':'unauthorized'},401,headers={'Cache-Control':'no-store'})
        result=await call_next(request);result.headers['Cache-Control']='no-store, max-age=0';return result

    @app.exception_handler(Rejected)
    async def rejected(request,error): return JSONResponse({'code':error.code},error.status)

    @app.get('/v1/status')
    async def status(request:Request):
        return {'configured':bool(settings.api_key),'limits':{'calls':settings.max_calls,'seconds':settings.max_seconds,'steps':settings.max_steps,'output_tokens_per_call':settings.max_output,'retention_days':settings.retention_days},'usage':request.app.state.store.usage(request.state.member)}

    @app.get('/v1/latest')
    async def latest(request:Request): return {'id':request.app.state.store.latest(request.state.member)}

    @app.post('/v1/jobs')
    async def start(request:Request):
        if not settings.api_key:raise Rejected('worker_not_configured',503)
        try:
            payload=await request.json()
            if not isinstance(payload,dict) or set(payload)!={'id','question','urls','scope_project_id'} or not UUID.fullmatch(payload['id']) or not isinstance(payload['question'],str) or not 1<=len(payload['question'].strip())<=2000:raise ValueError()
            if payload['scope_project_id'] is not None and not UUID.fullmatch(payload['scope_project_id']):raise ValueError()
            if not isinstance(payload['urls'],list) or not 1<=len(payload['urls'])<=3 or any(not isinstance(u,str) or len(u)>1500 for u in payload['urls']):raise ValueError()
            payload['question']=payload['question'].strip()
        except (ValueError,TypeError,KeyError):raise Rejected('invalid_sources',400) from None
        store=request.app.state.store
        existing=store.existing(payload,request.state.member)
        if existing:return {'id':existing['id']}
        try:await validate_sources(payload['urls'])
        except (ValueError,OSError,asyncio.TimeoutError):raise Rejected('invalid_sources',400) from None
        job=store.create(payload,request.state.member);return {'id':job['id']}

    @app.get('/v1/jobs/{id}')
    async def job(id:str,request:Request): return request.app.state.store.get(id,request.state.member)

    @app.post('/v1/jobs/{id}/stop')
    async def stop(id:str,request:Request): return request.app.state.store.stop(id,request.state.member)

    return app


app=create_app()

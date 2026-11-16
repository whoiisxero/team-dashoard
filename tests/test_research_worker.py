"""Actual FastAPI/HMAC/SQLite queue; no paid AI requests or external web access."""
import asyncio
import hashlib
import hmac
import json
import sys
import tempfile
import time
import unittest
import uuid
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from worker.app import create_app, signature
from worker.settings import Settings, cleanup_interrupted_files
from worker.store import Store, Rejected
from worker.public_web import public_url, public_ip, PublicProxy

OWNER='00000000-0000-4000-8000-000000000001'
OTHER='00000000-0000-4000-8000-000000000002'
SECRET='test-shared-secret-01234567890123456789'


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.settings=Settings(Path(self.temp.name),SECRET,'test-only-not-real',member_daily=2,global_daily=3)
        self.now=1700000000.;self.started=[];self.release=False;self.reject_dns=False
        async def validate(urls):
            if self.reject_dns:raise ValueError('invalid_sources')
            for url in urls:public_url(url)
        async def engine(job,key,model,settings):
            self.started.append(job['id']);job['calls']=1;job['stage']='Reading public text'
            try:
                while not self.release:await asyncio.sleep(.02)
            except asyncio.CancelledError:
                # The actual agent can swallow cancellation. The runner must
                # still treat a requested Stop as cancellation, never success.
                pass
            return {'status':'done','stage':'Complete','result':'A public finding','sources':['https://example.com/']}
        self.app=create_app(self.settings,engine=engine,validate_sources=validate,clock=lambda:self.now)
        self.context=TestClient(self.app);self.client=self.context.__enter__()

    def tearDown(self):self.context.__exit__(None,None,None);self.temp.cleanup()

    def signed(self,method,path,payload=None,owner=OWNER,nonce=None,age=0):
        raw=json.dumps(payload,separators=(',',':')).encode() if payload is not None else b''
        timestamp=str(int(self.now+age));nonce=nonce or str(uuid.uuid4())
        canonical='\n'.join((timestamp,nonce,owner,method,path,hashlib.sha256(raw).hexdigest()))
        headers={'x-q-member':owner,'x-q-time':timestamp,'x-q-nonce':nonce,'x-q-signature':hmac.new(SECRET.encode(),canonical.encode(),hashlib.sha256).hexdigest(),'Content-Type':'application/json'}
        return self.client.request(method,path,content=raw,headers=headers)

    def payload(self):return {'id':str(uuid.uuid4()),'question':'Compare public services','urls':['https://example.com/'],'scope_project_id':None}

    def until(self,id,status):
        for _ in range(120):
            result=self.signed('GET','/v1/jobs/'+id)
            if result.json()['status']==status:return result.json()
            time.sleep(.03)
        self.fail('Expected status '+status+', got '+str(result.json()))

    def test_authentication_and_interoperability(self):
        self.assertEqual(self.client.get('/healthz').json(),{'ok':True})
        self.assertEqual(self.client.get('/v1/status').status_code,401)
        self.assertEqual(self.signed('GET','/v1/status',age=-61).status_code,401)
        nonce=str(uuid.uuid4());self.assertEqual(self.signed('GET','/v1/status',nonce=nonce).status_code,200)
        self.assertEqual(self.signed('GET','/v1/status',nonce=nonce).status_code,401)
        self.assertEqual(signature(SECRET,'1700000000','00000000-0000-4000-8000-000000000020',OWNER,'POST','/v1/jobs',b'{}'),'643ee223c95c22fd79f0a2f5399dbdd4ab2e9043965f9aa0ec21eb962ea9faed')
        r=self.signed('GET','/v1/status');self.assertIn('no-store',r.headers['cache-control']);self.assertNotIn(SECRET,r.text);self.assertNotIn('test-only-not-real',r.text)
        self.assertEqual(r.json()['usage']['reset_zone'],'Africa/Johannesburg')

    def test_idempotency_ownership_stop_and_limits(self):
        first=self.payload();r=self.signed('POST','/v1/jobs',first);self.assertEqual(r.status_code,200,r.text)
        self.until(first['id'],'running')
        self.reject_dns=True
        self.assertEqual(self.signed('POST','/v1/jobs',first).status_code,200,'A retry must not repeat DNS validation or create paid work')
        self.reject_dns=False
        self.assertEqual(self.signed('POST','/v1/jobs',{**first,'question':'Changed'}).json()['code'],'id_conflict')
        self.assertEqual(self.signed('GET','/v1/jobs/'+first['id'],owner=OTHER).status_code,404)
        self.assertEqual(self.signed('POST','/v1/jobs/'+first['id']+'/stop',{},owner=OTHER).status_code,404)
        self.assertEqual(self.signed('POST','/v1/jobs',self.payload()).json()['code'],'active_job')
        self.assertEqual(self.signed('POST','/v1/jobs/'+first['id']+'/stop',{}).status_code,200)
        self.until(first['id'],'cancelled');self.assertEqual(self.started,[first['id']])
        second=self.payload();self.release=True;self.assertEqual(self.signed('POST','/v1/jobs',second).status_code,200);self.until(second['id'],'done')
        self.assertEqual(self.signed('POST','/v1/jobs',self.payload()).json()['code'],'quota_reached')
        self.assertEqual(self.signed('GET','/v1/latest').json()['id'],second['id'])
        self.assertIsNone(self.signed('GET','/v1/latest',owner=OTHER).json()['id'])
        self.assertEqual(self.signed('GET','/v1/status').json()['usage']['member_runs'],2)
        self.assertEqual(self.signed('POST','/v1/jobs',self.payload(),owner=OTHER).status_code,200)
        self.assertEqual(self.signed('POST','/v1/jobs',self.payload(),owner=OTHER).json()['code'],'quota_reached')

    def test_invalid_input_never_queues(self):
        for bad in ['http://example.com','https://127.0.0.1','https://example.local','https://user:pass@example.com','https://example.com:8080','file:///etc/passwd','https://example.com/\nheader']:
            r=self.signed('POST','/v1/jobs',{**self.payload(),'urls':[bad]});self.assertEqual(r.status_code,400,(bad,r.text))
        self.assertEqual(self.signed('POST','/v1/jobs',{**self.payload(),'private_context':'never allowed'}).status_code,400)
        self.assertEqual(self.signed('GET','/v1/status').json()['usage']['member_runs'],0)
        self.assertFalse(self.started)


class StoreTest(unittest.TestCase):
    def test_cleanup_uses_only_registered_agent_and_owned_profile(self):
        with tempfile.TemporaryDirectory() as temp, tempfile.TemporaryDirectory(prefix='browser_use_agent_') as registered, tempfile.TemporaryDirectory(prefix='browser_use_agent_') as unrelated:
            data=Path(temp);profile=data/'profiles'/'research-interrupted';profile.mkdir(parents=True);(profile/'sample.txt').write_text('temporary public page')
            (data/'active-agent.json').write_text(json.dumps({'path':registered}))
            cleanup_interrupted_files(data)
            self.assertFalse(profile.exists());self.assertFalse(Path(registered).exists());self.assertTrue(Path(unrelated).is_dir());self.assertFalse((data/'active-agent.json').exists())

    def test_restart_quota_day_retention_and_two_connection_admission(self):
        with tempfile.TemporaryDirectory() as temp:
            settings=Settings(Path(temp),SECRET,'test',member_daily=1)
            # 23:59 then 00:01 in Johannesburg, two distinct local-day buckets.
            now=[datetime(2026,11,16,21,59,tzinfo=timezone.utc).timestamp()];a=Store(settings,lambda:now[0]);b=Store(settings,lambda:now[0])
            p={'id':str(uuid.uuid4()),'question':'Test','urls':['https://example.com/'],'scope_project_id':None}
            a.create(p,OWNER)
            with self.assertRaises(Rejected):b.create({**p,'id':str(uuid.uuid4())},OWNER)
            a.recover();self.assertEqual(b.get(p['id'])['status'],'cancelled')
            self.assertEqual(b.usage(OWNER)['member_runs'],1)
            self.assertEqual(a.day(),'2026-11-16');now[0]+=120;self.assertEqual(a.day(),'2026-11-17');self.assertEqual(b.usage(OWNER)['member_runs'],0)
            b.create({**p,'id':str(uuid.uuid4())},OWNER);b.recover();now[0]+=15*86400;a.prune()
            self.assertIsNone(a.latest(OWNER));a.close();b.close()


class NetworkTest(unittest.IsolatedAsyncioTestCase):
    async def test_proxy_blocks_private_and_pins_public_dns(self):
        for ip in ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','100.64.0.1','224.0.0.1']:
            self.assertFalse(public_ip(ip),ip)
        self.assertTrue(public_ip('1.1.1.1'))
        attempts=[]
        async def private(host):return ['169.254.169.254']
        async def dial(host,port):attempts.append((host,port));raise OSError('fixture closes before connection')
        async with PublicProxy(resolver=private,dial=dial) as proxy:
            port=int(proxy.url.rsplit(':',1)[1]);r,w=await asyncio.open_connection('127.0.0.1',port)
            w.write(b'CONNECT public.example.com:443 HTTP/1.1\r\n\r\n');await w.drain();self.assertIn(b'403',await r.read());w.close();await w.wait_closed()
        self.assertEqual(attempts,[])
        async def public(host):return ['1.1.1.1']
        async with PublicProxy(resolver=public,dial=dial) as proxy:
            port=int(proxy.url.rsplit(':',1)[1]);r,w=await asyncio.open_connection('127.0.0.1',port)
            w.write(b'CONNECT example.com:443 HTTP/1.1\r\n\r\n');await w.drain();await r.read();w.close();await w.wait_closed()
        self.assertEqual(attempts,[('1.1.1.1',443)],'Connect must use a checked numeric address, never resolve the hostname again')


if __name__=='__main__':unittest.main(verbosity=2)

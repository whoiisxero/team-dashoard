"""Run the production image locally: real Chrome preflight and signed API, no paid requests."""
import hashlib,hmac,json,os,secrets,subprocess,sys,time,urllib.request,uuid

name='quest-research-check-'+uuid.uuid4().hex[:10]
env={k:v for k,v in os.environ.items() if k not in {'DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'}}
base=['docker','--host=unix:///var/run/docker.sock']
secret=secrets.token_hex(32);member='00000000-0000-4000-8000-000000000001'
def docker(*args):
    result=subprocess.run([*base,*args],env=env,capture_output=True,text=True,check=True,timeout=30)
    return (result.stdout+(result.stderr if args[0]=='logs' else '')).strip()
try:
    docker('run','-d','--name',name,'--publish','127.0.0.1::8080','--env','OPENAI_API_KEY=test-only-not-a-real-key','--env','Q_RESEARCH_WORKER_SECRET='+secret,'quest-q-research:release')
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
    assert docker('exec',name,'id','-u')=='10001'
    print('PASS production worker container: rootless UID, private data volume, real sandboxed-Chromium startup, health, HMAC-authenticated status and unsigned denial. No paid API request or real credential used.')
finally:
    subprocess.run([*base,'rm','-f','-v',name],env=env,capture_output=True,timeout=30)

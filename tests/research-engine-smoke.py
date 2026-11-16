"""Real Browser Use, Chromium, TLS and public-only proxy. OpenAI is a transport fixture."""
import asyncio,io,json,logging,ssl,sys,tempfile,threading,subprocess
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from worker.settings import Settings,privacy_environment
from worker.public_web import PublicProxy
from worker.engine import run_research,read_tools,READ_ACTIONS


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        body=b'<html><title>Public research fixture</title><body><h1>Cape Town sample studio</h1><p>Services: product photography and campaign design.</p><p>Reference marker: QUEST_RESEARCH_TLS_PROXY_VERIFIED</p><img src="https://169.254.169.254/latest/meta-data/"></body></html>'
        self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(body)


async def main():
 with tempfile.TemporaryDirectory() as temp:
    data=Path(temp);settings=Settings(data,'test-worker-secret-01234567890123456789','test-not-a-real-key');privacy_environment(data)
    import httpx
    import browser_use
    from browser_use import Agent, Browser, BrowserProfile, ChatOpenAI
    cert=data/'cert.pem';key=data/'key.pem'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=example.com'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(cert,key);server.socket=ctx.wrap_socket(server.socket,server_side=True)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    dialed=[];resolved=[];calls=[];cancelling=False;at_model=asyncio.Event()
    async def resolve(host,port=443):
        resolved.append(host)
        if host=='169.254.169.254':return ['169.254.169.254']
        if host not in ('example.com','www.example.com'):raise ValueError('invalid_sources')
        return ['1.1.1.1']
    async def dial(host,port):
        assert host=='1.1.1.1' and port==443
        dialed.append((host,port));return await asyncio.open_connection('127.0.0.1',server.server_port)
    profile_class=browser_use.BrowserProfile
    def profile(**kw):
        assert kw['proxy'].bypass=='<-loopback>' and kw['block_ip_addresses'] is True
        assert kw['accept_downloads'] is False and kw['use_cloud'] is False
        # Only this fixture permits a self-signed TLS server and container Chrome.
        kw['chromium_sandbox']=False;kw['args']+=['--ignore-certificate-errors']
        return profile_class(**kw)
    async def model_response(request):
        content=json.loads(request.content);calls.append(content)
        assert 'QUEST_RESEARCH_TLS_PROXY_VERIFIED' in json.dumps(content['messages'])
        assert content['max_completion_tokens']==1500
        if cancelling:at_model.set();await asyncio.sleep(60)
        result={'thinking':'Read the fixture page.','evaluation_previous_goal':'Page loaded through the public-only proxy.','memory':'Two studio services.','next_goal':'Return cited findings.','action':[{'done':{'text':'The sample studio offers product photography and campaign design. Source: https://example.com/','success':True}}]}
        return httpx.Response(200,json={'id':'research-fixture','object':'chat.completion','created':0,'model':content['model'],'choices':[{'index':0,'message':{'role':'assistant','content':json.dumps(result)},'finish_reason':'stop'}],'usage':{'prompt_tokens':1200,'completion_tokens':60,'total_tokens':1260}})
    client=httpx.AsyncClient(transport=httpx.MockTransport(model_response))
    def model(name,key):return ChatOpenAI(model=name,api_key=key,http_client=client,max_retries=0,max_completion_tokens=1500)
    def job():return {'question':'What services does this studio offer?','urls':['https://example.com/'],'events':[],'sources':[],'calls':0,'input_tokens':0,'output_tokens':0}
    before=set(Path(tempfile.gettempdir()).glob('browser_use_agent_*'))
    log_text=io.StringIO();log_handler=logging.StreamHandler(log_text);logging.getLogger().addHandler(log_handler)
    try:
        tools=read_tools();assert set(tools.registry.registry.actions)<=READ_ACTIONS
        with patch('worker.public_web.resolve_public',resolve),patch('worker.public_web.PublicProxy',lambda:PublicProxy(resolver=resolve,dial=dial)),patch('browser_use.BrowserProfile',profile):
            first=job();result=await run_research(first,settings.api_key,settings.model,settings,llm_factory=model)
            assert result['status']=='done',result
            assert first['calls']==1 and first['input_tokens']==1200 and first['output_tokens']==60
            assert 'https://example.com/' in first['sources']
            assert dialed,'Chromium must use the proxy, not a direct route'
            assert '169.254.169.254' in resolved,'The malicious metadata subresource must reach the proxy guard'
            assert not list((data/'profiles').glob('research-*'))
            cancelling=True;second=job();task=asyncio.create_task(run_research(second,settings.api_key,settings.model,settings,llm_factory=model))
            await asyncio.wait_for(at_model.wait(),25);task.cancel();await asyncio.wait_for(asyncio.gather(task,return_exceptions=True),25)
            assert not list((data/'profiles').glob('research-*')),'Cancelled profiles must be removed'
        assert set(Path(tempfile.gettempdir()).glob('browser_use_agent_*'))==before,'Agent screenshot folders must also be removed'
        assert 'What services does this studio offer?' not in log_text.getvalue(),'Host logs must not contain the research question'
        assert 'QUEST_RESEARCH_TLS_PROXY_VERIFIED' not in log_text.getvalue()
        print('PASS real Browser Use + Chromium + HTTPS proxy: real DOM reaches the OpenAI adapter, metadata subresource blocked, public DNS pinned, read-only tools, sources, usage, cancellation, browser/profile/screenshot cleanup. OpenAI response mocked; no paid API request.')
    finally:
        logging.getLogger().removeHandler(log_handler);await client.aclose();server.shutdown();server.server_close()


asyncio.run(main())

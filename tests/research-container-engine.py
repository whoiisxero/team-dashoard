"""Piped into the production container as the API UID; no paid model calls.

This deliberately uses a local HTTP page and allow_test_sources=True. The
separate TLS/proxy smoke test exercises the public-source transport guards.
"""
import asyncio,json,os,tempfile,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from worker.settings import Settings,privacy_environment
from worker.engine import run_research


class Page(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        body=b'<html><title>Container research fixture</title><body><h1>Sample studio</h1><p>Services: product photography and campaign design.</p><p>QUEST_CONTAINER_DOM_VERIFIED</p></body></html>'
        self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(body)


async def main():
    assert os.getuid()==10001
    assert os.environ['QUEST_BROWSER_EXECUTABLE']=='/app/worker/chromium_launcher.py'
    assert os.environ['Q_RESEARCH_BROWSER_SOCKET']=='/run/q-research/browser.sock'
    with tempfile.TemporaryDirectory(prefix='engine-check-',dir='/data') as directory:
        data=Path(directory);settings=Settings(data,'test-worker-secret-at-least-thirty-two-characters','test-only-not-a-real-key');privacy_environment(data)
        import httpx
        from browser_use import ChatOpenAI
        server=ThreadingHTTPServer(('127.0.0.1',0),Page);threading.Thread(target=server.serve_forever,daemon=True).start()
        source='http://127.0.0.1:'+str(server.server_port)+'/'
        waiting=asyncio.Event();cancel_mode=False;calls=[]
        async def response(request):
            payload=json.loads(request.content);calls.append(payload)
            assert 'QUEST_CONTAINER_DOM_VERIFIED' in json.dumps(payload['messages'])
            assert payload['max_completion_tokens']==1500
            if cancel_mode:waiting.set();await asyncio.Event().wait()
            result={'thinking':'Read the local test page.','evaluation_previous_goal':'The page was read.','memory':'Two services.','next_goal':'Return the finding.','action':[{'done':{'text':'Product photography and campaign design. Source: '+source,'success':True}}]}
            return httpx.Response(200,json={'id':'container-fixture','object':'chat.completion','created':0,'model':payload['model'],'choices':[{'index':0,'message':{'role':'assistant','content':json.dumps(result)},'finish_reason':'stop'}],'usage':{'prompt_tokens':1200,'completion_tokens':60,'total_tokens':1260}})
        client=httpx.AsyncClient(transport=httpx.MockTransport(response))
        def model(name,key):return ChatOpenAI(model=name,api_key=key,http_client=client,max_retries=0,max_completion_tokens=1500)
        def job():return {'question':'Which services does the studio offer?','urls':[source],'events':[],'sources':[],'calls':0,'input_tokens':0,'output_tokens':0}
        before=set(Path(tempfile.gettempdir()).glob('browser_use_agent_*'))
        try:
            first=job();result=await run_research(first,settings.api_key,settings.model,settings,llm_factory=model,allow_test_sources=True)
            assert result['status']=='done',result
            assert first['calls']==1 and first['input_tokens']==1200 and first['output_tokens']==60
            assert source in first['sources']
            assert not list((data/'profiles').iterdir())
            cancel_mode=True;second=job();task=asyncio.create_task(run_research(second,settings.api_key,settings.model,settings,llm_factory=model,allow_test_sources=True))
            await asyncio.wait_for(waiting.wait(),25);task.cancel();await asyncio.wait_for(asyncio.gather(task,return_exceptions=True),25)
            assert not list((data/'profiles').iterdir())
            assert not (data/'active-agent.json').exists()
            assert set(Path(tempfile.gettempdir()).glob('browser_use_agent_*'))==before
            print('PASS supervised Browser Use: real DOM reaches the model adapter; separate browser UID; two successive launches; token counts; completed/cancelled profile and screenshot cleanup. Local HTTP and mocked OpenAI transport only.')
        finally:
            await client.aclose();server.shutdown();server.server_close()


asyncio.run(main())

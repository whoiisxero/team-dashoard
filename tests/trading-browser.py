"""Built markets page, with deterministic provider responses (no live prices)."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
import json,subprocess
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root=Path(__file__).resolve().parents[1]
subprocess.run(['node','scripts/build.mjs'],cwd=root,check=True)
html=(root/'dist/index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','private-chats-fixture.js']).replace('</script','<\\/script')
html=html.replace('</script></body>',fixture+'</script></body>')
csp=next(header['value'] for entry in json.loads((root/'vercel.json').read_text())['headers'] for header in entry['headers'] if header['key']=='Content-Security-Policy')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root/'dist'),**kwargs)
    def log_message(self,*args):pass
    def end_headers(self):self.send_header('Content-Security-Policy',csp);super().end_headers()
    def do_GET(self):
        if self.path=='/':
            body=html.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:super().do_GET()

rows=[{'id':coin,'name':name,'symbol':symbol,'market_cap_rank':rank,'current_price':price,'price_change_percentage_24h':change,'last_updated':'2026-10-25T10:00:00Z'} for coin,name,symbol,rank,price,change in [
    ('bitcoin','Bitcoin','btc',1,100000,2.5),('ethereum','Ethereum','eth',2,5000,-1.25),('tether','Tether','usdt',3,1,0),('binancecoin','BNB','bnb',4,500,3),('usd-coin','USDC','usdc',5,1,None)]]
state={'fail_ranking':False,'fail_widgets':False,'invalid_ranking':False,'requests':[]}
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Africa/Johannesburg',reduced_motion='reduce')
        def route(request):
            url=request.request.url
            if url.startswith('https://api.coingecko.com/'):
                state['requests'].append({'url':url,'headers':request.request.headers})
                if state['fail_ranking']:return request.fulfill(status=429,json={'error':'Rate limit'})
                return request.fulfill(json=rows[:4] if state['invalid_ranking'] else list(reversed(rows)))
            if url.startswith('https://s3.tradingview.com/'):
                if state['fail_widgets']:return request.abort()
                kind='chart' if 'advanced-chart' in url else 'quotes'
                script="""(()=>{const script=document.currentScript;if(!script?.parentElement?.isConnected)return;const config=JSON.parse(script.textContent);(window.marketWidgetTests||=[]).push({kind:KIND,config});const frame=document.createElement('iframe');frame.src='https://www.tradingview-widget.com/embed-widget/'+KIND+'/';frame.style.cssText='width:100%;height:100%;border:0';script.parentElement.querySelector('.tradingview-widget-container__widget').append(frame);})();""".replace('KIND',json.dumps(kind))
                return request.fulfill(body=script,content_type='application/javascript')
            if url.startswith('https://www.tradingview-widget.com/'):
                return request.fulfill(body='<html><body style="background:#0c1510;color:#a2b6a7;font:14px sans-serif;padding:20px"><p>Provider test frame — no live market data.</p></body></html>',content_type='text/html')
            return request.fulfill(body='',content_type='text/css')
        context.route('https://**/*',route)
        page=context.new_page();errors=[];violations=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.add_init_script("document.addEventListener('securitypolicyviolation',event=>(window.cspViolations||=[]).push(event.blockedURI))")
        page.goto(base);page.wait_for_function('()=>window.ready&&document.querySelector("#trading")')
        assert len(state['requests'])==0
        assert page.locator('#tradingChartWidget iframe').count()==0
        page.locator('.sidebar [data-view=trading]').click()
        page.wait_for_function('()=>document.querySelector("#cryptoRankingTitle").textContent.startsWith("Top 5")&&window.marketWidgetTests?.length===2')
        page.wait_for_function('()=>document.querySelector("#tradingChartWidget").getAttribute("aria-busy")==="false"')
        assert page.locator('#trading h1').inner_text()=='Trading view'
        assert page.locator('.trading-coin').count()==5
        assert page.locator('.trading-coin strong').all_text_contents()==['Bitcoin','Ethereum','Tether','BNB','USDC']
        assert page.locator('[data-coin=bitcoin] .trading-coin-price').inner_text()=='$100,000.00'
        assert page.locator('[data-coin=ethereum] .trading-coin-change').inner_text()=='-1.25% · 24h'
        assert '24h change unavailable' in page.locator('[data-coin=usd-coin]').inner_text()
        assert '25 Oct' in page.locator('#cryptoRankingStatus').inner_text() and '12:00 SAST' in page.locator('#cryptoRankingStatus').inner_text()
        assert len(state['requests'])==1
        assert 'authorization' not in state['requests'][0]['headers']
        assert all(value not in state['requests'][0]['url'] for value in ['jen','quan','josh','tertius'])
        def config():return page.evaluate('marketWidgetTests.filter(item=>item.kind==="chart").at(-1).config')
        assert config()['symbol']=='BITSTAMP:BTCUSD' and config()['timezone']=='Africa/Johannesburg'
        quote=page.evaluate('marketWidgetTests.find(item=>item.kind==="quotes").config')
        assert len(quote['symbolsGroups'][0]['symbols'])==5 and len(quote['symbolsGroups'][1]['symbols'])==2
        for value in ['1','5','15','30','60','240','D','W']:
            page.locator(f'#tradingIntervals [data-interval="{value}"]').click()
            page.wait_for_function('(value)=>marketWidgetTests.filter(item=>item.kind==="chart").at(-1).config.interval===value',arg=value)
        for style in ['2','3','1']:
            page.locator('#tradingStyle').select_option(style)
            page.wait_for_function('(style)=>marketWidgetTests.filter(item=>item.kind==="chart").at(-1).config.style===style',arg=style)
        page.locator('[data-market=gold]').click();page.wait_for_function('()=>(marketWidgetTests.filter(item=>item.kind==="chart").at(-1).config.symbol==="OANDA:XAUUSD")')
        assert 'troy ounce' in page.locator('#tradingChartFeed').inner_text()
        page.locator('[data-market=wti]').click();page.wait_for_function('()=>(marketWidgetTests.filter(item=>item.kind==="chart").at(-1).config.symbol==="TVC:USOIL")')
        page.locator('[data-market=brent]').click();page.wait_for_function('()=>(marketWidgetTests.filter(item=>item.kind==="chart").at(-1).config.symbol==="TVC:UKOIL")')
        assert 'barrel' in page.locator('#tradingChartFeed').inner_text()
        page.locator('#tradingSymbol').select_option('tether');page.wait_for_function('()=>(marketWidgetTests.filter(item=>item.kind==="chart").at(-1).config.symbol==="KRAKEN:USDTUSD")')
        state['fail_ranking']=True;page.locator('#cryptoRankingRefresh').click();page.wait_for_function('()=>document.querySelector("#cryptoRankingStatus").textContent.includes("Refresh unavailable")')
        assert page.locator('[data-coin=bitcoin] .trading-coin-price').inner_text()=='$100,000.00'
        state['fail_widgets']=True;page.locator('#tradingChartRetry').click();page.wait_for_function('()=>document.querySelector("#tradingChartStatus").textContent.includes("unavailable")')
        assert 'could not be loaded' in page.locator('#tradingChartWidget').inner_text()
        assert 'KRAKEN%3AUSDTUSD' in page.locator('#tradingOpenChart').get_attribute('href')
        state['fail_widgets']=False;page.locator('#tradingChartRetry').click();page.wait_for_function('()=>document.querySelector("#tradingChartWidget").getAttribute("aria-busy")==="false"')
        context.set_offline(True);page.wait_for_function('()=>document.querySelector("#tradingChartStatus").textContent.includes("offline")')
        assert page.locator('#trading iframe').count()==0
        context.set_offline(False);page.wait_for_function('()=>document.querySelector("#tradingChartWidget iframe")!==null')
        state['fail_ranking']=False
        for uid in ['quan','tertius','josh','jen']:
            page.evaluate('(uid)=>accessTest.switchUser(uid)',uid)
            assert page.locator('#trading iframe').count()==0
            page.locator('.sidebar [data-view=trading]').click();page.wait_for_function('()=>document.querySelector("#tradingChartWidget iframe")!==null')
            assert page.locator('#trading').is_visible()
            if uid!='quan':assert page.locator('.sidebar [data-view=members]').is_hidden()
        # Leaving the view destroys streaming frames. Reopening uses the public
        # cached ranking without sending another request for each navigation.
        requests=len(state['requests']);page.locator('.sidebar .nav [data-view=overview]').click()
        assert page.locator('#trading iframe').count()==0
        page.locator('.sidebar [data-view=trading]').click();page.wait_for_function('()=>document.querySelector("#tradingChartWidget iframe")!==null')
        assert len(state['requests'])==requests
        for width,height in [(320,740),(390,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.locator('#tradingChartWidget').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
            assert page.locator('#tradingIntervals [data-interval="1"]').is_visible()
            assert page.locator('#tradingIntervals [data-interval="60"]').is_visible()
        page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/quest-trading-phone.png',animations='disabled')
        cached=page.evaluate('(async()=>{const urls=[];for(const key of await caches.keys())for(const request of await(await caches.open(key)).keys())urls.push(request.url);return urls})()')
        assert not any('coingecko' in url or 'tradingview' in url for url in cached)
        assert not page.evaluate('window.cspViolations||[]')
        assert not errors,errors
        # On a fresh visit a blocked ranking is labelled as a starter watchlist,
        # never presented as the current top five and never given made-up prices.
        state['fail_ranking']=True
        fallback=context.new_page();fallback.goto(base);fallback.wait_for_function('()=>window.ready&&document.querySelector("#trading")');fallback.evaluate("accessTest.navigate('trading')")
        fallback.wait_for_function('()=>document.querySelector("#cryptoRankingStatus").textContent.includes("Ranking unavailable")')
        assert fallback.locator('#cryptoRankingTitle').inner_text()=='Crypto watchlist'
        assert fallback.locator('.trading-coin-price').all_text_contents()==['View chart']*5
        state['fail_ranking']=False;state['invalid_ranking']=True;fallback.locator('#cryptoRankingRefresh').click()
        fallback.wait_for_function('()=>!document.querySelector("#cryptoRankingRefresh").disabled')
        assert fallback.locator('#cryptoRankingTitle').inner_text()=='Crypto watchlist'
        state['invalid_ranking']=False;fallback.locator('#cryptoRankingRefresh').click()
        fallback.wait_for_function('()=>document.querySelector("#cryptoRankingTitle").textContent.startsWith("Top 5")')
        browser.close()
    print('PASS trading page: ranked provider data including stablecoins, eight minute/hour/day/week intervals, three chart styles, commodity feeds/units, four member roles, no private payloads, delayed/failed/offline recovery, no fabricated quotes, mobile layouts, CSP integration and no provider API caching. TradingView and CoinGecko responses are mocked; provider-internal chart gestures/live availability require an online check.')
finally:server.shutdown();server.server_close()

/* Public market data only. No brokerage connection, orders or team data. */
window.createQuestMarkets=({getAccess})=>{
  const $=id=>document.getElementById(id);
  const node=(tag,text,cls='')=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
  const RANKING='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false';
  const FEEDS={bitcoin:'BITSTAMP:BTCUSD',ethereum:'BITSTAMP:ETHUSD',tether:'KRAKEN:USDTUSD','usd-coin':'KRAKEN:USDCUSD',binancecoin:'BINANCE:BNBUSDT',ripple:'BITSTAMP:XRPUSD',solana:'COINBASE:SOLUSD',dogecoin:'BINANCE:DOGEUSDT',tron:'BINANCE:TRXUSDT'};
  const cryptoAsset=(id,name,ticker)=>({id,name,ticker,group:'Crypto',symbol:FEEDS[id]||`CRYPTO:${ticker}USD`,unit:id==='binancecoin'||['dogecoin','tron'].includes(id)?'USDT pair':'USD pair'});
  const starters=[cryptoAsset('bitcoin','Bitcoin','BTC'),cryptoAsset('ethereum','Ethereum','ETH'),cryptoAsset('binancecoin','BNB','BNB'),cryptoAsset('ripple','XRP','XRP'),cryptoAsset('solana','Solana','SOL')];
  const metals=[
    {id:'gold',name:'Gold',ticker:'XAU',symbol:'OANDA:XAUUSD',unit:'USD / troy ounce · spot'},
    {id:'silver',name:'Silver',ticker:'XAG',symbol:'OANDA:XAGUSD',unit:'USD / troy ounce · spot'},
    {id:'platinum',name:'Platinum',ticker:'XPT',symbol:'OANDA:XPTUSD',unit:'USD / troy ounce · spot'},
    {id:'palladium',name:'Palladium',ticker:'XPD',symbol:'OANDA:XPDUSD',unit:'USD / troy ounce · spot'},
    {id:'copper',name:'Copper',ticker:'HG',symbol:'COMEX:HG1!',unit:'USD / pound · continuous futures'}
  ].map(asset=>({...asset,group:'Metals'}));
  const energy=[
    {id:'wti',name:'WTI crude oil',ticker:'WTI',symbol:'TVC:USOIL',unit:'USD / barrel · CFD'},
    {id:'brent',name:'Brent crude oil',ticker:'BRENT',symbol:'TVC:UKOIL',unit:'USD / barrel · CFD'}
  ].map(asset=>({...asset,group:'Oil'}));
  const intervals=[['1','1m'],['5','5m'],['15','15m'],['30','30m'],['60','1h'],['240','4h'],['D','1D'],['W','1W']];
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:value<1?6:2}).format(value);
  const timestamp=value=>new Date(value).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  let active=false,selected=starters[0],interval='60',style='1',coins=starters,ranked=false,updated=null,cachedAt=0,loading=false,request=0,controller=null,poll=null,chart=null,quotes=null;
  const view=document.createElement('section');view.id='trading';view.className='view trading-view';
  view.innerHTML=`<div class="title-row"><div><div class="eyebrow">Quest / Markets</div><h1>Trading view</h1><p>A window into crypto, precious metals and energy.</p></div><span class="trading-zone">Africa/Johannesburg · SAST</span></div>
    <section class="trading-crypto" aria-labelledby="cryptoRankingTitle"><div class="trading-section-head"><div><h2 id="cryptoRankingTitle">Crypto watchlist</h2><p id="cryptoRankingStatus" role="status">Open Trading view to load the top five by market cap.</p></div><button class="button" id="cryptoRankingRefresh" type="button">Refresh prices</button></div><div class="trading-coins" id="cryptoRanking"></div></section>
    <div class="trading-layout"><section class="card trading-chart-card" aria-labelledby="tradingChartTitle"><div class="trading-chart-heading"><div><div class="eyebrow" id="tradingChartGroup">Crypto</div><h2 id="tradingChartTitle">Bitcoin</h2><p id="tradingChartFeed"></p></div><a class="button trading-provider-link" id="tradingOpenChart" target="_blank" rel="noopener noreferrer">Open full chart ↗</a></div>
    <div class="trading-controls"><label>Market<select class="input" id="tradingSymbol"></select></label><label>Chart style<select class="input" id="tradingStyle"><option value="1">Candles</option><option value="2">Line</option><option value="3">Area</option></select></label></div>
    <div class="trading-intervals" id="tradingIntervals" role="group" aria-label="Chart interval"></div><p class="trading-status" id="tradingChartStatus" role="status"></p><div class="trading-chart-widget trading-widget" id="tradingChartWidget"></div>
    <div class="trading-chart-help"><p>Drag left or right to explore past dates. Move the crosshair over a candle for its price and time. Pinch or scroll to zoom.</p><button class="button" id="tradingChartRetry" type="button">Reload chart</button></div><p class="trading-fine">Available history and minute intervals depend on the selected market’s feed. Exchange-traded quotes may be delayed; the chart shows its provider’s timing.</p></section>
    <aside class="card trading-quotes-card" aria-labelledby="tradingQuotesTitle"><div class="trading-section-head"><div><div class="eyebrow">Watchlist</div><h2 id="tradingQuotesTitle">Metals &amp; oil</h2></div><button class="button" id="tradingQuotesRetry" type="button">Reload</button></div><div class="trading-market-buttons" id="tradingMarketButtons"></div><p class="trading-status" id="tradingQuotesStatus" role="status"></p><div class="trading-quotes-widget trading-widget" id="tradingQuotesWidget"></div><p class="trading-fine">Gold, silver, platinum and palladium use spot feeds. Copper uses continuous futures; oil uses CFD feeds. Select a market above to chart it.</p></aside></div>
    <p class="trading-sources">Crypto ranking and USD prices: <a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">CoinGecko</a>. Charts and commodity quotes: <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>. Stablecoins are included in the market-cap ranking.</p>`;
  document.querySelector('.content').append(view);
  const navButton=node('button','↗ Trading view');navButton.type='button';navButton.dataset.view='trading';
  document.querySelector('.sidebar .nav').append(navButton);
  for(const [value,label] of intervals){const button=node('button',label);button.type='button';button.dataset.interval=value;button.setAttribute('aria-pressed',String(value===interval));button.onclick=()=>{if(interval!==value){interval=value;renderSelection();mountChart();}};$('tradingIntervals').append(button);}
  for(const group of [metals,energy]){const section=document.createElement('div');section.className='trading-market-group';section.append(node('h3',group[0].group));for(const asset of group){const button=node('button',asset.name);button.type='button';button.dataset.market=asset.id;button.onclick=()=>choose(asset);section.append(button);}$('tradingMarketButtons').append(section);}

  function available(){const all=[...coins,...metals,...energy];if(!all.some(asset=>asset.id===selected.id))all.push(selected);return all;}
  function renderSelection(){
    const select=$('tradingSymbol');select.replaceChildren();
    for(const group of ['Crypto','Metals','Oil']){const options=document.createElement('optgroup');options.label=group;for(const asset of available().filter(asset=>asset.group===group)){const option=node('option',`${asset.name} · ${asset.ticker}`);option.value=asset.id;options.append(option);}select.append(options);}
    select.value=selected.id;$('tradingChartTitle').textContent=selected.name;$('tradingChartGroup').textContent=selected.group;
    $('tradingChartFeed').textContent=`${selected.symbol} · ${selected.unit}`;
    $('tradingOpenChart').href=`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(selected.symbol)}&interval=${encodeURIComponent(interval)}`;
    for(const button of $('tradingIntervals').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.interval===interval));
    for(const button of $('tradingMarketButtons').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.market===selected.id));
    for(const button of $('cryptoRanking').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.coin===selected.id));
  }
  function renderCoins(){
    $('cryptoRanking').replaceChildren();
    for(const coin of coins){const button=document.createElement('button');button.type='button';button.className='trading-coin';button.dataset.coin=coin.id;button.setAttribute('aria-pressed',String(coin.id===selected.id));
      const top=node('span','','trading-coin-top');top.append(node('small',ranked?`#${coin.rank}`:'Crypto'),node('span',coin.ticker));button.append(top,node('strong',coin.name));
      button.append(node('span',ranked?money(coin.price):'View chart','trading-coin-price'));
      const change=node('span',ranked&&coin.change!==null?`${coin.change>0?'+':''}${coin.change.toFixed(2)}% · 24h`:ranked?'24h change unavailable':coin.unit,'trading-coin-change');
      if(ranked&&coin.change!==null)change.classList.add(coin.change>=0?'positive':'negative');button.append(change);button.onclick=()=>choose(coin);$('cryptoRanking').append(button);
    }
    renderSelection();
  }
  function choose(asset){selected=asset;renderSelection();mountChart();}
  function rankingStatus(message){$('cryptoRankingStatus').textContent=message;}
  function setRankedStatus(failed=false){
    $('cryptoRankingTitle').textContent=ranked?'Top 5 crypto by market cap':'Crypto watchlist';
    rankingStatus(ranked?`${failed?'Refresh unavailable. Showing prices from':'Updated'} ${timestamp(updated)} SAST · USD${failed?' · retry when connected':''}`:'Ranking unavailable. Showing five major pairs; prices are available in the chart. Retry to load the current top five.');
  }
  async function loadRanking(force=false){
    if(!active||!getAccess()||loading)return;
    if(!force&&ranked&&Date.now()-cachedAt<300000){setRankedStatus();return;}
    if(navigator.onLine===false){setRankedStatus(true);return;}
    const current=++request;controller=new AbortController();const abort=controller;loading=true;$('cryptoRankingRefresh').disabled=true;
    rankingStatus('Loading the five largest cryptocurrencies by market cap…');
    const timer=setTimeout(()=>abort.abort(),12000);
    try{
      const response=await fetch(RANKING,{signal:abort.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error('Ranking unavailable');const rows=await response.json();
      if(!Array.isArray(rows)||rows.length!==5)throw new Error('Incomplete ranking');
      const result=rows.map(row=>{
        if(typeof row.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(row.id)||typeof row.name!=='string'||!row.name.trim()||typeof row.symbol!=='string'||! /^[a-z0-9]{1,15}$/i.test(row.symbol)||!Number.isFinite(row.current_price)||row.current_price<0||!Number.isInteger(row.market_cap_rank)||typeof row.last_updated!=='string'||!Number.isFinite(Date.parse(row.last_updated)))throw new Error('Invalid ranking');
        return {...cryptoAsset(row.id,row.name.slice(0,70),row.symbol.toUpperCase()),rank:row.market_cap_rank,price:row.current_price,change:Number.isFinite(row.price_change_percentage_24h)?row.price_change_percentage_24h:null,updated:Date.parse(row.last_updated)};
      }).sort((a,b)=>a.rank-b.rank);
      if(new Set(result.map(coin=>coin.id)).size!==5||result.some((coin,index)=>coin.rank!==index+1))throw new Error('Invalid market-cap order');
      if(current!==request||!active||!getAccess())return;
      coins=result;ranked=true;updated=Math.max(...result.map(coin=>coin.updated));cachedAt=Date.now();renderCoins();setRankedStatus();
    }catch{if(current===request&&active)setRankedStatus(true);}
    finally{clearTimeout(timer);if(current===request){loading=false;controller=null;$('cryptoRankingRefresh').disabled=false;}}
  }

  function embed(hostId,statusId,kind,config,title){
    const host=$(hostId),status=$(statusId);host.replaceChildren();host.setAttribute('aria-busy','true');status.textContent='Loading TradingView…';
    const wrap=document.createElement('div');wrap.className='tradingview-widget-container';
    const content=document.createElement('div');content.className='tradingview-widget-container__widget';wrap.append(content);
    const credit=document.createElement('div');credit.className='tradingview-widget-copyright';const link=node('a','Market data by TradingView');link.href='https://www.tradingview.com/';link.target='_blank';link.rel='noopener noreferrer';credit.append(link);wrap.append(credit);
    let destroyed=false,observing=true;const observer=new MutationObserver(()=>{
      const frame=wrap.querySelector('iframe');if(!frame||!observing)return;observing=false;observer.disconnect();frame.title=title;frame.allowFullscreen=true;
      frame.addEventListener('load',()=>{if(destroyed)return;clearTimeout(timer);host.setAttribute('aria-busy','false');status.textContent='TradingView feed · see the chart or quote table for availability and timing.';});
    });
    const fail=()=>{if(destroyed)return;clearTimeout(timer);observer.disconnect();host.setAttribute('aria-busy','false');host.replaceChildren(node('p','Market data could not be loaded. Check your connection, reload, or open the full chart.','trading-widget-error'));status.textContent='TradingView is unavailable in this window.';};
    const timer=setTimeout(fail,20000);observer.observe(wrap,{childList:true,subtree:true});
    const script=document.createElement('script');script.src=`https://s3.tradingview.com/external-embedding/embed-widget-${kind}.js`;script.async=true;script.textContent=JSON.stringify(config);script.onerror=fail;wrap.append(script);host.append(wrap);
    return {destroy(){destroyed=true;clearTimeout(timer);observer.disconnect();host.replaceChildren();host.setAttribute('aria-busy','false');}};
  }
  function mountChart(){
    chart?.destroy();chart=null;
    if(!active||!getAccess())return;
    if(navigator.onLine===false){$('tradingChartStatus').textContent='You’re offline. Reconnect, then reload the chart.';return;}
    chart=embed('tradingChartWidget','tradingChartStatus','advanced-chart',{
      autosize:true,symbol:selected.symbol,interval,timezone:'Africa/Johannesburg',theme:'dark',style,locale:'en',
      allow_symbol_change:false,hide_top_toolbar:true,hide_side_toolbar:innerWidth<680,withdateranges:true,hide_legend:false,
      hide_volume:false,save_image:true,calendar:false,backgroundColor:'#0c1510',gridColor:'rgba(162,182,167,0.10)',support_host:'https://www.tradingview.com'
    },`${selected.name} interactive price chart`);
  }
  function mountQuotes(){
    quotes?.destroy();quotes=null;
    if(!active||!getAccess())return;
    if(navigator.onLine===false){$('tradingQuotesStatus').textContent='You’re offline. Reconnect to load commodity quotes.';return;}
    quotes=embed('tradingQuotesWidget','tradingQuotesStatus','market-quotes',{
      width:'100%',height:'100%',colorTheme:'dark',isTransparent:true,locale:'en',
      symbolsGroups:[metals,energy].map(group=>({name:group[0].group,symbols:group.map(asset=>({name:asset.symbol,displayName:asset.name}))}))
    },'Metals and oil market quotes');
  }
  function stop(){active=false;request++;controller?.abort();controller=null;loading=false;$('cryptoRankingRefresh').disabled=false;if(poll)clearInterval(poll);poll=null;chart?.destroy();chart=null;quotes?.destroy();quotes=null;}
  function activate(id){
    if(id!=='trading'||!getAccess()){if(active)stop();return;}
    if(active)return;active=true;renderCoins();mountChart();mountQuotes();void loadRanking();
    poll=setInterval(()=>{if(!document.hidden)void loadRanking();},60000);
  }
  $('tradingSymbol').onchange=event=>{const asset=available().find(asset=>asset.id===event.target.value);if(asset)choose(asset);};
  $('tradingStyle').onchange=event=>{if(['1','2','3'].includes(event.target.value)){style=event.target.value;mountChart();}};
  $('cryptoRankingRefresh').onclick=()=>void loadRanking(true);$('tradingChartRetry').onclick=mountChart;$('tradingQuotesRetry').onclick=mountQuotes;
  window.addEventListener('online',()=>{if(active&&getAccess()){mountChart();mountQuotes();void loadRanking();}});
  window.addEventListener('offline',()=>{if(active){request++;controller?.abort();loading=false;$('cryptoRankingRefresh').disabled=false;setRankedStatus(true);mountChart();mountQuotes();}});
  renderCoins();
  return {activate,reset(){stop();}};
};

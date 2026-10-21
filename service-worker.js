/* The build supplies an exact public-asset allowlist. No API or page data is cached. */
const RELEASE='__QUEST_RELEASE__';
const PUBLIC_ASSETS=__QUEST_PUBLIC_ASSETS__;
const CACHE=`quest-public-${RELEASE}`;
const allowed=new Set(PUBLIC_ASSETS.map(path=>new URL(path,self.location.origin).href));
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(PUBLIC_ASSETS.map(async path=>{
      const response=await fetch(new Request(path,{cache:'reload',credentials:'omit'}));
      if(!response.ok)throw new Error('Public app assets could not load.');
      await cache.put(path,response);
    }));
    // A running app keeps its current code until the person chooses Update.
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=(await caches.keys()).filter(key=>key.startsWith('quest-public-'));
    // Keep one previous public release for tabs still finishing their work.
    const old=keys.filter(key=>key!==CACHE);
    await Promise.all(old.slice(0,-1).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||request.headers.has('authorization'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{return await fetch(request);}catch{
        return (await caches.open(CACHE)).match('/offline.html');
      }
    })());return;
  }
  if(url.search||!allowed.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(request);
    return cached||fetch(request);
  })());
});

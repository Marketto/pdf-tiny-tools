// Cache offline. Il nome qui sotto viene cambiato a ogni pubblicazione da .github/workflows/pages.yml:
// non modificarlo a mano.
const CACHE="schiaccia-pdf-v3";
const CORE=["./","index.html","manifest.webmanifest","i18n.js","engine.js","vendor/pdf-lib.min.js","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];

// All'installazione i file si scaricano saltando la cache del browser: altrimenti, subito dopo
// una pubblicazione, nella cache nuova finirebbe la pagina vecchia.
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE)
    .then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:"reload"}))))
    .then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

// Librerie, icone e font cambiano di rado: prima la cache. JSZip, Mediabunny e Tesseract (con i dati delle lingue)
// non sono in CORE: entrano in cache la prima volta che servono (R-APP-04).
async function cacheFirst(c,r,own){
  const hit=await c.match(r,{ignoreSearch:own});
  if(hit)return hit;
  const res=await fetch(r);
  if(res&&(res.ok||res.type==="opaque"))c.put(r,res.clone());
  return res;
}
// Pagina e testi: prima la rete, così una versione nuova si vede subito; la cache serve
// quando la rete manca o non risponde entro quattro secondi.
async function networkFirst(c,r){
  const live=fetch(r.url,{cache:"no-cache"}).then(res=>{
    if(res&&res.ok)c.put(r,res.clone());
    return res;
  });
  const slow=new Promise((_,no)=>setTimeout(()=>no(new Error("lenta")),4000));
  try{return await Promise.race([live,slow])}
  catch(err){
    const hit=await c.match(r,{ignoreSearch:true})||(r.mode==="navigate"?await c.match("index.html"):undefined);
    if(hit){live.catch(()=>{});return hit}
    return live;
  }
}
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url),own=u.origin===location.origin,font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(!own&&!font)return;
  const fixed=font||/\/(vendor|icons)\/|favicon\.ico$/.test(u.pathname);
  e.respondWith(caches.open(CACHE).then(c=>fixed?cacheFirst(c,r,own):networkFirst(c,r)));
});

// Notifica a lavoro finito (R-APP-08): toccandola si torna all'app aperta, o la si apre.
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list)if("focus" in c)return c.focus();
    return self.clients.openWindow("./");
  }));
});

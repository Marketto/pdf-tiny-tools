// Cache offline. Il nome qui sotto viene cambiato a ogni pubblicazione da .github/workflows/pages.yml:
// non modificarlo a mano.
const CACHE="schiaccia-pdf-v3";
// Moduli scaricati quando servono (librerie in vendor/, testi delle lingue in i18n/, font): questa cache
// non cambia nome e sopravvive agli aggiornamenti (R-APP-16). Ogni modulo è salvato con la sua impronta,
// presa da moduli.json (generato da tools/moduli.mjs alla pubblicazione): se una versione nuova cambia
// un modulo, quello si riscarica la prima volta che serve; gli altri restano.
const MODS="schiaccia-moduli";
const CORE=["./","index.html","manifest.webmanifest","config.js","i18n/index.js","engine.js","icons/icon.svg","icons/icon-192.png","icons/badge-96.png","icons/icon-512.png","icons/apple-touch-icon.png"];
const BASE=new URL("./",self.location.href);

// All'installazione i file si scaricano saltando la cache del browser: altrimenti, subito dopo
// una pubblicazione, nella cache nuova finirebbe la pagina vecchia.
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE)
    .then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:"reload"})))
      .then(()=>fetch("moduli.json",{cache:"reload"}).then(r=>r.ok&&c.put("moduli.json",r)).catch(()=>{})))
    .then(()=>self.skipWaiting()));
});
// All'attivazione: via le cache delle versioni vecchie e i moduli che l'app non usa più.
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==MODS).map(k=>caches.delete(k))))
    .then(()=>{MAP=null;return modMap()})
    .then(async map=>{
      if(!Object.keys(map).length)return;
      const c=await caches.open(MODS);
      for(const k of await c.keys()){
        const u=new URL(k.url);if(u.origin!==BASE.origin)continue;
        if(!(rel(u) in map))await c.delete(k);
      }
    })
    .then(()=>self.clients.claim()));
});

let MAP=null;
async function modMap(){
  if(MAP)return MAP;
  try{const r=await (await caches.open(CACHE)).match("moduli.json");MAP=r?await r.json():{}}catch(err){MAP={}}
  return MAP;
}
function rel(u){return decodeURIComponent(u.pathname.slice(BASE.pathname.length))}
function isMod(p){return /^vendor\//.test(p)||/^i18n\/[a-z]{2}\.js$/.test(p)}

// Modulo: dalla cache se c'è con l'impronta giusta; altrimenti dalla rete, e la copia vecchia dello stesso
// file si toglie. Senza rete, meglio la copia vecchia che niente.
async function modFetch(r,p){
  const map=await modMap(),h=map[p]||"dev",key=new URL(p+"?v="+h,BASE).href,c=await caches.open(MODS);
  const hit=await c.match(key);if(hit)return hit;
  const same=k=>k.url.split("?")[0]===key.split("?")[0];
  try{
    const res=await fetch(r.url,{cache:h==="dev"?"no-cache":"reload"});
    if(res&&res.ok){
      await c.put(key,res.clone());
      for(const k of await c.keys())if(k.url!==key&&same(k))await c.delete(k);
    }
    return res;
  }catch(err){
    for(const k of await c.keys())if(same(k))return c.match(k);
    throw err;
  }
}
// Font e icone cambiano di rado: prima la cache. I font stanno tra i moduli che restano.
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
  if(font){e.respondWith(caches.open(MODS).then(c=>cacheFirst(c,r,false)));return}
  const p=rel(u);
  if(isMod(p)){e.respondWith(modFetch(r,p));return}
  const fixed=/^icons\/|favicon\.ico$/.test(p);
  e.respondWith(caches.open(CACHE).then(c=>fixed?cacheFirst(c,r,true):networkFirst(c,r)));
});

// Notifica a lavoro finito (R-APP-08): toccandola si torna all'app aperta, o la si apre.
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list)if("focus" in c)return c.focus();
    return self.clients.openWindow("./");
  }));
});

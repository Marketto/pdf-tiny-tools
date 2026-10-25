/* Motore di Schiaccia (R-APP-20): la compressione di PDF, foto JPG e video, la stessa per la pagina e per altre app.
   Script classico, senza dipendenze: va caricato dopo config.js (window.CONFIG). Carica da solo, dalla sua cartella,
   engine.js (il motore delle immagini, nei worker), vendor/pdf-lib.min.js e vendor/mediabunny.min.mjs, solo quando servono.
   Nessuna chiamata di rete con i file. API pubblica: window.Motore (vedi in fondo e docs/ARCHITETTURA.md). */
(function (G) {
"use strict";
var CFG=G.CONFIG;
/* cartella da cui caricare i propri file: quella di motore.js, o quella data con setBase */
var BASE=(function(){try{var s=G.document&&G.document.currentScript;return new URL("./",s&&s.src?s.src:G.location.href).href}catch(e){return "./"}})();
function url(p){return new URL(p,new URL(BASE,G.location.href)).href}
var scriptP={};
function loadScript(src){
  var u=url(src);
  return scriptP[u]||(scriptP[u]=new Promise(function(res,rej){
    var sc=G.document.createElement("script");sc.src=u;sc.onload=res;sc.onerror=function(){scriptP[u]=null;rej(new Error(src))};G.document.head.appendChild(sc);
  }));
}
/* misure dei tempi: la pagina mette qui la sua funzione perf (?perf=1) */
function perf(label,t0){if(M0.onPerf)try{M0.onPerf(label,t0)}catch(e){}}
var isIOS=/iPad|iPhone|iPod/.test(G.navigator.userAgent)||(G.navigator.platform==="MacIntel"&&G.navigator.maxTouchPoints>1);
function ab(ctl){return !!(ctl&&ctl.aborted&&ctl.aborted())}
async function remember(ctl,it,rec){if(ctl&&ctl.remember)try{await ctl.remember(it,rec)}catch(e){}}
var tmpSeq=0;

/* ---------- PDF (R-CMP): pdf-lib si carica alla prima compressione (R-APP-04) ---------- */
var L={};
async function pdfLib(){if(!G.PDFLib)try{await loadScript("vendor/pdf-lib.min.js")}catch(e){}L=G.PDFLib||{};return L.PDFDocument?L:null}
function N(s){return L.PDFName.of(s)}
function num(d,k){var v=d.lookup(N(k));return v instanceof L.PDFNumber?v.asNumber():undefined}
function comps(d){
  var cs=d.lookup(N("ColorSpace"));
  if(cs===N("DeviceRGB"))return 3;
  if(cs===N("DeviceGray"))return 1;
  if(cs instanceof L.PDFArray&&cs.size()===2&&cs.lookup(0)===N("ICCBased")){
    var p=cs.lookup(1),n=p&&p.dict?num(p.dict,"N"):0;
    if(n===1||n===3)return n;
  }
  return 0;
}
function filterOf(d){
  var f=d.lookup(N("Filter"));
  if(f instanceof L.PDFArray){if(f.size()!==1)return null;f=f.lookup(0)}
  return f||null;
}

/* un'immagine del PDF: i controlli e la sostituzione qui, la ricompressione nel motore (engine.js) */
async function squeezeImage(ctx,ref,st,preset){
  var d=st.dict,w=num(d,"Width"),h=num(d,"Height");
  if(!w||!h||w*h<4096||w*h>60e6)return false;
  if(d.has(N("Mask"))||d.has(N("Decode"))||d.has(N("ImageMask")))return false;
  if(num(d,"BitsPerComponent")!==8)return false;
  var n=comps(d);if(!n)return false;
  var f=filterOf(d),task={kind:"img",w:w,h:h,n:n,max:preset.max,q:preset.q,pred:1};
  if(f===N("DCTDecode"))task.dct=true;
  else if(f===N("FlateDecode")){
    var dp=d.lookup(N("DecodeParms"));if(dp instanceof L.PDFArray)dp=dp.lookup(0);
    if(dp instanceof L.PDFDict){task.pred=num(dp,"Predictor")||1;task.cols=num(dp,"Columns");task.colors=num(dp,"Colors")}
  }else return false;
  task.contents=st.contents.slice();
  var r=await runTask(task,[task.contents.buffer]);
  if(!r||r.bytes.length>=st.contents.length*CFG.pdf.imageKeep)return false;
  var ns=ctx.stream(r.bytes,{Type:"XObject",Subtype:"Image",Width:r.w,Height:r.h,ColorSpace:"DeviceRGB",BitsPerComponent:8,Filter:"DCTDecode"});
  var sm=d.get(N("SMask"));if(sm)ns.dict.set(N("SMask"),sm);
  ctx.assign(ref,ns);
  return true;
}


/* ---------- worker: il motore delle immagini in parallelo (R-APP-09) ---------- */
var pool=null,poolP=null,taskId=0;
function poolSize(){
  var c=navigator.hardwareConcurrency||2,m=navigator.deviceMemory||4,n=Math.min(4,Math.max(2,c-1));
  if(m<=2)n=1;else if(m<=4)n=Math.min(n,2);
  try{var f=new URLSearchParams(G.location.search).get("workers");if(f!==null&&+f>=0)n=+f}catch(e){}
  return n;
}
function startPool(){
  if(poolP)return poolP;
  poolP=(async function(){
    var n=poolSize();
    if(n&&G.Worker&&G.OffscreenCanvas){
      try{
        var ws=[];for(var i=0;i<n;i++)ws.push(new Worker(url("engine.js")));
        var ok=await new Promise(function(res){
          var t=setTimeout(function(){res(false)},4000);
          ws[0].onmessage=function(e){clearTimeout(t);res(!!e.data.ok)};ws[0].onerror=function(){clearTimeout(t);res(false)};
          ws[0].postMessage({kind:"ping",id:0});
        });
        if(ok){
          pool={free:ws.slice(),queue:[],wait:{}};
          ws.forEach(function(w){
            w.onmessage=function(e){
              var m=e.data,j=pool.wait[m.id];if(!j)return;
              if(m.pct!=null){if(j.onPct)j.onPct(m.pct);return}
              delete pool.wait[m.id];pool.free.push(w);pump();
              if(m.ok)j.res(m.r);else j.rej(new Error(m.err));
            };
          });
          return pool;
        }
        ws.forEach(function(w){w.terminate()});
      }catch(e){}
    }
    pool=false;
    await loadScript("engine.js");
    return pool;
  })();
  return poolP;
}
function pump(){
  while(pool&&pool.free.length&&pool.queue.length){
    var w=pool.free.pop(),j=pool.queue.shift();pool.wait[j.msg.id]=j;w.postMessage(j.msg,j.transfer||[]);
  }
}
async function poolWidth(){await startPool();return pool?pool.free.length+Object.keys(pool.wait).length:1}
async function runTask(msg,transfer,onPct){
  await startPool();
  msg.id=++taskId;
  if(!pool)return msg.kind==="img"?G.Engine.recompress(msg):G.Engine.squeezeJpgFile(msg,onPct);
  return new Promise(function(res,rej){pool.queue.push({msg:msg,transfer:transfer,res:res,rej:rej,onPct:onPct});pump()});
}


/* ---------- foto e PDF ---------- */
async function squeezeJpg(file,o,onPct){
  var tp=performance.now();try{return await squeezeJpg0(file,o,onPct)}finally{perf("jpg",tp)}
}
async function squeezeJpg0(file,o,onPct){
  var r=await runTask({kind:"jpg",file:file,side:o.side,q:o.q,ios:isIOS},null,onPct);
  return {blob:new Blob([r.bytes],{type:"image/jpeg"}),images:1,changed:1};
}

async function squeezePdf(file,preset,onPct){
  var tp=performance.now();try{return await squeezePdf0(file,preset,onPct)}finally{perf("pdf",tp)}
}
async function squeezePdf0(file,preset,onPct){
  var bytes=new Uint8Array(await file.arrayBuffer());
  if(!await pdfLib())throw new Error("engine");
  var doc=await L.PDFDocument.load(bytes,{updateMetadata:false});
  var ctx=doc.context,all=ctx.enumerateIndirectObjects(),masks={},todo=[];
  all.forEach(function(p){
    var o=p[1];
    if(o instanceof L.PDFRawStream){var m=o.dict.get(N("SMask"));if(m instanceof L.PDFRef)masks[m.toString()]=1}
  });
  all.forEach(function(p){
    var o=p[1];
    if(o instanceof L.PDFRawStream&&o.dict.lookup(N("Subtype"))===N("Image")&&!masks[p[0].toString()])todo.push(p);
  });
  var changed=0,doneN=0,next=0,width=await poolWidth();
  /* le immagini vanno ai worker in parallelo (R-APP-09); la sostituzione nel PDF resta qui */
  async function lane(){
    while(next<todo.length){
      var p=todo[next++];
      try{if(await squeezeImage(ctx,p[0],p[1],preset))changed++}catch(e){}
      onPct(Math.round(++doneN/todo.length*95));
    }
  }
  var lanes=[];for(var l=0;l<Math.min(width,todo.length);l++)lanes.push(lane());
  await Promise.all(lanes);
  var out=await doc.save({useObjectStreams:true});
  return {blob:new Blob([out],{type:"application/pdf"}),images:todo.length,changed:changed};
}


/* ---------- video (R-VID): Mediabunny si carica solo qui, la prima volta ---------- */
var MB=null,codecP=null;
var AAC=CFG.video.aacBitrate;
/* oltre questa stima il risultato va su disco, nella cartella privata del browser (R-VID-14) */
var SAFE=(navigator.deviceMemory?Math.min(CFG.video.safe.maxMB,navigator.deviceMemory*CFG.video.safe.memPerGbMB):CFG.video.safe.defaultMB)*1048576,TMP="schiaccia-tmp";
try{var sv=+new URLSearchParams(G.location.search).get("safe");if(sv>0)SAFE=sv}catch(e){}
function isBig(it){return !!(it.plan&&it.plan.bytes>SAFE)}
async function tmpDir(create){var r=await navigator.storage.getDirectory();return r.getDirectoryHandle(TMP,{create:!!create})}
async function dropTmp(it){if(it&&it.tmpName){try{await (await tmpDir()).removeEntry(it.tmpName)}catch(e){}it.tmpName=null}}
async function canDisk(bytes){
  try{
    if(!navigator.storage||!navigator.storage.getDirectory||!G.FileSystemFileHandle||!G.FileSystemFileHandle.prototype.createWritable)return false;
    var est=await navigator.storage.estimate();
    return !est.quota||est.quota-(est.usage||0)>bytes*1.1;
  }catch(e){return false}
}
function loadMB(){return MB||(MB=import(url("vendor/mediabunny.min.mjs")).catch(function(e){MB=null;throw e}))}
function forcedCodec(){try{return new URLSearchParams(G.location.search).get("vcodec")}catch(e){return null}}
async function videoCodec(M,w,h){
  var f=forcedCodec();
  return M.getFirstEncodableVideoCodec(f?[f]:["hevc","avc"],{width:w,height:h});
}

/* il primo codec codificabile tra HEVC e H.264 (R-VID-02); null se il browser non sa codificare video */
function probeCodec(){
  return codecP||(codecP=(async function(){
    try{var M=await loadMB();return G.VideoEncoder?await videoCodec(M,1920,1080):null}catch(e){return null}
  })());
}

function luma(cv){
  var w=cv.width,h=cv.height,d=cv.getContext("2d",{willReadFrequently:true}).getImageData(0,0,w,h).data,y=new Uint8Array(w*h);
  for(var i=0,j=0;j<y.length;i+=4,j++)y[j]=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;
  return {w:w,h:h,y:y};
}
/* SSIM a finestre 8×8 non sovrapposte (come i codificatori), sulla luminosità */
function ssim(a,b){
  var w=Math.min(a.w,b.w),h=Math.min(a.h,b.h),C1=6.5025,C2=58.5225,sum=0,n=0;
  for(var by=0;by+8<=h;by+=8)for(var bx=0;bx+8<=w;bx+=8){
    var sa=0,sb=0,saa=0,sbb=0,sab=0;
    for(var y=by;y<by+8;y++){var oa=y*a.w+bx,ob=y*b.w+bx;
      for(var x=0;x<8;x++){var p=a.y[oa+x],q=b.y[ob+x];sa+=p;sb+=q;saa+=p*p;sbb+=q*q;sab+=p*q}}
    var ma=sa/64,mb=sb/64,va=saa/64-ma*ma,vb=sbb/64-mb*mb,cv=sab/64-ma*mb;
    sum+=((2*ma*mb+C1)*(2*cv+C2))/((ma*ma+mb*mb+C1)*(va+vb+C2));n++;
  }
  return n?sum/n:1;
}
/* fotogrammi confrontati al massimo a 1920 px di lato lungo */
function fitSize(w,h){var k=Math.min(1,1920/Math.max(w,h));return {width:Math.max(2,Math.round(w*k/2)*2),height:Math.max(2,Math.round(h*k/2)*2)}}
async function frames(M,track,ts,size){
  var sink=new M.CanvasSink(track,{width:size.width,height:size.height,fit:"fill",poolSize:0}),out=[];
  for await(var c of sink.canvasesAtTimestamps(ts))out.push(c?luma(c.canvas):null);
  return out;
}
function vInput(M,blob){return new M.Input({source:blob instanceof Blob?new M.BlobSource(blob):new M.BufferSource(blob),formats:M.ALL_FORMATS})}
/* misure del video (R-VID-04): codifica, bitrate, misure, fotogrammi al secondo, durata, audio; scarto rapido e HDR */
async function vMeta(it){
  var tp=performance.now();try{return await vMeta0(it)}finally{perf("probe",tp)}
}
async function vMeta0(it){
  var M=await loadMB(),input=vInput(M,it.file);
  var vt=await input.getPrimaryVideoTrack();if(!vt)throw new Error("novideo");
  if(await vt.hasHighDynamicRange())return {hdr:true};
  var at=await input.getPrimaryAudioTrack(),dur=await input.computeDuration();
  var vs=await vt.computePacketStats(400),as=at?await at.computePacketStats(400):null;
  /* scarto rapido (R-VID-21): già molto compresso, nessun margine */
  var bpp=vs.averageBitrate/(vt.codedWidth*vt.codedHeight*(vs.averagePacketRate||30));
  if(bpp<(vt.codec==="avc"?CFG.video.lightBpp.avc:CFG.video.lightBpp.other))return {light:true};
  var codec=await videoCodec(M,vt.codedWidth,vt.codedHeight);if(!codec)throw new Error("nocodec");
  var aac=false;
  if(at&&as){
    var big=/^pcm/.test(at.codec||"")||as.averageBitrate>256000,gain=(as.averageBitrate-AAC)*dur/8;
    if(big&&gain>=it.size*CFG.video.audioGain)aac=await M.canEncodeAudio("aac",{numberOfChannels:at.numberOfChannels,sampleRate:at.sampleRate,bitrate:AAC}).catch(function(){return false});
  }
  var t0=await vt.getFirstTimestamp(),clips=[],CL=1.5;
  if(dur<6)clips.push([t0,t0+dur]);
  else{var n=dur<20?2:3;for(var i=0;i<n;i++){var st=t0+(i+.5)*dur/n-CL/2;clips.push([st,st+CL])}}
  return {dur:dur,codec:codec,abr:as?as.averageBitrate:0,aac:aac,src:vs.averageBitrate,clips:clips,curve:[],w:vt.displayWidth,h:vt.displayHeight,
    scodec:vt.codec||"",fps:vs.averagePacketRate||30};
}
/* Tentativi mirati (R-VID-04, R-APP-09): si cerca solo la soglia del livello scelto. Ogni punto della curva = una codifica di prova
   (spezzoni o video intero) con qualità SSIM media e bit al secondo reali. */
var FMIN=CFG.video.search.fmin,FMAX=CFG.video.search.fmax,FSTEP=CFG.video.search.fstep;
/* misure ridotte per il riquadro del livello (Martellata, R-VID-23), o null se il video ci sta già */
function vTarget(v,lv){
  if(!lv.box||!v.w||!v.h)return null;
  var k=Math.min(1,lv.box[0]/Math.max(v.w,v.h),lv.box[1]/Math.min(v.w,v.h));if(k>=1)return null;
  var w=Math.max(2,Math.round(v.w*k/2)*2),h=Math.max(2,Math.round(v.h*k/2)*2);
  return {w:w,h:h,key:w+"x"+h};
}
/* curva dell'originale o della risoluzione ridotta (ognuna ha i suoi punti) */
function vCurve(v,tg,create){
  if(!tg)return v.curve;
  if(!v.sc)v.sc={};
  return v.sc[tg.key]||(create?(v.sc[tg.key]=[]):[]);
}
/* analisi salvate prima della 3.0.0: mancano le misure, si leggono al volo */
async function vDims(it){
  var v=it.vp;if(!v||v.w)return;
  try{var M=await loadMB(),vt=await vInput(M,it.file).getPrimaryVideoTrack();v.w=vt.displayWidth;v.h=vt.displayHeight}catch(e){}
}
function sortCurve(c){c.sort(function(a,b){return b.f-a.f})}
/* il prossimo tentativo (frazione del bitrate d'origine), 0 se la curva basta: primo colpo dalla stima f0,
   poi interpolazione sul logaritmo del bitrate tra un punto promosso e uno bocciato, o un salto dalla pendenza tipica */
function nextFrac(c,thr,f0){
  if(!c.length)return f0||FMAX;
  var A=null,B=null,S=CFG.video.search.slope;
  for(var i=0;i<c.length;i++){if(c[i].q>=thr)A=c[i];else{B=c[i];break}}
  if(A&&B){
    if(A.f/B.f<=FSTEP)return 0;
    var k=Math.min(.85,Math.max(.15,(thr+.002-B.q)/((A.q-B.q)||.001)));
    return Math.exp(Math.log(B.f)+(Math.log(A.f)-Math.log(B.f))*k);
  }
  if(A){
    if(A.f<=FMIN*1.01||A.q-thr<CFG.video.search.near)return 0;
    return Math.max(FMIN,A.f/4,Math.min(A.f/1.2,A.f*Math.exp(-(A.q-thr)/S)));
  }
  if(B.f>=FMAX*.99)return 0;
  return Math.min(FMAX,B.f*4,Math.max(B.f*1.25,B.f*Math.exp((thr-B.q)/S+.15)));
}
/* primo bitrate mirato (R-VID-04): dalla codifica d'origine e dai pixel al secondo; soglie in config.js */
function vGuess(v,lv,tg){
  var G=CFG.video.guess,k=lv.ssim>=G.hiFrom?"hi":"lo",mul=v.codec==="avc"?G.avcMul:1;
  var w=tg?tg.w:(v.w||1920),h=tg?tg.h:(v.h||1080),px=w*h,fps=v.fps||30;
  var fam=/^(hevc|vp9|av1)$/.test(v.scodec||"")?"modern":v.scodec&&v.scodec!=="avc"?"old":"avc";
  var shrink=tg&&v.w?Math.pow(px/(v.w*v.h),.75):1;
  var b=Math.min(px*fps*G.bpp[k]*mul,v.src*G.ratio[k][fam]*mul*shrink);
  return Math.min(FMAX,Math.max(FMIN,b/v.src));
}
/* fotogrammi di riferimento: alle misure di confronto del bersaglio (per la riduzione, l'originale ridotto) */
async function vRefs(it,v,M,tg){
  var key=tg?tg.key:"";
  if(it.vctx&&it.vctx.key===key)return it.vctx;
  var input=vInput(M,it.file),vt=await input.getPrimaryVideoTrack(),size=tg?fitSize(tg.w,tg.h):fitSize(vt.displayWidth,vt.displayHeight),ref=[];
  for(var c=0;c<v.clips.length;c++){
    var ts=[];for(var k=1;k<=3;k++)ts.push(v.clips[c][0]+(v.clips[c][1]-v.clips[c][0])*k/4);
    ref.push({ts:ts,y:await frames(M,vt,ts,size)});
  }
  return (it.vctx={key:key,input:input,size:size,ref:ref});
}
function vSize(tg){return tg?{width:tg.w,height:tg.h,fit:"fill"}:{}}
async function clipScore(M,cx,codec,clip,ref,b,tg){
  var tgt=new M.BufferTarget(),out=new M.Output({format:new M.Mp4OutputFormat(),target:tgt});
  var conv=await M.Conversion.init({input:cx.input,output:out,trim:{start:clip[0],end:clip[1]},audio:{discard:true},
    video:Object.assign({codec:codec,quality:new M.Quality({bitrate:b,bitrateMode:"variable"}),forceTranscode:true},vSize(tg)),showWarnings:false});
  await conv.execute();
  var t2=await vInput(M,tgt.buffer).getPrimaryVideoTrack(),off=clip[0];
  var got=await frames(M,t2,ref.ts.map(function(x){return x-off}),cx.size),qs=0,qn=0;
  for(var f=0;f<got.length;f++)if(got[f]&&ref.y[f]){qs+=ssim(ref.y[f],got[f]);qn++}
  return {qs:qs,qn:qn,bytes:tgt.buffer.byteLength,secs:clip[1]-clip[0]};
}
async function refineCurve(it,v,lv,onPct,stale,seq){
  var M=await loadMB(),steps=0,f,thr=lv.ssim,tg=vTarget(v,lv),c=vCurve(v,tg,true),f0=vGuess(v,lv,tg);
  while(steps<CFG.video.search.maxSteps&&(f=nextFrac(c,thr,f0))){
    if(stale())throw new Error("stale");
    var cx=await vRefs(it,v,M,tg),b=Math.round(v.src*f),parts;
    /* gli spezzoni in parallelo; se il codificatore non regge più sessioni, uno alla volta */
    try{
      if(seq)throw 0;/* durante la compressione: uno alla volta (R-VID-20) */
      parts=await Promise.all(v.clips.map(function(cl,j){return clipScore(M,cx,v.codec,cl,cx.ref[j],b,tg)}));
    }catch(e){parts=[];for(var j=0;j<v.clips.length;j++)parts.push(await clipScore(M,cx,v.codec,v.clips[j],cx.ref[j],b,tg))}
    var qs=0,qn=0,bytes=0,secs=0;parts.forEach(function(p){qs+=p.qs;qn+=p.qn;bytes+=p.bytes;secs+=p.secs});
    c.push({f:f,b:b,q:qn?qs/qn:0,rate:bytes*8/secs});sortCurve(c);
    onPct(Math.min(95,Math.round(++steps/6*100)));
  }
  it.vctx=null;
  onPct(100);
}
/* bitrate minimo che rispetta la soglia: interpolazione sul logaritmo del bitrate, +5% di margine; peso dai byte reali */
function vCovered(v,lv){return !nextFrac(vCurve(v,vTarget(v,lv)),lv.ssim,1)}
function planVideo(v,lv){
  var thr=lv.ssim,tg=vTarget(v,lv),c=vCurve(v,tg);if(!c.length||c[0].q<thr)return null;
  var i=1;while(i<c.length&&c[i].q>=thr)i++;
  var b,r;
  if(i>=c.length){b=c[c.length-1].b;r=c[c.length-1].rate}
  else{var A=c[i-1],B=c[i],k=(A.q-thr)/((A.q-B.q)||1),lg=function(x,y){return Math.exp(Math.log(x)+(Math.log(y)-Math.log(x))*k)};b=lg(A.b,B.b);r=lg(A.rate,B.rate)}
  return {b:Math.round(b*CFG.video.planMargin),q:thr,w:tg?tg.w:0,h:tg?tg.h:0,bytes:Math.round((r*CFG.video.planMargin+(v.aac?AAC:v.abr))*v.dur/8*1.01)};
}
/* WebM e MKV diventano MP4; MP4, M4V e MOV tengono l'estensione (R-VID-10) */
function vidExt(name){return /\.(webm|mkv)$/i.test(name)?name.replace(/\.[^.]+$/,".mp4"):name}
async function squeezeVideo(it,pl,onPct,ctl){
  var M=await loadMB(),v=it.vp,mov=/\.mov$/i.test(it.name),big=isBig(it),tgt,fh,ws;
  if(big){
    /* video grande: a pezzi su disco, metadati in fondo (nessun accumulo in memoria) */
    it.tmpName="v"+(it.id||++tmpSeq)+"-"+Date.now()+(mov?".mov":".mp4");
    fh=await (await tmpDir(true)).getFileHandle(it.tmpName,{create:true});
    ws=await fh.createWritable();
    tgt=new M.StreamTarget(ws,{chunked:true,chunkSize:4*1048576});
  }else tgt=new M.BufferTarget();
  var fs=big?false:"in-memory";
  var out=new M.Output({format:mov?new M.MovOutputFormat({fastStart:fs}):new M.Mp4OutputFormat({fastStart:fs}),target:tgt});
  var conv=await M.Conversion.init({input:vInput(M,it.file),output:out,showWarnings:false,
    video:Object.assign({codec:v.codec,quality:new M.Quality({bitrate:pl.b,bitrateMode:"variable"}),forceTranscode:true},vSize(pl.w?pl:null)),
    audio:v.aac?{codec:"aac",quality:new M.Quality({bitrate:AAC}),forceTranscode:true}:{}});
  if(ctl&&ctl.setConv)ctl.setConv(conv);
  if(!conv.isValid)throw new Error("invalid");
  conv.onProgress=function(x){onPct(Math.min(99,Math.round(x*100)))};
  try{await conv.execute()}
  catch(e){if(ws)try{await ws.abort()}catch(x){}throw e}
  if(big){try{await ws.close()}catch(e){}return fh.getFile()}
  return new Blob([tgt.buffer],{type:mov?"video/quicktime":"video/mp4"});
}
async function dropTmpName(n){if(n)try{await (await tmpDir()).removeEntry(n)}catch(e){}}
/* video corto: la prova promossa più leggera, misurata sul video intero */
function wholeBest(c,thr){var r=null;c.forEach(function(p){if(p.q>=thr&&(!r||p.b<r.b))r=p});return r}
/* video corto (R-VID-04): fotogrammi di riferimento sparsi su tutto il video, alle misure di confronto del bersaglio */
async function vWholeRefs(it,v,M,tg){
  var vt=await vInput(M,it.file).getPrimaryVideoTrack(),t0=await vt.getFirstTimestamp(),n=CFG.video.wholeFrames,ts=[];
  /* a metà di un fotogramma, così originale e risultato non scivolano su quello accanto */
  var fps=v.fps||30;for(var k=0;k<n;k++)ts.push(t0+(Math.floor(v.dur*(k+.5)/n*fps)+.5)/fps);
  var size=tg?fitSize(tg.w,tg.h):fitSize(vt.displayWidth,vt.displayHeight);
  return {t0:t0,ts:ts,size:size,y:await frames(M,vt,ts,size)};
}
/* qualità del risultato vero: SSIM medio sugli stessi istanti */
async function vScore(M,blob,ref){
  var vt=await vInput(M,blob).getPrimaryVideoTrack(),t0=await vt.getFirstTimestamp();
  var got=await frames(M,vt,ref.ts.map(function(x){return x-ref.t0+t0}),ref.size),qs=0,qn=0;
  for(var i=0;i<got.length;i++)if(got[i]&&ref.y[i]){qs+=ssim(ref.y[i],got[i]);qn++}
  return qn?qs/qn:0;
}
/* video corto: si ricodifica intero e si misura il risultato; si tiene il più leggero che rispetta la soglia */
async function vWhole(it,v,lv,onPct,ctl){
  var M=await loadMB(),tg=vTarget(v,lv),c=vCurve(v,tg,true),thr=lv.ssim,f0=vGuess(v,lv,tg),aud=v.aac?AAC:v.abr,keep=it.size*CFG.video.fileKeep;
  var ref=await vWholeRefs(it,v,M,tg),best=null,tries=0,f;v.whole=true;
  while(tries<CFG.video.wholeTries&&!ab(ctl)&&(f=nextFrac(c,thr,f0))){
    var b=Math.round(v.src*f),near=null;
    c.forEach(function(p){if(!near||Math.abs(Math.log(p.b/b))<Math.abs(Math.log(near.b/b)))near=p});
    var est=Math.round(((near?near.rate*b/near.b:b)+aud)*v.dur/8);
    /* il tentativo non potrebbe far risparmiare abbastanza: ci si ferma qui */
    if(est>=keep)break;
    var pl={b:b,q:thr,w:tg?tg.w:0,h:tg?tg.h:0,bytes:est};it.plan=pl;
    if(isBig(it)&&!await canDisk(est)){it.note="tooBig";break}
    var blob=await squeezeVideo(it,pl,onPct,ctl),name=it.tmpName;it.tmpName=null;tries++;
    var q=await vScore(M,blob,ref);
    c.push({f:f,b:b,q:q,rate:Math.max(1,blob.size*8/v.dur-aud)});sortCurve(c);
    if(q>=thr&&blob.size<keep&&(!best||blob.size<best.blob.size)){if(best)await dropTmpName(best.tmp);pl.q=q;pl.bytes=blob.size;best={blob:blob,tmp:name,pl:pl}}
    else await dropTmpName(name);
  }
  if(!best&&!ab(ctl)){
    /* nessuna prova di adesso è passata, ma una misura precedente sul video intero sì: si usa quella */
    var ok=wholeBest(c,thr);
    if(ok){var pl2={b:ok.b,q:ok.q,w:tg?tg.w:0,h:tg?tg.h:0,bytes:Math.round((ok.rate+aud)*v.dur/8)};it.plan=pl2;
      if(pl2.bytes<keep&&!(isBig(it)&&!await canDisk(pl2.bytes))){var bl=await squeezeVideo(it,pl2,onPct,ctl);if(bl.size<keep){pl2.bytes=bl.size;return bl}await dropTmp(it)}}
  }
  it.plan=best?best.pl:null;it.tmpName=best?best.tmp:null;
  return best&&best.blob;
}
/* un video, durante la compressione (R-VID-04): memoria, misure, tentativi mirati, ricodifica */
async function videoOne(it,lv,onPct,ctl){
  ctl=ctl||{};
  if(!await probeCodec()){it.status="same";it.note="noCodec";return}
  if(!it.vp){
    var rec=ctl.recall?await ctl.recall(it):null;
    if(rec&&rec.done){it.status="same";it.note="doneBefore";return}
    if(rec&&(rec.hdr||rec.light)){it.status="same";it.note=rec.hdr?"hdr":"noGainV";return}
    if(rec&&rec.v)it.vp=rec.v;
  }
  if(!it.vp){
    var m=await vMeta(it);
    if(m.hdr||m.light){await remember(ctl,it,m.hdr?{hdr:true}:{light:true});it.status="same";it.note=m.hdr?"hdr":"noGainV";return}
    it.vp=m;
  }
  await vDims(it);
  var v=it.vp,blob;
  var tg0=vTarget(v,lv),wb=v.whole&&v.dur<=CFG.video.shortSecs?wholeBest(vCurve(v,tg0),lv.ssim):null;
  if(wb){
    /* video corto già misurato intero (R-VID-19): si ricodifica subito con la prova promossa più leggera */
    var plw={b:wb.b,q:wb.q,w:tg0?tg0.w:0,h:tg0?tg0.h:0,bytes:Math.round((wb.rate+(v.aac?AAC:v.abr))*v.dur/8)};
    if(plw.bytes>=it.size*CFG.video.fileKeep){it.status="same";it.note="noGainV";return}
    it.plan=plw;
    if(isBig(it)&&!await canDisk(plw.bytes)){it.status="same";it.note="tooBig";return}
    blob=await squeezeVideo(it,plw,onPct,ctl);
    if(blob.size>=it.size*CFG.video.fileKeep){it.status="same";it.note="noGainV";await dropTmp(it);return}
  }else if(!vCovered(v,lv)&&v.dur<=CFG.video.shortSecs){
    blob=await vWhole(it,v,lv,onPct,ctl);await remember(ctl,it,{v:v});
    if(!blob){it.status="same";it.note=it.note||"noGainV";return}
  }else{
    if(!vCovered(v,lv)){await refineCurve(it,v,lv,function(p){onPct(p*.25)},function(){return ab(ctl)},!!ctl.seq);await remember(ctl,it,{v:v})}
    var pl=planVideo(v,lv);
    if(!pl||pl.bytes>=it.size*CFG.video.fileKeep){it.status="same";it.note="noGainV";return}
    it.plan=pl;
    if(isBig(it)&&!await canDisk(pl.bytes)){it.status="same";it.note="tooBig";return}
    blob=await squeezeVideo(it,pl,function(p){onPct(25+p*.75)},ctl);
    if(blob.size>=it.size*CFG.video.fileKeep){it.status="same";it.note="noGainV";await dropTmp(it);return}
  }
  it.out=blob;it.status="done";
  var nn=vidExt(it.name);if(nn!==it.name){if(it.rel)it.rel=it.rel.slice(0,it.rel.length-it.name.length)+nn;it.name=nn;it.handle=null}
}

/* ---------- API ---------- */
var LEVELS=["soft","mid","hard"];
function levelOf(k){return CFG.levels[k]||CFG.levels.soft}
function kindOf(f){
  var n=typeof f==="string"?f:(f&&f.name)||"";
  if(/\.pdf$/i.test(n))return "pdf";
  if(/\.jpe?g$/i.test(n))return "jpg";
  if(/\.(mp4|mov|m4v|webm|mkv)$/i.test(n))return "video";
  return null;
}
/* un file, con le stesse regole della pagina: {status:"done"|"same"|"err", blob, name, note, release}.
   release() libera il file temporaneo su disco dei video grandi (va chiamato dopo aver salvato il risultato). */
async function squeeze(file,o){
  o=o||{};
  var onPct=typeof o.onPct==="function"?o.onPct:function(){},lv=levelOf(o.level),kind=kindOf(file),sig=o.signal,conv=null;
  var noop=function(){};
  if(!kind)return {status:"err",note:"unreadable",name:file&&file.name,release:noop};
  if(sig&&sig.aborted)return {status:"err",note:"aborted",name:file.name,release:noop};
  var onAbort=function(){if(conv)try{conv.cancel()}catch(e){}};
  if(sig)sig.addEventListener("abort",onAbort);
  try{
    if(kind!=="video"){
      var r=kind==="pdf"?await squeezePdf(file,lv.pdf,onPct):await squeezeJpg(file,lv.jpg,onPct);
      if(sig&&sig.aborted)return {status:"err",note:"aborted",name:file.name,release:noop};
      onPct(100);
      if(r.blob.size<file.size*(kind==="pdf"?CFG.pdf.fileKeep:CFG.jpg.fileKeep))return {status:"done",blob:r.blob,name:file.name,release:noop};
      return {status:"same",note:r.images?"noGain":"noImages",name:file.name,release:noop};
    }
    var job={file:file,name:file.name,size:file.size,id:++tmpSeq};
    await videoOne(job,lv.video,onPct,{aborted:function(){return !!(sig&&sig.aborted)},setConv:function(c){conv=c},recall:o.recall,remember:o.remember,seq:true});
    if(sig&&sig.aborted){await dropTmp(job);return {status:"err",note:"aborted",name:file.name,release:noop}}
    var rel=function(){return dropTmp(job)};
    if(job.status==="done")return {status:"done",blob:job.out,name:job.name,plan:job.plan,release:rel};
    await dropTmp(job);
    return {status:"same",note:job.note||"noGainV",name:file.name,release:noop};
  }catch(e){
    var m=String(e&&e.message);
    return {status:"err",note:sig&&sig.aborted?"aborted":/encrypt/i.test(m)?"locked":/novideo/.test(m)?"noVideo":"unreadable",name:file.name,release:noop};
  }finally{if(sig)sig.removeEventListener("abort",onAbort)}
}
var M0={
  version:"dev",/* la pubblicazione scrive qui la VERSION */
  setBase:function(u){BASE=new URL(u,G.location.href).href},
  levels:LEVELS,
  kindOf:kindOf,
  canVideo:function(){return probeCodec().then(function(c){return !!c})},
  squeeze:squeeze,
  onPerf:null,
  /* per la pagina di Schiaccia (stesse funzioni, con l'elenco e la memoria delle analisi della pagina) */
  internal:{pdfLib:pdfLib,runTask:runTask,poolWidth:poolWidth,squeezePdf:squeezePdf,squeezeJpg:squeezeJpg,
    videoOne:videoOne,probeCodec:probeCodec,loadMB:loadMB,isBig:isBig,safe:function(){return SAFE},tmpDir:tmpDir,dropTmp:dropTmp,vidExt:vidExt,
    isIOS:isIOS}
};
G.Motore=M0;
})(self);

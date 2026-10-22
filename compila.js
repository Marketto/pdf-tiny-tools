/* Compila (R-CPL): dal modulo stampato al PDF compilabile, tutto sul dispositivo.
   Si scarica la prima volta che serve (R-CPL-15) e usa quello che la pagina gli passa in window.APP
   (testi, Tesseract, pdf-lib, salvataggio, schermate a tutto schermo, musica).
   Parti: ricerca dei campi (motore), dati di lingua e paese, schermata in tre passi, PDF compilabile. */
(function(){
"use strict";
var APP=window.APP,CFG=window.CONFIG,C=CFG.fill;
function t(k,p){return APP.t(k,p)}
function nf(n){return APP.nf(n)}
var $=function(id){return document.getElementById(id)};
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}

/* ---------- motore: righe, puntini, caselle (R-CPL-05) ----------
   Si lavora su una pagina a 200 dpi in scala di grigi; le misure sono in millimetri (mm = pixel per millimetro). */
var DPI=200;
function grayOf(cv){
  var g=cv.getContext("2d",{willReadFrequently:true}),d=g.getImageData(0,0,cv.width,cv.height).data,n=cv.width*cv.height,o=new Uint8Array(n);
  for(var i=0;i<n;i++)o[i]=(d[i*4]*77+d[i*4+1]*150+d[i*4+2]*29)>>8;
  return o;
}
/* soglia adattiva (come cv2.adaptiveThreshold MEAN_C, finestra 31, costante 15): inchiostro = più scuro della media intorno */
function binarize(g,W,H){
  var S=new Float64Array((W+1)*(H+1)),r=15,bw=new Uint8Array(W*H);
  for(var y=0;y<H;y++){var acc=0;for(var x=0;x<W;x++){acc+=g[y*W+x];S[(y+1)*(W+1)+x+1]=S[y*(W+1)+x+1]+acc}}
  for(y=0;y<H;y++){var y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
    for(x=0;x<W;x++){var x0=Math.max(0,x-r),x1=Math.min(W,x+r+1);
      var m=(S[y1*(W+1)+x1]-S[y0*(W+1)+x1]-S[y1*(W+1)+x0]+S[y0*(W+1)+x0])/((y1-y0)*(x1-x0));
      if(g[y*W+x]<m-15)bw[y*W+x]=1;
    }}
  return bw;
}
/* componenti connesse (8 vicini) a strisce: per ognuna riquadro, area e baricentro */
function components(mask,W,H){
  var par=[],runs=[],prev=[],cur;
  function find(a){while(par[a]!==a){par[a]=par[par[a]];a=par[a]}return a}
  for(var y=0;y<H;y++){
    cur=[];var x=0,row=y*W;
    while(x<W){
      if(!mask[row+x]){x++;continue}
      var s=x;while(x<W&&mask[row+x])x++;
      var id=runs.length;runs.push([y,s,x]);par.push(id);cur.push(id);
      for(var k=0;k<prev.length;k++){var q=runs[prev[k]];if(q[2]>=s&&q[1]<=x){var a=find(id),b=find(prev[k]);if(a!==b)par[a]=b}}
    }
    prev=cur;
  }
  var map={},out=[];
  for(var i=0;i<runs.length;i++){
    var rt=find(i),c=map[rt],ru=runs[i];
    if(!c){c=map[rt]={x0:ru[1],x1:ru[2],y0:ru[0],y1:ru[0]+1,a:0,sx:0,sy:0};out.push(c)}
    if(ru[1]<c.x0)c.x0=ru[1];if(ru[2]>c.x1)c.x1=ru[2];if(ru[0]+1>c.y1)c.y1=ru[0]+1;
    var len=ru[2]-ru[1];c.a+=len;c.sx+=len*(ru[1]+ru[2]-1)/2;c.sy+=len*ru[0];
  }
  out.forEach(function(c){c.w=c.x1-c.x0;c.h=c.y1-c.y0;c.cx=c.sx/c.a;c.cy=c.sy/c.a});
  return out;
}
function inkIn(bw,W,H,x0,y0,x1,y1){
  x0=Math.max(0,x0|0);y0=Math.max(0,y0|0);x1=Math.min(W,x1|0);y1=Math.min(H,y1|0);var n=0;
  for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++)n+=bw[y*W+x];
  return n;
}
/* righe piene, puntini, caselle singole e file di caselle */
function findMarks(bw,W,H,mm){
  var segs=[],boxes=[],combs=[];
  /* 1) righe: tratti orizzontali lunghi almeno 6 mm (apertura orizzontale), poi componenti sottili e lunghe */
  var L=Math.round(6*mm),lm=new Uint8Array(W*H);
  for(var y=0;y<H;y++){var x=0,row=y*W;while(x<W){if(!bw[row+x]){x++;continue}var s=x;while(x<W&&bw[row+x])x++;if(x-s>=L)for(var k=s;k<x;k++)lm[row+k]=1}}
  /* sottili: alte al massimo 0,8 mm, oppure appena curve (foto di un foglio non proprio piatto): spessore medio sotto 0,6 mm e alte al massimo 3 mm */
  components(lm,W,H).forEach(function(c){if(c.w>=8*mm&&(c.h<=.8*mm||c.h<=3*mm&&c.a/c.w<=.6*mm))segs.push({x0:c.x0,x1:c.x1,y:c.h<=.8*mm?c.y0+c.h/2:c.cy,kind:"line"})});
  lm=null;
  var all=components(bw,W,H);
  /* 2) puntini: piccole macchie allineate, a non più di 2,2 mm l'una dall'altra */
  var dots=[];
  all.forEach(function(c){if(c.w<=1*mm&&c.h<=1*mm&&c.a>=1&&c.a<=Math.pow(.8*mm,2)*1.5)dots.push([c.cx,c.cy])});
  /* catene da sinistra a destra: ogni puntino continua la catena il cui ultimo puntino è poco prima e quasi alla stessa
     altezza (così una riga appena storta resta una riga sola) */
  dots.sort(function(a,b){return a[0]-b[0]});
  var open=[],chains=[];
  dots.forEach(function(d){
    var best=null,bd=1e9;
    for(var i=open.length-1;i>=0;i--){
      var c=open[i],l=c[c.length-1];
      if(d[0]-l[0]>2.2*mm){chains.push(c);open.splice(i,1);continue}
      var dy=Math.abs(d[1]-l[1]);if(dy<=.45*mm&&dy<bd){bd=dy;best=c}
    }
    if(best)best.push(d);else open.push([d]);
  });
  chains=chains.concat(open);
  chains.forEach(function(run){
    if(run.length>=6&&run[run.length-1][0]-run[0][0]>=6*mm){var sy=0;run.forEach(function(q){sy+=q[1]});segs.push({x0:run[0][0],x1:run[run.length-1][0],y:sy/run.length,kind:"dots"})}
  });
  /* 3) caselle: contorni quasi quadrati di 2–8 mm, vuoti dentro; file di caselle: un contorno basso e lungo
     diviso da stanghette verticali a passo regolare (codice fiscale, CAP) */
  all.forEach(function(c){
    var hollow=c.a<.5*c.w*c.h;if(!hollow)return;
    var inner=inkIn(bw,W,H,c.x0+c.w*.25,c.y0+c.h*.25,c.x1-c.w*.25,c.y1-c.h*.25)/Math.max(1,(c.w*.5)*(c.h*.5));
    if(c.h>=2*mm&&c.h<=8*mm&&c.w>=2*mm&&c.w<=8*mm&&c.w/c.h>.75&&c.w/c.h<1.33){
      if(inner<.08&&sides(c))boxes.push({x0:c.x0,x1:c.x1,y0:c.y0,y1:c.y1});
      return;
    }
    if(c.h>=3*mm&&c.h<=10*mm&&c.w>=2.5*c.h){
      var cols=[];
      for(var x=c.x0;x<c.x1;x++){var n=0;for(var y=c.y0;y<c.y1;y++)n+=bw[y*W+x];cols.push(n/c.h>.7)}
      var bars=[],i=0;while(i<cols.length){if(!cols[i]){i++;continue}var s=i;while(i<cols.length&&cols[i])i++;bars.push(c.x0+(s+i-1)/2)}
      if(bars.length<4)return;
      var gaps=[];for(i=1;i<bars.length;i++)gaps.push(bars[i]-bars[i-1]);
      var gs=gaps.slice().sort(function(a,b){return a-b}),med=gs[gs.length>>1];
      if(med<2.5*mm||med>9*mm)return;
      if(gaps.some(function(g){return Math.abs(g-med)>.3*med}))return;
      combs.push({x0:bars[0],x1:bars[bars.length-1],y0:c.y0,y1:c.y1,n:bars.length-1});
    }
  });
  /* quattro lati dritti: in una fascia sottile lungo ogni lato c'è inchiostro quasi per tutta la lunghezza (una «O» o una «D» no) */
  function sides(c){
    var b=Math.max(2,Math.round(.4*mm));
    function cover(x0,y0,x1,y1,horiz){var n=0,len=horiz?x1-x0:y1-y0;for(var i=0;i<len;i++){var hit=0;for(var j=0;j<b&&!hit;j++){var x=horiz?x0+i:x0+j,y=horiz?y0+j:y0+i;if(x<W&&y<H&&bw[y*W+x])hit=1}n+=hit}return n/Math.max(1,len)}
    return cover(c.x0,c.y0,c.x1,c.y0,true)>.85&&cover(c.x0,c.y1-b,c.x1,c.y1,true)>.85&&cover(c.x0,c.y0,c.x0,c.y1,false)>.85&&cover(c.x1-b,c.y0,c.x1,c.y1,false)>.85;
  }
  /* righe che sono il fondo o il tetto di una fila di caselle: non sono campi a sé */
  segs=segs.filter(function(s){return !combs.some(function(k){return s.x0>=k.x0-1*mm&&s.x1<=k.x1+1*mm&&s.y>=k.y0-1*mm&&s.y<=k.y1+1*mm})});
  /* puntini spezzati da un'interruzione senza inchiostro sopra: si riuniscono */
  segs.sort(function(a,b){return Math.round(a.y/(.6*mm))-Math.round(b.y/(.6*mm))||a.x0-b.x0});
  var merged=[];
  segs.forEach(function(s){
    var m=merged[merged.length-1];
    if(m&&m.kind==="dots"&&s.kind==="dots"&&Math.abs(m.y-s.y)<.6*mm&&s.x0>=m.x0&&s.x0-m.x1<6*mm&&
       (s.x0-m.x1<=4||inkIn(bw,W,H,m.x1+2,s.y-2.5*mm,s.x0-1,s.y-.6*mm)<4)){m.x1=Math.max(m.x1,s.x1);return}
    merged.push(Object.assign({},s));
  });
  return {segs:merged,boxes:boxes,combs:combs};
}
/* parola fatta solo di puntini o trattini: è la riga stessa letta come testo */
function leaderWord(s){s=s.replace(/\s/g,"");if(s.length<2)return false;var n=0;for(var i=0;i<s.length;i++)if("._…·-".indexOf(s[i])>=0)n++;return n/s.length>.6}
/* somiglianza tra due parole corte (come difflib): 1 - distanza di modifica / lunghezza */
function sim(a,b){
  a=a.toLowerCase();b=b.toLowerCase();var m=a.length,n=b.length;if(!m||!n)return 0;
  var d=[];for(var i=0;i<=m;i++){d[i]=[i];for(var j=1;j<=n;j++)d[i][j]=i?0:j}
  for(i=1;i<=m;i++)for(j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return 1-d[m][n]/Math.max(m,n);
}

/* ---------- dati di lingua e paese (R-CPL-06), scaricati solo quando servono ---------- */
var LANGDATA=window.CPL_LANG=window.CPL_LANG||{},PACKS=window.CPL_PAESE=window.CPL_PAESE||{};
async function langData(code){
  if(!LANGDATA[code])try{await APP.loadScript("compila/lingue/"+code+".js")}catch(e){}
  return LANGDATA[code]||null;
}
/* lingua del modulo dalle sue parole frequenti (compila/lingue/indice.js); a pari merito o con poche parole, quella proposta */
async function formLang(words,guess){
  if(!window.CPL_STOP)try{await APP.loadScript("compila/lingue/indice.js")}catch(e){return guess}
  var ST=window.CPL_STOP||{},seen={},best=guess,bs=0;
  (words||[]).forEach(function(w){var k=w.t.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}']+$/gu,"");if(k)seen[k]=(seen[k]||0)+1});
  Object.keys(ST).forEach(function(l){
    var n=0;ST[l].split(" ").forEach(function(x){if(l==="zh"){Object.keys(seen).forEach(function(k){if(k.indexOf(x)>=0)n+=seen[k]})}else n+=seen[x]||0});
    if(n>bs||n===bs&&l===guess){bs=n;best=l}
  });
  return bs>=3?best:guess;
}
/* paesi che hanno un file (elenchi e caselle fisse); per gli altri bastano lingua e formati del browser */
var PACKLIST="it es fr de at ch pt nl be pl ro gb ie us ca mx ar br in".split(" ");
async function packData(cc){
  if(!cc||PACKLIST.indexOf(cc)<0)return null;
  if(!PACKS[cc])try{await APP.loadScript("compila/paesi/"+cc+".js")}catch(e){}
  return PACKS[cc]||null;
}
/* paese: dalla lingua del browser se è la stessa dell'app (it-CH → ch), altrimenti il paese tipico della lingua */
var MAINLAND={it:"it",en:"gb",es:"es",fr:"fr",de:"de",pt:"pt",nl:"nl",pl:"pl",cs:"cz",sk:"sk",sl:"si",hr:"hr",bs:"ba",sr:"rs",mk:"mk",bg:"bg",ro:"ro",hu:"hu",el:"gr",da:"dk",sv:"se",no:"no",fi:"fi",is:"is",et:"ee",lv:"lv",lt:"lt",ga:"ie",mt:"mt",sq:"al",uk:"ua",be:"by",ru:"ru",ar:"sa",ur:"pk",hi:"in",bn:"bd",id:"id",zh:"cn"};
function country(){
  var l=APP.lang();
  var nav=(navigator.languages||[navigator.language||""]).map(String);
  for(var i=0;i<nav.length;i++){var p=nav[i].toLowerCase().split("-");if(p[0]===l&&p[1]&&/^[a-z]{2}$/.test(p[1]))return p[1]}
  return MAINLAND[l]||"";
}
/* formato delle date dalla lingua e dal paese: ordine di giorno, mese e anno e separatore */
function dateFmt(){
  var loc=APP.lang()+"-"+country().toUpperCase(),parts;
  try{parts=new Intl.DateTimeFormat(loc,{day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date(2033,10,22))}catch(e){parts=null}
  if(!parts)return {order:"dmy",sep:"/"};
  var o="",sep="/";parts.forEach(function(p){if(p.type==="day")o+="d";else if(p.type==="month")o+="m";else if(p.type==="year")o+="y";else if(p.type==="literal"&&!/^\s*$/.test(p.value)&&sep==="/")sep=p.value.trim()||"/"});
  return {order:o.length===3?o:"dmy",sep:sep.charAt(0)||"/"};
}
/* stringhe di formato per l'utente (gg/mm/aaaa, dd.mm.yyyy…) e per il PDF (dd/mm/yyyy) */
function fmtPattern(kind,forPdf){
  var f=dateFmt(),L=forPdf?{d:"dd",m:"mm",y:"yyyy"}:{d:t("fmtD"),m:t("fmtM"),y:t("fmtY")};
  if(kind==="my")return [L.m,L.y].join(f.sep);
  if(kind==="y")return L.y;
  return f.order.split("").map(function(c){return L[c]}).join(f.sep);
}
function decSep(){try{return (1.5).toLocaleString(APP.lang()+"-"+country().toUpperCase()).charAt(1)}catch(e){return "."}}
/* lingua del modulo: quella dell'app se il sistema di scrittura è il suo, altrimenti quella che Tesseract usa per quel sistema */
var TESS2LANG={ita:"it",eng:"en",spa:"es",fra:"fr",por:"pt",deu:"de",ind:"id",ces:"cs",hrv:"hr",dan:"da",nld:"nl",est:"et",fin:"fi",hun:"hu",gle:"ga",lav:"lv",lit:"lt",mlt:"mt",pol:"pl",ron:"ro",slk:"sk",slv:"sl",swe:"sv",nor:"no",isl:"is",sqi:"sq",bos:"bs",rus:"ru",ukr:"uk",bul:"bg",srp:"sr",mkd:"mk",bel:"be",ell:"el",ara:"ar",urd:"ur",hin:"hi",ben:"bn",chi_sim:"zh"};

/* ---------- lettura del testo: pdf.js per i PDF con testo vero, Tesseract per le immagini ---------- */
function tsvWords(tsv){
  var out=[];
  String(tsv||"").split("\n").slice(1).forEach(function(line){
    var c=line.split("\t");if(c.length<12)return;
    var tx=(c[11]||"").trim(),cf=parseFloat(c[10]);if(!tx||cf<0)return;
    var x=+c[6],y=+c[7],w=+c[8],h=+c[9];
    out.push({t:tx,x:x,y:y,w:w,h:h,x1:x+w,y1:y+h,conf:cf});
  });
  return out;
}
async function ocrWords(cv,code){
  var w=await APP.ocrRecWorker(code,function(){APP.loaderN(t("ocrLang"))});
  APP.loaderN("");
  try{await w.setParameters({tessedit_pageseg_mode:"3"})}catch(e){}
  var r=await w.recognize(cv,{},{tsv:true,text:false,blocks:false});APP.ocrTouch();
  return tsvWords(r&&r.data&&r.data.tsv);
}
/* una striscia letta da sola come una riga (psm 7), ingrandita due volte e con un margine bianco */
async function ocrStrip(g,W,H,code,x0,x1,y0,y1){
  x0=Math.max(0,Math.round(x0));x1=Math.min(W,Math.round(x1));y0=Math.max(0,Math.round(y0));y1=Math.min(H,Math.round(y1));
  if(x1-x0<4||y1-y0<4)return "";
  var cw=(x1-x0)*2+40,ch=(y1-y0)*2+40,c=document.createElement("canvas");c.width=cw;c.height=ch;
  var cx=c.getContext("2d"),img=cx.createImageData(x1-x0,y1-y0);
  for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++){var v=g[y*W+x],k=((y-y0)*(x1-x0)+(x-x0))*4;img.data[k]=img.data[k+1]=img.data[k+2]=v;img.data[k+3]=255}
  var tmp=document.createElement("canvas");tmp.width=x1-x0;tmp.height=y1-y0;tmp.getContext("2d").putImageData(img,0,0);
  cx.fillStyle="#fff";cx.fillRect(0,0,cw,ch);cx.imageSmoothingQuality="high";cx.drawImage(tmp,20,20,(x1-x0)*2,(y1-y0)*2);
  try{
    var w=await APP.ocrRecWorker(code);await w.setParameters({tessedit_pageseg_mode:"7"});
    var r=await w.recognize(c,{},{text:true});APP.ocrTouch();
    return String(r&&r.data&&r.data.text||"").trim().replace(/[.…_·]{2,}/g," ").trim();
  }catch(e){return ""}
  finally{tmp.width=tmp.height=c.width=c.height=0}
}

/* ---------- campi: righe + etichette + tipi (R-CPL-05/06) ---------- */
/* page: {cv (200 dpi), words (dal testo del PDF, in pixel della pagina) o null, code (lingua di Tesseract)}; langOf(parole) → parole chiave della lingua del modulo;
   onField(n): per il contatore della lente */
async function findFields(page,langOf,onField,stop){
  var cv=page.cv,W=cv.width,H=cv.height,mm=DPI/25.4,g=grayOf(cv),bw=binarize(g,W,H);
  var marks=findMarks(bw,W,H,mm);
  var words=page.words;
  if(!words||words.length<C.minWords)words=await ocrWords(cv,page.code);
  if(stop())return [];
  var LP=await langOf(words),L=LP.L,P=LP.P;
  var real=words.filter(function(w){return !leaderWord(w.t)&&w.h>1.5*mm&&(w.conf==null||w.conf>30)});
  var hs=real.map(function(w){return w.h}).sort(function(a,b){return a-b});
  if(window.__cplDebug)window.__cplDebug.push({real:real,marks:marks});
  var xh=hs.length?hs[hs.length>>1]:3*mm;
  /* fasce decorative e sottolineature di testo stampato: via; testo stampato sopra una riga: valore iniziale */
  var segs=marks.segs.slice().sort(function(a,b){return a.y-b.y||a.x0-b.x0}),keep=[];
  segs.forEach(function(s){
    var near=segs.filter(function(o){return Math.abs(o.y-s.y)<2*mm&&Math.min(o.x1,s.x1)-Math.max(o.x0,s.x0)>.5*(s.x1-s.x0)});
    if(near.length>=3)return;
    var over=real.filter(function(w){return w.x<s.x1&&w.x1>s.x0&&s.y-w.y1>=0&&s.y-w.y1<.8*xh}).sort(function(a,b){return a.x-b.x});
    var cover=0;over.forEach(function(w){cover+=Math.min(w.x1,s.x1)-Math.max(w.x,s.x0)});
    s.prefill=over.map(function(w){return w.t}).join(" ");
    if(cover>.85*(s.x1-s.x0))return;
    var lefty=real.filter(function(w){return Math.abs(w.y1-s.y)<.9*xh&&w.x1<=s.x0+.5*mm&&s.x0-w.x1<3*xh});
    if(over.length&&!lefty.length&&over[0].x-s.x0<1.5*mm){s.label0=over[0].t;s.x0=over[0].x1+.8*mm;s.prefill=over.slice(1).map(function(w){return w.t}).join(" ")}
    if(keep.some(function(o){return Math.abs(o.y-s.y)<.6*mm&&o.x0<=s.x0+1&&o.x1>=s.x1-1}))return;
    keep.push(s);
  });
  var fields=[],strips=!page.words||page.words.length<C.minWords;
  function glyph(s,xa,xb){
    var ya=Math.round(s.y-1.5*xh),yb=Math.round(s.y+.35*xh);xa=Math.max(0,Math.round(xa));xb=Math.min(W,Math.round(xb));
    if(xb<=xa||yb<=ya)return false;
    var sub=new Uint8Array((xb-xa)*(yb-ya));for(var y=ya;y<yb;y++)for(var x=xa;x<xb;x++)if(y>=0&&y<H)sub[(y-ya)*(xb-xa)+x-xa]=bw[y*W+x];
    return components(sub,xb-xa,yb-ya).some(function(c){return c.h>1.8*mm&&c.w<1.4*mm&&c.h>2.2*c.w});
  }
  function wordsLeft(x,y){return real.filter(function(w){return Math.abs(w.y1-y)<.9*xh&&w.x1<=x+.5*mm}).sort(function(a,b){return b.x1-a.x1})}
  for(var i=0;i<keep.length;i++){
    if(stop())return [];
    var s=keep[i];
    var same=keep.filter(function(o){return o!==s&&Math.abs(o.y-s.y)<.8*mm&&o.x1<=s.x0});
    var lx=0;same.forEach(function(o){if(o.x1>lx)lx=o.x1});
    var last=same.slice().sort(function(a,b){return b.x1-a.x1})[0];if(last&&last.rparen)lx+=2.5*mm;
    s.paren0=glyph(s,s.x0-3*mm,s.x0-.2*mm);s.rparen=glyph(s,s.x1+.2*mm,s.x1+3*mm);
    var strip="";
    if(strips)strip=await ocrStrip(g,W,H,page.code,lx+.3*mm,s.x0+.3*mm,s.y-1.7*xh,s.y+.35*xh);
    if(s.paren0&&s.rparen&&strip.replace(/[^\p{L}\p{N}]/gu,"").length<=2)strip="";
    strip=strip.replace(/^[^\p{L}]+/u,"").replace(/[(\s]+$/,"").trim();
    /* senza due lettere di fila è un pezzo di riga letto come testo */
    var lets=strip.replace(/[^\p{L}]/gu,"");if(lets.length<2&&!(lets.length===1&&strip.length<=3))strip="";
    if(strip&&strip.length<=7&&L&&L.short){var best=null,bs=.6;L.short.forEach(function(x){var v=sim(strip,x);if(v>=bs){bs=v;best=x}});if(best)strip=best}
    /* etichetta: parole stampate subito a sinistra, fermandosi a un'altra riga o a uno spazio largo */
    var lab=[],edge=s.x0;
    var base=wordsLeft(s.x0,s.y);
    for(var j=0;j<base.length;j++){
      /* la prima parola può stare un po' staccata dalla riga, le altre vanno di seguito */
      var w=base[j];if(edge-w.x1>(lab.length?2.5:6)*xh)break;
      if(keep.some(function(o){return o!==s&&o.x1<=edge&&o.x1>w.x1&&Math.abs(o.y-s.y)<.6*mm}))break;
      lab.unshift(w);edge=w.x;
    }
    var text=s.label0||strip||lab.map(function(w){return w.t}).join(" "),where="left";
    if(!text&&!(s.paren0&&s.rparen)){
      var up=real.filter(function(w){return s.y-w.y1>0&&s.y-w.y1<3.5*xh&&w.x1>s.x0&&w.x<s.x1});
      if(up.length){var yb=Math.max.apply(null,up.map(function(w){return w.y1}));
        text=up.filter(function(w){return Math.abs(w.y1-yb)<.5*xh}).sort(function(a,b){return a.x-b.x}).map(function(w){return w.t}).join(" ");where="up"}
    }
    var h=1.5*xh;
    fields.push({page:page.n,x0:s.x0,y0:s.y-h,x1:s.x1,y1:s.y-.12*xh,base:s.y,label:text.replace(/[:.(\s]+$/,"").trim(),read:text.replace(/[:.(\s]+$/,"").trim(),where:where,paren:!!(s.paren0&&s.rparen),prefill:s.prefill||"",kind:s.kind});
    onField(fields.length);
  }
  /* caselle da spuntare: etichetta a destra */
  for(var bi=0;bi<marks.boxes.length;bi++){var b=marks.boxes[bi];
    /* a destra della casella; il quadratino stesso, quando è un carattere del testo, non conta */
    var right=real.filter(function(w){return w.x1>b.x1+1*mm&&w.x>b.x0&&Math.abs((w.y+w.y1)/2-(b.y0+b.y1)/2)<.8*xh&&!/^[\u25a0-\u25ff\u2610-\u2612]+$/.test(w.t)}).map(function(w){
      /* Tesseract a volte legge la casella come una lettera attaccata alla parola («DF»): la si toglie */
      if(w.x<b.x1-.5*mm&&w.t.length>1)return Object.assign({},w,{t:w.t.slice(1),x:b.x1+1*mm});return w;
    }).sort(function(a,c){return a.x-c.x});
    /* le parole di seguito, fino a uno spazio largo o alla casella dopo */
    var lab=[],edge=b.x1+2*mm;
    for(var j=0;j<right.length;j++){
      var w=right[j];if(w.x-edge>(lab.length?1.5:1)*xh+1*mm)break;
      if(marks.boxes.some(function(o){return o!==b&&o.x0>=edge-1&&o.x0<w.x&&Math.abs(o.y0-b.y0)<2*mm}))break;
      lab.push(w);edge=w.x1;
    }
    var tx=lab.map(function(w){return w.t}).join(" ").replace(/[:.]+$/,"");
    if(!tx&&strips){
      var nx=marks.boxes.filter(function(o){return o.x0>b.x1&&Math.abs(o.y0-b.y0)<2*mm}).map(function(o){return o.x0}).sort(function(a,c){return a-c})[0]||b.x1+30*mm;
      tx=await ocrStrip(g,W,H,page.code,b.x1+.5*mm,Math.min(nx-.5*mm,b.x1+30*mm),b.y0-1*mm,b.y1+1*mm);tx=tx.replace(/[:.]+$/,"").trim();
    }
    /* un quadratino senza niente scritto accanto è un disegno, non una casella */
    if(!/\p{L}/u.test(tx))continue;
    fields.push({page:page.n,x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,base:b.y1,label:tx,read:tx,where:"right",type:"check",kind:"box"});
    onField(fields.length);
  }
  /* file di caselle: un campo con tanti caratteri quante sono le caselle */
  for(var ki=0;ki<marks.combs.length;ki++){var k=marks.combs[ki];
    var cy=(k.y0+k.y1)/2,lab=[],edge=k.x0;
    wordsLeft(k.x0,cy+.5*xh).forEach(function(w){if(lab.length<4&&edge-w.x1<(lab.length?1.5*xh:12*xh)){lab.unshift(w);edge=w.x}});
    var tx=lab.map(function(w){return w.t}).join(" ").replace(/[:.(\s]+$/,"");
    if(!tx&&strips){tx=await ocrStrip(g,W,H,page.code,k.x0-40*mm,k.x0-.5*mm,k.y0-1*mm,k.y1+1*mm);tx=tx.replace(/[:.(\s]+$/,"").trim();if(!/\p{L}{2}/u.test(tx))tx=""}
    fields.push({page:page.n,x0:k.x0,y0:k.y0,x1:k.x1,y1:k.y1,base:k.y1,label:tx,read:tx,where:"left",comb:k.n,kind:"comb"});
    onField(fields.length);
  }
  return guessTypes(fields,L,P,mm);
}
/* tipo dall'etichetta (parole chiave della lingua) e dalla forma (R-CPL-06).
   L (compila/lingue/<sigla>.js): espressioni date, money, number, postcode, year, tax, sign, place (etichetta di un luogo:
   «nato/a a», «residente a»), on (la parola sola che introduce la data: «il»), nice (abbreviazioni → nomi chiari),
   short (etichette corte da raddrizzare se Tesseract sbaglia una lettera), birthDate, birthPlace, at, date, inWords, prov.
   P (compila/paesi/<sigla>.js): post (cifre del codice postale), tax e taxName (codice fiscale), lists.prov (province). */
function guessTypes(fields,L,P,mm){
  L=L||{};P=P||{};var R={};
  ["date","money","number","postcode","year","tax","sign","place"].forEach(function(k){R[k]=L[k]?new RegExp(L[k],"iu"):null});
  function is(k,s){return !!(R[k]&&R[k].test(s))}
  var prev=null,prev2=null;
  fields.sort(function(a,b){return a.page-b.page||Math.round(a.base/(2*mm))-Math.round(b.base/(2*mm))||a.x0-b.x0});
  fields.forEach(function(f){
    var low=f.label.toLowerCase().replace(/\s+/g," "),pl=prev&&prev.page===f.page&&Math.abs(prev.base-f.base)<2*mm?prev.label.toLowerCase():"";
    /* «a …» e «il …» possono andare a capo dopo «nato/a»: per loro basta il campo prima, entro qualche riga */
    var pn=[prev,prev2].filter(function(g){return g&&g.page===f.page&&f.base-g.base<20*mm}).map(function(g){return g.label.toLowerCase()}).join(" | ");
    if(f.type==="check"){prev2=prev;prev=f;return}
    f.type="text";f.fmt="";
    if(L.nice&&L.nice[low]){f.label=L.nice[low];low=f.label.toLowerCase()}
    /* sigla tra parentesi dopo un luogo: la provincia, da un elenco */
    if(f.paren&&f.x1-f.x0<25*mm&&pl&&is("place",pl)&&P.lists&&P.lists.prov){f.label=L.prov||P.lists.prov.name;f.type="list";f.items=P.lists.prov.items.slice();f.edit=true}
    /* «il» subito dopo «nato/a a …»: la data di nascita; «a» dopo «nato/a»: il luogo */
    else if(L.on&&low===L.on&&pn&&is("place",pn)){f.label=L.birthDate||f.label;f.type="date";f.fmt="dmy"}
    else if(L.at&&low===L.at&&pn&&(is("place",pn)||is("date",pn))){f.label=L.birthPlace||f.label}
    else if(/^\p{Lu}[\p{Ll}\p{M}]+,$/u.test(f.label)){f.label=f.label.replace(/,$/,"")+", "+(L.date0||"data");f.type="date";f.fmt="dmy"}
    else if(is("date",low)){f.type="date";f.fmt="dmy"}
    else if(is("money",low)){f.type="number";f.fmt="money"}
    else if(is("postcode",low)){f.type="number";f.fmt="int";if(P.post)f.max=P.post}
    else if(is("year",low)){f.type="number";f.fmt="int";f.max=4}
    else if(is("number",low)){f.type="number";f.fmt="int"}
    else if(is("tax",low)){if(P.tax&&!f.comb)f.max=P.tax}
    else if(is("sign",low))f.type="sign";
    /* tra parentesi dopo un altro campo, senza etichetta: lo stesso valore in lettere */
    if(f.paren&&f.type==="text"&&!f.label&&pl)f.label=(prev.label+" "+(L.inWords||"")).trim();
    if(f.comb){
      if(P.post===f.comb&&(!f.label||is("postcode",low))){f.type="number";f.fmt="int"}
      else if(!f.label&&P.tax===f.comb)f.label=P.taxName||"";
    }
    if(!f.label&&pl)f.label=prev.label+" (2)";
    prev2=prev;prev=f;
  });
  /* nomi unici e mai vuoti */
  var used={};
  fields.forEach(function(f,i){
    var nm=(f.label||t("fieldN",{n:nf(i+1)})).trim();
    if(used[nm]){used[nm]++;nm=nm+" ("+used[nm]+")"}else used[nm]=1;
    f.name=nm;f.req=false;
  });
  return fields;
}

/* ---------- pagine: PDF (pdf.js) o immagini (da Cattura) ---------- */
var pdfjsP=null;
function pdfjs(){
  if(!pdfjsP)pdfjsP=import(new URL("vendor/pdfjs/pdf.min.mjs",location.href).href).then(function(m){
    m.GlobalWorkerOptions.workerSrc=new URL("vendor/pdfjs/pdf.worker.min.mjs",location.href).href;return m;
  }).catch(function(e){pdfjsP=null;throw e});
  return pdfjsP;
}
/* ogni pagina del PDF a 200 dpi, con le parole del testo vero (se c'è) in pixel della pagina */
async function pdfPages(bytes){
  var lib=await pdfjs(),doc=await lib.getDocument({data:bytes.slice(0),isEvalSupported:false}).promise,out=[];
  for(var i=1;i<=doc.numPages&&i<=C.maxPages;i++){
    var p=await doc.getPage(i),vp=p.getViewport({scale:DPI/72}),cv=document.createElement("canvas");
    cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);
    var g=cv.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,cv.width,cv.height);
    await p.render({canvasContext:g,viewport:vp}).promise;
    var words=[];
    try{
      var tc=await p.getTextContent();
      tc.items.forEach(function(it){
        if(!it.str||!it.str.trim())return;
        var m=lib.Util.transform(vp.transform,it.transform),fh=Math.hypot(m[2],m[3]),x=m[4],yb=m[5],wd=it.width*DPI/72;
        /* un pezzo di testo diventa parole, con la larghezza divisa in proporzione ai caratteri */
        var s=it.str,per=wd/Math.max(1,s.length),re=/\S+/g,mt;
        while((mt=re.exec(s))){var wx=x+mt.index*per;words.push({t:mt[0],x:wx,y:yb-fh*.8,w:mt[0].length*per,h:fh*.8,x1:wx+mt[0].length*per,y1:yb,conf:null})}
      });
    }catch(e){}
    var vp1=p.getViewport({scale:1});
    out.push({n:i-1,cv:cv,words:words,wPt:vp1.width,hPt:vp1.height});
    p.cleanup();
  }
  try{doc.destroy()}catch(e){}
  return out;
}
/* pagina da un’immagine (Cattura): portata a 200 dpi supponendo la larghezza di un A4 (210 mm in verticale, 297 in orizzontale) */
async function imgPage(blob,n){
  var bmp=await createImageBitmap(blob),land=bmp.width>bmp.height,mmW=land?297:210,W=Math.round(mmW/25.4*DPI),k=W/bmp.width;
  var cv=document.createElement("canvas");cv.width=W;cv.height=Math.round(bmp.height*k);
  var g=cv.getContext("2d");g.imageSmoothingQuality="high";g.drawImage(bmp,0,0,cv.width,cv.height);if(bmp.close)bmp.close();
  var pt=842/Math.max(cv.width,cv.height);
  return {n:n,cv:cv,words:null,wPt:cv.width*pt,hPt:cv.height*pt};
}

/* ---------- stato e schermata (R-CPL-02…11) ---------- */
var S={src:null,pages:[],fields:[],sel:-1,view:"fields",adding:false,name:"modulo",filled:false,zoom:0};
/* ingrandimento delle pagine nel passo 2: al telefono si parte da 2×, la pagina si scorre di lato */
function zoom(){if(!S.zoom)S.zoom=window.innerWidth<600?2:1;return S.zoom}
window.__cpl=S;
function busy(){return S.pages.length>0}
var TYPES=[["text","typeText","Aa"],["number","typeNum","123"],["date","typeDate",""],["list","typeList",""],["check","typeCheck",""]];
var COL={text:"#7b5cff",number:"#13a57f",date:"#ef5b8b",list:"#b38600",check:"#1f7fb8",sign:"#5a5a6e"};
function tyName(ty){return ty==="sign"?t("typeSign"):t({text:"typeText",number:"typeNum",date:"typeDate",list:"typeList",check:"typeCheck"}[ty])}

function panel(tag){var s=el("section","panel");s.appendChild(el("div","tag",tag));return s}
function btn(cls,label,fn,icon){var b=el("button","btn "+cls);b.type="button";if(icon)b.innerHTML=icon;b.appendChild(document.createTextNode(label));b.addEventListener("click",fn);return b}
var ICON={
  cam:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.2h3.6l1.7-2.6h7.4l1.7 2.6H21v10.6H3z"/><circle cx="12" cy="13.4" r="3.4"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg>',
  plus:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  play:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
  save:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  back:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  cal:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  list:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"/></svg>',
  check:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 12l3 3 7-7"/></svg>'
};
function tyIcon(ty){return ty==="date"?ICON.cal:ty==="list"?ICON.list:ty==="check"?ICON.check:""}

function render(){
  saveSoon();
  var box=$("fill");if(!box)return;
  box.textContent="";
  if(!APP.isFill())return;
  if(!S.pages.length){renderStart(box);return}
  if(S.view==="try"){renderTry(box);return}
  if(S.view==="save"){renderSave(box);return}
  renderFields(box);
}
/* passo 1 (R-CPL-02) */
function renderStart(box){
  var p1=panel(t("fillS1")),tray=el("div","tray fillTray");
  tray.appendChild(el("p",null,t("fillDrop")));
  var acts=el("div","fillPick");
  var cam=btn("go fillCam","",function(){APP.toCapture("camera")},ICON.cam);
  var lab=el("span","two");lab.appendChild(el("span",null,t("fillShoot")));lab.appendChild(el("small",null,t("fillShootSub")));cam.appendChild(lab);
  acts.appendChild(cam);
  var pick=el("label","btn alt");pick.appendChild(el("span",null,t("fillPick")));
  var inp=document.createElement("input");inp.type="file";inp.className="vh";inp.accept="application/pdf,.pdf,image/*";inp.multiple=true;
  inp.addEventListener("change",function(){var fs=Array.from(inp.files||[]);inp.value="";if(fs.length)openFiles(fs)});
  pick.appendChild(inp);acts.appendChild(pick);
  tray.appendChild(acts);p1.appendChild(tray);box.appendChild(p1);
  tray.addEventListener("dragover",function(e){e.preventDefault();tray.classList.add("over")});
  tray.addEventListener("dragleave",function(){tray.classList.remove("over")});
  tray.addEventListener("drop",function(e){e.preventDefault();tray.classList.remove("over");var fs=Array.from(e.dataTransfer&&e.dataTransfer.files||[]);if(fs.length)openFiles(fs)});
  var off=panel(t("fillS2"));off.classList.add("off");off.appendChild(el("div","tag",t("fillS3")));box.appendChild(off);
  var hint=el("div","fillHint");hint.innerHTML=ICON.arrow;hint.appendChild(el("span",null,t("fillFromCap")));box.appendChild(hint);
}
async function openFiles(fs){
  var pdf=fs.filter(function(f){return /\.pdf$/i.test(f.name)||f.type==="application/pdf"})[0];
  if(pdf){await loadPdf(pdf);return}
  var imgs=fs.filter(function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)});
  if(imgs.length)APP.toCapture("gallery",imgs);
  else APP.say(t("fillNoFile"),true);
}
function baseName(n){return String(n||"modulo").replace(/\.[^.]+$/,"").replace(/[\\/:*?"<>|]+/g,"-").slice(0,80)||"modulo"}
async function loadPdf(file){
  var bytes=new Uint8Array(await file.arrayBuffer());
  S.name=baseName(file.name);
  await analyze({kind:"pdf",bytes:bytes});
}
/* da Cattura: pagine già raddrizzate (blob JPEG) con il sistema di scrittura riconosciuto */
async function fromCapture(pages,name){
  S.name=name||"modulo";
  await analyze({kind:"img",pages:pages});
}
/* la lente (R-CPL-04): schermata a tutto schermo, musica «scansione», contatore dei campi */
var cancel=false;
async function analyze(src){
  cancel=false;sessDrop();
  APP.lensOn(t("fillReading"));
  var pages=[],fields=[],D=null,stopped=function(){return cancel||APP.cancelled()};
  try{
    if(src.kind==="pdf")pages=await pdfPages(src.bytes);
    else for(var i=0;i<src.pages.length;i++)pages.push(Object.assign(await imgPage(src.pages[i].blob,i),{script:src.pages[i].script,blob:src.pages[i].blob}));
    if(!pages.length)throw new Error("nessuna pagina");
    var code=APP.ocrLangFor(pages[0].script||null)||"eng",lc=TESS2LANG[code]||APP.lang();
    /* lingua del modulo: dalle parole della prima pagina letta (testo vero o Tesseract); il sistema di scrittura dà la prima ipotesi */
    var langOf=async function(words){
      if(!D){
        lc=await formLang(words,lc);var L=await langData(lc);if(!L&&lc!==APP.lang())L=await langData(APP.lang());
        /* elenchi e caselle del paese: quello dell'utente se il modulo è nella sua lingua, altrimenti quello della lingua del modulo */
        D={L:L,P:await packData(lc===APP.lang()?country():MAINLAND[lc])};
      }
      return D;
    };
    var base=0;
    for(var j=0;j<pages.length;j++){
      if(stopped())break;
      APP.lensPage(pages[j].cv,j,pages.length);
      pages[j].code=APP.ocrLangFor(pages[j].script||null)||code;
      var fs=await findFields(pages[j],langOf,function(n){APP.lensCount(t("fillFound",{n:nf(base+n)}))},stopped);
      fs.forEach(function(f){APP.lensMark(f,COL[f.type]||COL.text)});
      fields=fields.concat(fs);base=fields.length;
    }
  }catch(e){console.error(e);pages=null}
  var was=await APP.lensOff();
  if(was||stopped()){render();return}
  if(!pages){APP.say(t("failed"),true);render();return}
  S.src=src;S.pages=pages.map(function(p){var b=p.blob||dataBlob(p.cv),u=URL.createObjectURL(b);return {n:p.n,W:p.cv.width,H:p.cv.height,wPt:p.wPt,hPt:p.hPt,url:u,blob:p.blob||null,img:b,script:p.script||null,code:p.code}});
  pages.forEach(function(p){p.cv.width=p.cv.height=0});
  S.fields=fields;S.sel=-1;S.view="fields";S.filled=false;S.pack=D&&D.P||null;
  APP.stat("compila/campi/"+APP.bucket(fields.length));
  APP.say(fields.length?t("fillFoundMsg",{n:nf(fields.length)}):t("fillNone"),!fields.length);
  render();
  try{window.scrollTo({top:0,behavior:"smooth"})}catch(e){}
}
function dataBlob(cv){
  var u=cv.toDataURL("image/jpeg",.82),b=atob(u.split(",")[1]),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);
  return new Blob([a],{type:"image/jpeg"});
}
/* passo 2: campi sopra le pagine (R-CPL-07…09) */
function counts(){var c={};S.fields.forEach(function(f){var k=f.type==="sign"?"text":f.type;c[k]=(c[k]||0)+1});return c}
function renderFields(box){
  var p2=panel(t("fillS2"));
  p2.appendChild(el("p","hint",S.adding?t("fillDrawTip"):t("fillFieldsTip",{n:nf(S.fields.length)})));
  var cs=counts(),chips=el("div","fchips");
  TYPES.forEach(function(x){if(!cs[x[0]])return;var c=el("span","fchip");c.style.setProperty("--c",COL[x[0]]);c.innerHTML=tyIcon(x[0]);if(x[2])c.appendChild(el("b",null,x[2]));c.appendChild(document.createTextNode(t(x[1])+" "+nf(cs[x[0]])));chips.appendChild(c)});
  var zb=el("span","fzoom");
  [["−",-1],["+",1]].forEach(function(z){var b=el("button","btn alt sm",z[0]);b.type="button";b.setAttribute("aria-label",t(z[1]<0?"fillZoomOut":"fillZoomIn"));b.disabled=z[1]<0?zoom()<=1:zoom()>=3;b.addEventListener("click",function(){S.zoom=Math.max(1,Math.min(3,zoom()+z[1]));render()});zb.appendChild(b)});
  chips.appendChild(zb);
  p2.appendChild(chips);
  p2.appendChild(scroller("edit"));
  var bar=el("div","fillBar");
  var add=btn("alt"+(S.adding?" on":""),t("fillAdd"),function(){S.adding=!S.adding;S.sel=-1;render()},ICON.plus);add.setAttribute("aria-pressed",String(S.adding));
  bar.appendChild(add);
  bar.appendChild(btn("alt",t("fillTry"),function(){S.view="try";S.sel=-1;S.adding=false;render();top()},ICON.play));
  bar.appendChild(btn("ok",t("fillSave"),function(){S.view="save";S.sel=-1;S.adding=false;render();top()},ICON.save));
  p2.appendChild(bar);
  box.appendChild(p2);
  var p3=panel(t("fillS3"));p3.classList.add("off");box.appendChild(p3);
  if(S.sel>=0&&S.fields[S.sel])box.appendChild(sheet(S.fields[S.sel]));
}
/* le pagine ingrandite si scorrono di lato: si parte dal margine sinistro dei campi */
function scroller(how){
  /* la pagina è un foglio: da sinistra a destra anche quando l'app è in arabo o in urdu */
  var sc=el("div","fscroll z"+zoom());sc.dir="ltr";sc.style.setProperty("--z",zoom());
  S.pages.forEach(function(pg,pi){sc.appendChild(pageView(pg,pi,how))});
  if(zoom()>1){
    var f=S.fields[S.sel]||null,x=1;
    if(!f)S.fields.forEach(function(g){if(g.page===0&&g.x0/S.pages[0].W<x)x=g.x0/S.pages[0].W});
    else x=f.x0/S.pages[f.page].W;
    requestAnimationFrame(function(){if(x<1)sc.scrollLeft=Math.max(0,x*sc.scrollWidth-40)});
  }
  return sc;
}
function top(){try{$("fill").scrollIntoView({behavior:"smooth",block:"start"})}catch(e){}}
function pct(v,tot){return (v/tot*100)+"%"}
/* una pagina con i campi: in modifica (riquadri colorati, trascinabili) o in prova (campi veri) */
function pageView(pg,pi,how){
  var wrap=el("div","fpage");wrap.style.aspectRatio=pg.W+" / "+pg.H;
  var im=document.createElement("img");im.src=pg.url;im.alt=t("pageN",{n:nf(pi+1)});im.draggable=false;wrap.appendChild(im);
  S.fields.forEach(function(f,fi){
    if(f.page!==pi)return;
    var b=how==="edit"?fieldBox(f,fi,pg):tryInput(f,fi,pg);
    b.style.left=pct(f.x0,pg.W);b.style.top=pct(f.y0,pg.H);b.style.width=pct(f.x1-f.x0,pg.W);b.style.height=pct(f.y1-f.y0,pg.H);
    wrap.appendChild(b);
  });
  if(how==="edit"&&S.adding)drawLayer(wrap,pg,pi);
  return wrap;
}
function fieldBox(f,fi,pg){
  var b=el("button","fbox"+(S.sel===fi?" sel":""));b.type="button";b.style.setProperty("--c",COL[f.type]||COL.text);
  b.setAttribute("aria-label",f.name+" · "+tyName(f.type));
  var tag=el("span","ftag");tag.innerHTML=tyIcon(f.type);tag.appendChild(el("span",null,f.name));b.appendChild(tag);
  b.addEventListener("click",function(e){if(b._moved){b._moved=false;return}S.sel=fi;S.adding=false;render()});
  if(S.sel===fi){
    var hd=el("span","fgrip");hd.setAttribute("aria-hidden","true");b.appendChild(hd);
    dragMove(b,f,pg,hd);
  }
  return b;
}
/* il campo selezionato si sposta trascinandolo; dalla maniglia nell'angolo si ridimensiona */
function dragMove(b,f,pg,grip){
  var st=null;
  b.addEventListener("pointerdown",function(e){
    var wrap=b.parentNode,r=wrap.getBoundingClientRect();
    st={x:e.clientX,y:e.clientY,k:pg.W/r.width,f:{x0:f.x0,y0:f.y0,x1:f.x1,y1:f.y1},size:e.target===grip,moved:false};
    try{b.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();
  });
  b.addEventListener("pointermove",function(e){
    if(!st)return;var dx=(e.clientX-st.x)*st.k,dy=(e.clientY-st.y)*st.k;
    if(Math.abs(dx)+Math.abs(dy)>4)st.moved=true;if(!st.moved)return;
    if(st.size){f.x1=Math.max(st.f.x0+20,Math.min(pg.W,st.f.x1+dx));f.y1=Math.max(st.f.y0+14,Math.min(pg.H,st.f.y1+dy))}
    else{var w=st.f.x1-st.f.x0,h=st.f.y1-st.f.y0;f.x0=Math.max(0,Math.min(pg.W-w,st.f.x0+dx));f.y0=Math.max(0,Math.min(pg.H-h,st.f.y0+dy));f.x1=f.x0+w;f.y1=f.y0+h}
    b.style.left=pct(f.x0,pg.W);b.style.top=pct(f.y0,pg.H);b.style.width=pct(f.x1-f.x0,pg.W);b.style.height=pct(f.y1-f.y0,pg.H);
  });
  function up(){if(st&&st.moved)b._moved=true;st=null}
  b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);
}
/* «+ Campo» (R-CPL-09): si trascina per disegnare; il campo si aggancia alla riga più vicina sotto */
function drawLayer(wrap,pg,pi){
  var lay=el("div","fdraw"),ghost=null,st=null;
  lay.addEventListener("pointerdown",function(e){
    var r=wrap.getBoundingClientRect();st={r:r,k:pg.W/r.width,x:(e.clientX-r.left),y:(e.clientY-r.top)};
    ghost=el("div","fghost");lay.appendChild(ghost);try{lay.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();
  });
  lay.addEventListener("pointermove",function(e){
    if(!st)return;var x=e.clientX-st.r.left,y=e.clientY-st.r.top;
    ghost.style.left=Math.min(x,st.x)+"px";ghost.style.top=Math.min(y,st.y)+"px";ghost.style.width=Math.abs(x-st.x)+"px";ghost.style.height=Math.abs(y-st.y)+"px";
  });
  lay.addEventListener("pointerup",function(e){
    if(!st)return;var x=e.clientX-st.r.left,y=e.clientY-st.r.top,k=st.k;
    var x0=Math.min(x,st.x)*k,x1=Math.max(x,st.x)*k,y0=Math.min(y,st.y)*k,y1=Math.max(y,st.y)*k;st=null;
    var mm=DPI/25.4;if(x1-x0<4*mm){x1=x0+40*mm}if(y1-y0<3*mm){y0=y1-5*mm}
    var f=snapNew({page:pi,x0:x0,y0:y0,x1:x1,y1:y1,type:"text",fmt:"",read:"",where:"left"},pg);
    S.fields.push(f);S.sel=S.fields.length-1;S.adding=false;render();
  });
  wrap.appendChild(lay);
}
function snapNew(f,pg){
  /* aggancio: il fondo del campo va sulla riga di un campo vicino della stessa altezza, se c'è */
  var mm=DPI/25.4,best=null;
  S.fields.forEach(function(o){if(o.page===f.page&&Math.abs(o.y1-f.y1)<3*mm&&(!best||Math.abs(o.y1-f.y1)<Math.abs(best.y1-f.y1)))best=o});
  if(best){var h=f.y1-f.y0;f.y1=best.y1;f.y0=f.y1-Math.max(h,best.y1-best.y0)}
  var n=S.fields.length+1;f.name=t("fieldN",{n:nf(n)});f.label=f.name;f.req=false;
  return f;
}
/* foglio in basso: nome, tipo, formato, voci della lista, obbligatorio (R-CPL-07/08) */
function sheet(f){
  var sh=el("div","fsheet");sh.setAttribute("role","dialog");sh.setAttribute("aria-label",f.name);
  sh.appendChild(el("h3",null,f.name));
  if(f.read)sh.appendChild(el("p","hint",t("fillRead",{s:f.read})));
  var nl=el("label","flab",t("fillName")),ni=document.createElement("input");ni.type="text";ni.value=f.name;ni.className="fin";
  ni.addEventListener("input",function(){f.name=ni.value;sh.querySelector("h3").textContent=ni.value||"…"});
  nl.appendChild(ni);sh.appendChild(nl);
  sh.appendChild(el("p","flab",t("fillType")));
  /* un tipo per riga: icona nel colore del tipo, nome, pallino a destra (R-CPL-07, proposta A) */
  var seg=el("div","ftypes");seg.setAttribute("role","radiogroup");seg.setAttribute("aria-label",t("fillType"));
  TYPES.forEach(function(x){
    var on=f.type===x[0]||(x[0]==="text"&&f.type==="sign");
    var b=el("button","ftype");b.type="button";b.style.setProperty("--c",COL[x[0]]);b.setAttribute("role","radio");b.setAttribute("aria-checked",String(on));
    var ic=el("span","ic");ic.innerHTML=tyIcon(x[0]);if(x[2])ic.textContent=x[2];b.appendChild(ic);
    b.appendChild(el("span","nm",t(x[1])));b.appendChild(el("span","ok"));
    b.addEventListener("click",function(){setType(f,x[0]);render()});seg.appendChild(b);
  });
  sh.appendChild(seg);
  if(f.type==="date"||f.type==="number"){
    sh.appendChild(el("p","flab",t("fillFmt")));
    var fs=el("div","seg sm"),opts=f.type==="date"?[["dmy",fmtPattern("dmy")],["my",fmtPattern("my")],["y",fmtPattern("y")]]:[["int",t("fmtInt")],["dec",t("fmtDec")],["money",t("fmtMoney")]];
    opts.forEach(function(o){var b=el("button",null,o[1]);b.type="button";b.setAttribute("aria-pressed",String((f.fmt||opts[0][0])===o[0]));b.addEventListener("click",function(){f.fmt=o[0];render()});fs.appendChild(b)});
    sh.appendChild(fs);
  }
  if(f.type==="list")sh.appendChild(listEditor(f));
  if(f.type!=="check"){
    var rl=el("label","check"),rc=document.createElement("input");rc.type="checkbox";rc.checked=!!f.req;
    rc.addEventListener("change",function(){f.req=rc.checked});rl.appendChild(rc);rl.appendChild(APP.checkBx());rl.appendChild(el("span",null,t("fillReq")));sh.appendChild(rl);
  }
  var bt=el("div","acts");
  bt.appendChild(btn("danger",t("fillDel"),function(){S.fields.splice(S.sel,1);S.sel=-1;render()}));
  bt.appendChild(btn("ok",t("fillDone"),function(){S.sel=-1;render()}));
  sh.appendChild(bt);
  setTimeout(function(){APP.fitBtns(bt)},0);
  return sh;
}
function setType(f,ty){
  f.type=ty;f.fmt=ty==="date"?"dmy":ty==="number"?"int":"";
  if(ty==="list"&&!f.items)f.items=[];
  if(ty==="check"){var mm=DPI/25.4,s=Math.min(6*mm,f.y1-f.y0);f.x1=f.x0+s;f.y0=f.y1-s}
}
function listEditor(f){
  var box=el("div","flist");
  box.appendChild(el("p","flab",t("fillItems")));
  var chips=el("div","fitems"),items=f.items||(f.items=[]);
  var show=items.slice(0,C.listShow);
  show.forEach(function(v,i){var c=el("span","fitem");c.appendChild(document.createTextNode(v));var x=el("button","fx","×");x.type="button";x.setAttribute("aria-label",t("fillItemDel",{s:v}));x.addEventListener("click",function(){items.splice(i,1);render()});c.appendChild(x);chips.appendChild(c)});
  if(items.length>show.length)chips.appendChild(el("span","fitem more",t("fillMore",{n:nf(items.length-show.length)})));
  box.appendChild(chips);
  var row=el("div","frow"),inp=document.createElement("input");inp.type="text";inp.className="fin";inp.placeholder=t("fillNewItem");
  function add(){var v=inp.value.trim();if(v&&items.indexOf(v)<0){items.push(v);render()}}
  inp.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();add()}});
  row.appendChild(inp);row.appendChild(btn("alt sm",t("fillAddItem"),add));box.appendChild(row);
  box.appendChild(el("p","flab",t("fillReady")));
  var rd=el("div","fready");
  readyLists().forEach(function(r){var b=btn("alt sm",r.name,function(){r.items.forEach(function(v){if(items.indexOf(v)<0)items.push(v)});render()});rd.appendChild(b)});
  box.appendChild(rd);
  var el2=el("label","check"),ec=document.createElement("input");ec.type="checkbox";ec.checked=!!f.edit;
  ec.addEventListener("change",function(){f.edit=ec.checked});el2.appendChild(ec);el2.appendChild(APP.checkBx());el2.appendChild(el("span",null,t("fillEdit")));box.appendChild(el2);
  return box;
}
/* elenchi pronti: province del paese (se il file del paese le ha), sì/no, mesi e paesi nella lingua dell'app */
function readyLists(){
  var out=[],P=S.pack||PACKS[country()],loc=APP.lang();
  if(P&&P.lists)Object.keys(P.lists).forEach(function(k){out.push(P.lists[k])});
  out.push({name:t("yes")+" / "+t("no"),items:[t("yes"),t("no")]});
  try{var mf=new Intl.DateTimeFormat(loc,{month:"long"}),ms=[];for(var i=0;i<12;i++)ms.push(mf.format(new Date(2033,i,15)));out.push({name:t("fillMonths"),items:ms})}catch(e){}
  try{
    var dn=new Intl.DisplayNames([loc],{type:"region"}),cs=[];
    C.regions.split(" ").forEach(function(r){try{var n=dn.of(r.toUpperCase());if(n&&n!==r.toUpperCase())cs.push(n)}catch(e){}});
    cs.sort(function(a,b){return a.localeCompare(b,loc)});out.push({name:t("fillCountries"),items:cs});
  }catch(e){}
  return out;
}
/* Prova (R-CPL-10): campi veri dell'app sopra la pagina */
function tryInput(f,fi,pg){
  var w=el("div","ftry");
  var inp;
  if(f.type==="check"){inp=document.createElement("input");inp.type="checkbox";inp.checked=!!f.value;inp.addEventListener("change",function(){f.value=inp.checked;S.filled=true;saveSoon()})}
  else if(f.type==="list"){
    if(f.edit){inp=document.createElement("input");inp.type="text";var dl=document.createElement("datalist");dl.id="fdl"+fi;(f.items||[]).forEach(function(v){var o=document.createElement("option");o.value=v;dl.appendChild(o)});w.appendChild(dl);inp.setAttribute("list",dl.id)}
    else{inp=document.createElement("select");[""].concat(f.items||[]).forEach(function(v){var o=el("option",null,v);o.value=v;inp.appendChild(o)})}
    inp.value=f.value||"";inp.addEventListener("change",function(){f.value=inp.value;S.filled=true;saveSoon()});inp.addEventListener("input",function(){f.value=inp.value;S.filled=!!inp.value||S.filled;saveSoon()});
  }
  else if(f.type==="date"&&(f.fmt||"dmy")==="dmy"){inp=document.createElement("input");inp.type="date";inp.value=f.iso||"";inp.addEventListener("change",function(){f.iso=inp.value;f.value=isoTo(inp.value);S.filled=true;saveSoon()})}
  else{
    inp=document.createElement("input");inp.type="text";
    if(f.type==="number"){inp.inputMode=f.fmt==="int"?"numeric":"decimal"}
    if(f.type==="date"){inp.inputMode="numeric";inp.placeholder=fmtPattern(f.fmt)}
    var mx=f.comb||f.max;if(mx)inp.maxLength=mx;
    inp.value=f.value!=null?f.value:(f.prefill||"");
    inp.addEventListener("input",function(){f.value=inp.value;S.filled=true;saveSoon()});
  }
  inp.className="ftin";inp.setAttribute("aria-label",f.name);if(f.req)inp.required=true;
  if(f.comb)w.classList.add("comb");
  w.appendChild(inp);
  return w;
}
function isoTo(iso){
  if(!iso)return "";var p=iso.split("-"),f=dateFmt(),m={y:p[0],m:p[1],d:p[2]};
  return f.order.split("").map(function(c){return m[c]}).join(f.sep);
}
function renderTry(box){
  var p=panel(t("fillTry"));p.appendChild(el("p","hint",t("fillTryTip")));
  p.appendChild(scroller("try"));
  var bt=el("div","acts");
  bt.appendChild(btn("alt",t("fillBack"),function(){S.view="fields";render();top()},ICON.back));
  bt.appendChild(btn("ok",t("fillSave"),function(){S.view="save";render();top()},ICON.save));
  p.appendChild(bt);setTimeout(function(){APP.fitBtns(bt)},0);
  box.appendChild(p);
}
/* passo 3 (R-CPL-11): due salvataggi separati, il modello in colore principale */
function renderSave(box){
  var p=panel(t("fillS3"));p.classList.add("fsave");
  p.appendChild(el("p","fq",t("fillSaveQ")));
  function big(cls,title,sub,fn,dis){
    var b=el("button","btn lg fbig "+cls);b.type="button";b.disabled=!!dis;
    var th=el("span","fthumb"),im=document.createElement("img");im.src=S.pages[0].url;im.alt="";th.appendChild(im);
    if(cls==="ok")th.appendChild(el("span","fmark"));
    b.appendChild(th);var tx=el("span","two");tx.appendChild(el("span",null,title));tx.appendChild(el("small",null,sub));b.appendChild(tx);
    b.addEventListener("click",fn);return b;
  }
  p.appendChild(big("ok",t("fillSaveModel"),t("fillSaveModelSub"),function(){save(false)}));
  p.appendChild(big("alt",t("fillSaveTry"),S.filled?t("fillSaveTrySub"):t("fillSaveTryNone"),function(){save(true)},!S.filled));
  p.appendChild(el("p","hint",t("fillSaveNote")));
  var bt=el("div","acts");bt.appendChild(btn("alt",t("fillBackFields"),function(){S.view="fields";render();top()},ICON.back));p.appendChild(bt);
  box.appendChild(p);
}

/* ---------- PDF compilabile (R-CPL-16) ---------- */
async function build(withValues){
  var L=await APP.pdfLib();if(!L)throw new Error("pdf-lib");
  var doc=await L.PDFDocument.create(),font=await doc.embedFont(L.StandardFonts.Helvetica),form=doc.getForm(),ctx=doc.context;
  var src=S.src.kind==="pdf"?await L.PDFDocument.load(S.src.bytes,{ignoreEncryption:true}):null;
  function js(code){return ctx.obj({Type:"Action",S:"JavaScript",JS:L.PDFString.of(code)})}
  var used={},bad=false;
  for(var i=0;i<S.pages.length;i++){
    var pg=S.pages[i],page,pw=pg.wPt,ph=pg.hPt;
    if(src){var emb=(await doc.embedPdf(src,[pg.n]))[0];page=doc.addPage([emb.width,emb.height]);page.drawPage(emb,{x:0,y:0,width:emb.width,height:emb.height});pw=emb.width;ph=emb.height}
    else{
      var img=await doc.embedJpg(new Uint8Array(await pg.blob.arrayBuffer()));page=doc.addPage([pw,ph]);page.drawImage(img,{x:0,y:0,width:pw,height:ph});
      /* testo invisibile sopra la foto (R-SCN-25): sempre acceso in Compila */
      try{
        APP.loaderTitle(t("ocrRead",{i:nf(i+1),n:nf(S.pages.length)}));
        var w=await APP.ocrRecWorker(pg.code||"eng");await w.setParameters({tessedit_pageseg_mode:"3"});
        var r=await w.recognize(pg.blob,{pdfTextOnly:true},{pdf:true,text:false});APP.ocrTouch();
        if(r&&r.data&&r.data.pdf){var te=(await doc.embedPdf(new Uint8Array(r.data.pdf),[0]))[0];page.drawPage(te,{x:0,y:0,width:pw,height:ph})}
      }catch(e){}
    }
    var k=pw/pg.W;
    S.fields.forEach(function(f){
      if(f.page!==i)return;
      var nm=(f.name||"campo").replace(/[.\\]/g," ").trim()||"campo";
      if(used[nm]){used[nm]++;nm+=" "+used[nm]}else used[nm]=1;
      var x=f.x0*k,w=(f.x1-f.x0)*k,hh=(f.y1-f.y0)*k,y=ph-f.y1*k,fs=Math.max(C.fontMin,Math.min(C.fontMax,hh*.8));
      var opt={x:x,y:y,width:w,height:Math.max(hh,f.type==="check"?hh:fs*1.3),borderWidth:0,font:font},fld;
      if(f.type==="check"){
        fld=form.createCheckBox(nm);fld.addToPage(page,{x:x,y:y,width:w,height:hh,borderWidth:0});
        if(withValues&&f.value)fld.check();
      }else if(f.type==="list"){
        fld=form.createDropdown(nm);var items=(f.items||[]).filter(function(v){return v});
        try{fld.addOptions(items)}catch(e){fld.addOptions(items.map(ascii))}
        if(f.edit)fld.enableEditing();fld.addToPage(page,opt);
        if(withValues&&f.value)try{fld.select(f.value,true)}catch(e){bad=true}
        fld.setFontSize(fs);
      }else{
        fld=form.createTextField(nm);fld.addToPage(page,opt);
        var mx=f.comb||f.max;if(mx){fld.setMaxLength(mx);if(f.comb)try{fld.enableCombing()}catch(e){}}
        var K=null,F=null,pat;
        if(f.type==="date"){pat=fmtPattern(f.fmt||"dmy",true);K='AFDate_KeystrokeEx("'+pat+'");';F='AFDate_FormatEx("'+pat+'");'}
        else if(f.type==="number"&&(f.fmt==="money"||f.fmt==="dec")){var sep=decSep()===","?2:0;K="AFNumber_Keystroke(2,"+sep+",0,0,\"\",true);";F="AFNumber_Format(2,"+sep+",0,0,\""+(f.fmt==="money"?C.money:"")+"\",false);"}
        else if(f.type==="number")K="if(!event.willCommit)event.rc=/^[0-9 +\\-\\/]*$/.test(event.change);";
        if(K)fld.acroField.dict.set(L.PDFName.of("AA"),ctx.obj({K:js(K),F:js(F||K)}));
        if(f.req)fld.enableRequired();
        var v=withValues?(f.value!=null?f.value:f.prefill||""):(f.prefill||"");
        if(v)try{fld.setText(String(v).slice(0,mx||1e4))}catch(e){bad=true}
        fld.setFontSize(fs);
      }
      fld.acroField.dict.set(L.PDFName.of("TU"),L.PDFHexString.fromText(f.name||nm));
    });
  }
  /* valori in alfabeti che Helvetica non ha: li disegna il programma che apre il PDF */
  try{form.updateFieldAppearances(font)}catch(e){bad=true}
  if(bad)try{form.acroForm.dict.set(L.PDFName.of("NeedAppearances"),L.PDFBool.True)}catch(e){}
  return new Blob([await doc.save({useObjectStreams:true,updateFieldAppearances:false})],{type:"application/pdf"});
}
function ascii(s){return String(s).normalize("NFD").replace(/[^\x20-\x7e]/g,"")}
async function save(withValues){
  APP.loaderOn("scan",t("buildPdf"));
  var blob=null;try{blob=await build(withValues)}catch(e){console.error(e)}
  await APP.loaderOff();
  if(!blob){APP.say(t("failed"),true);return}
  var nm=S.name+"-"+t(withValues?"fillSufTry":"fillSufModel")+".pdf";
  if(await APP.saveBlob(nm,blob)){
    APP.say(t("saved",{name:APP.savedAs()}));APP.stat(withValues?"compila/salva-prova":"compila/salva-modello");APP.festa();
    /* salvato: il lavoro sul dispositivo non serve più, finché non si cambia ancora qualcosa (R-APP-18) */
    sessDrop();S.cleanSig=sig();
  }
}

/* ---------- lavoro salvato sul dispositivo (R-APP-18): modulo di partenza, pagine, campi e valori della prova ---------- */
function sig(){return JSON.stringify([S.fields,S.view,S.filled])}
function saveSoon(){if(!S.pages.length)return;clearTimeout(S.saveT);S.saveT=setTimeout(saveNow,1500)}
function sessDrop(){clearTimeout(S.saveT);if(S.sid){APP.jobDrop(S.sid);S.sid=null}S.stored=false}
async function saveNow(){
  clearTimeout(S.saveT);if(!S.pages.length||S.saving)return;
  var g=sig();if(g===S.cleanSig||g===S.lastSig&&S.sid)return;
  S.saving=true;
  try{
    if(!S.sid){S.sid="f"+Date.now();S.stored=false}
    var id=S.sid;
    if(!S.stored){
      if(S.src.kind==="pdf")await APP.filePut(id,"src",new Blob([S.src.bytes],{type:"application/pdf"}));
      for(var i=0;i<S.pages.length;i++)await APP.filePut(id,"pg"+i,S.pages[i].img||S.pages[i].blob);
      S.stored=true;
    }
    if(S.sid!==id)return;
    await APP.jobPut({id:id,v:APP.JOBV(),kind:"fill",t:Date.now(),name:S.name,src:S.src.kind,view:S.view,zoom:S.zoom,filled:S.filled,pack:S.pack||null,fields:S.fields,
      pages:S.pages.map(function(p){return {n:p.n,W:p.W,H:p.H,wPt:p.wPt,hPt:p.hPt,script:p.script,code:p.code,photo:!!p.blob}})});
    S.lastSig=g;
  }catch(e){}
  finally{S.saving=false}
}
async function restore(rec){
  var pages=[],src;
  for(var i=0;i<rec.pages.length;i++){
    var r=rec.pages[i],b=await APP.fileGet(rec.id,"pg"+i);if(!b)return false;
    pages.push({n:r.n,W:r.W,H:r.H,wPt:r.wPt,hPt:r.hPt,url:URL.createObjectURL(b),img:b,blob:r.photo?b:null,script:r.script,code:r.code});
  }
  if(rec.src==="pdf"){var sb=await APP.fileGet(rec.id,"src");if(!sb)return false;src={kind:"pdf",bytes:new Uint8Array(await sb.arrayBuffer())}}
  else src={kind:"img",pages:pages.map(function(p){return {blob:p.blob,script:p.script}})};
  S.src=src;S.pages=pages;S.fields=rec.fields||[];S.view=rec.view||"fields";S.zoom=rec.zoom||0;S.filled=!!rec.filled;S.pack=rec.pack||null;S.name=rec.name||"modulo";
  S.sel=-1;S.adding=false;S.sid=rec.id;S.stored=true;S.lastSig=sig();S.cleanSig=null;
  render();return true;
}

/* ---------- stima veloce per Cattura (R-CPL-13): solo righe e caselle, senza Tesseract ----------
   Gira in un worker, così l'app non si ferma mentre si sistemano le pagine; dove i worker non possono disegnare, nella pagina */
var qcW=null,qcN=0,qcWait={};
function qcWorker(){
  if(qcW!==null)return qcW;
  try{
    if(typeof OffscreenCanvas==="undefined")throw 0;
    var src=[grayOf,binarize,components,inkIn,findMarks,countMarks].map(String).join("\n")+
      "\nvar DPI="+DPI+";self.onmessage=async function(e){var r=-1;try{var b=await createImageBitmap(e.data.blob),land=b.width>b.height,W=Math.round((land?297:210)/25.4*DPI),k=W/b.width,H=Math.round(b.height*k),c=new OffscreenCanvas(W,H);c.getContext('2d').drawImage(b,0,0,W,H);if(b.close)b.close();r=countMarks(grayOf(c),W,H)}catch(x){}self.postMessage({id:e.data.id,n:r})};";
    qcW=new Worker(URL.createObjectURL(new Blob([src],{type:"text/javascript"})));
    qcW.onmessage=function(e){var f=qcWait[e.data.id];delete qcWait[e.data.id];if(f)f(e.data.n)};
    qcW.onerror=function(){qcW=false};
  }catch(e){qcW=false}
  return qcW;
}
function countMarks(g,W,H){
  var mm=DPI/25.4,m=findMarks(binarize(g,W,H),W,H,mm);
  /* righe vuote: niente fasce decorative (più righe sovrapposte) */
  var n=m.segs.filter(function(s){return m.segs.filter(function(o){return Math.abs(o.y-s.y)<2*mm&&Math.min(o.x1,s.x1)-Math.max(o.x0,s.x0)>.5*(s.x1-s.x0)}).length<3}).length;
  return n+m.boxes.length+m.combs.length;
}
async function quickCount(blob){
  var w=qcWorker();
  if(w){var n=await new Promise(function(res){var id=++qcN;qcWait[id]=res;w.postMessage({id:id,blob:blob})});if(n>=0)return n}
  var p=await imgPage(blob,0),W=p.cv.width,H=p.cv.height,g=grayOf(p.cv);p.cv.width=p.cv.height=0;
  return countMarks(g,W,H);
}

window.Compila={
  render:render,busy:busy,
  clear:function(){sessDrop();S.pages.forEach(function(p){URL.revokeObjectURL(p.url)});S.src=null;S.pages=[];S.fields=[];S.sel=-1;S.view="fields";S.adding=false;S.filled=false;S.cleanSig=S.lastSig=null},
  saveNow:saveNow,restore:restore,
  fromCapture:fromCapture,openFiles:openFiles,quickCount:quickCount,
  cancel:function(){cancel=true},
  /* per le prove */
  _findMarks:findMarks,_components:components,_binarize:binarize,_gray:grayOf,_build:build,_state:S
};
})();

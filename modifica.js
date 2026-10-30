/* Modifica (R-EDT): testi e immagini di un PDF già fatto, tutto sul dispositivo.
   Si scarica la prima volta che serve (R-EDT-14) e usa quello che la pagina gli passa in window.APP
   (testi, pdf-lib, Tesseract, attrezzi di Cattura per trovare i bordi e raddrizzare, salvataggio).
   Parti: matrici, lettura del contenuto delle pagine (operatori, caratteri), lettura delle scansioni,
   schermata, immagini (Raddrizza, Separa), scrittura del PDF modificato, lavoro salvato. */
(function(){
"use strict";
var APP=window.APP,CFG=window.CONFIG,E=CFG.edit;
function t(k,p){return APP.t(k,p)}
function nf(n){return APP.nf(n)}
var $=function(id){return document.getElementById(id)};
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}

/* ---------- matrici: convenzione del PDF, punto riga × matrice; mul(a,b) = prima a, poi b ---------- */
function mul(a,b){return [a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5]]}
function inv(m){var d=m[0]*m[3]-m[1]*m[2];if(!d)return [1,0,0,1,0,0];return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]}
function ap(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]}
function tr(x,y){return [1,0,0,1,x,y]}
function rot(a){var c=Math.cos(a),s=Math.sin(a);return [c,s,-s,c,0,0]}
function about(m,cx,cy){return mul(mul(tr(-cx,-cy),m),tr(cx,cy))}
function num(v){v=Math.round(v*10000)/10000;return v===0?"0":String(v)}
function same(a,b){if(!a||!b)return a===b;for(var i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1e-6)return false;return true}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}

/* ---------- contenuto della pagina: operatori con argomenti e posizione nel testo del flusso ---------- */
function tokenize(src){
  var ops=[],i=0,args=[],n=src.length;
  function ws(c){return c===32||c===10||c===13||c===9||c===12||c===0}
  function delim(c){return c===40||c===41||c===60||c===62||c===91||c===93||c===123||c===125||c===47||c===37}
  function readObj(){
    var c=src.charCodeAt(i),s=i;
    if(c===40){var d=1;i++;while(i<n&&d){var ch=src.charCodeAt(i);if(ch===92)i+=2;else{if(ch===40)d++;else if(ch===41)d--;i++}}return {t:"str",raw:src.slice(s,i)}}
    if(c===60&&src.charCodeAt(i+1)===60){var dd=0;while(i<n){if(src.charCodeAt(i)===60&&src.charCodeAt(i+1)===60){dd++;i+=2}else if(src.charCodeAt(i)===62&&src.charCodeAt(i+1)===62){dd--;i+=2;if(!dd)break}else i++}return {t:"dict",raw:src.slice(s,i)}}
    if(c===60){var e=src.indexOf(">",i);i=e<0?n:e+1;return {t:"hex",raw:src.slice(s,i)}}
    if(c===91){i++;var items=[];while(i<n){while(i<n&&ws(src.charCodeAt(i)))i++;if(i>=n)break;if(src.charCodeAt(i)===93){i++;break}if(src.charCodeAt(i)===37){while(i<n&&src[i]!=="\n"&&src[i]!=="\r")i++;continue}items.push(readObj())}return {t:"arr",raw:src.slice(s,i),items:items}}
    if(c===47){i++;while(i<n&&!ws(src.charCodeAt(i))&&!delim(src.charCodeAt(i)))i++;return {t:"name",raw:src.slice(s,i)}}
    if(delim(c)){i++;return {t:"junk",raw:src.slice(s,i)}}
    while(i<n&&!ws(src.charCodeAt(i))&&!delim(src.charCodeAt(i)))i++;
    var w=src.slice(s,i),v=+w;
    return w!==""&&!isNaN(v)?{t:"num",raw:w,v:v}:{t:"op",raw:w};
  }
  while(i<n){
    var c=src.charCodeAt(i);
    if(ws(c)){i++;continue}
    if(c===37){while(i<n&&src[i]!=="\n"&&src[i]!=="\r")i++;continue}
    var st=i,o=readObj();
    if(o.t==="op"){
      if(o.raw==="BI"){var id=src.indexOf("ID",i),ei=id;do{ei=src.indexOf("EI",ei+2)}while(ei>0&&!(ws(src.charCodeAt(ei-1))&&(ei+2>=n||ws(src.charCodeAt(ei+2)))));i=ei<0?n:ei+2;ops.push({op:"BI",args:[],s:st,e:i});args=[];continue}
      ops.push({op:o.raw,args:args,s:args.length?args[0].s:st,e:i});args=[];
    }else{o.s=st;args.push(o)}
  }
  return ops;
}
/* byte di una stringa del PDF, letterale (con le sequenze \…) o esadecimale */
function bytesOf(o){
  var out=[],i,s=o.raw;
  if(o.t==="hex"){var h=s.slice(1,-1).replace(/[^0-9a-fA-F]/g,"");if(h.length%2)h+="0";for(i=0;i<h.length;i+=2)out.push(parseInt(h.substr(i,2),16));return out}
  if(o.t!=="str")return out;
  i=1;var n=s.length-1;
  while(i<n){var c=s.charCodeAt(i);
    if(c===92){i++;var d=s[i];
      if(d==="n"){out.push(10);i++}else if(d==="r"){out.push(13);i++}else if(d==="t"){out.push(9);i++}else if(d==="b"){out.push(8);i++}else if(d==="f"){out.push(12);i++}
      else if(d>="0"&&d<="7"){var oc="";while(oc.length<3&&s[i]>="0"&&s[i]<="7"){oc+=s[i];i++}out.push(parseInt(oc,8)&255)}
      else if(d==="\r"){i++;if(s[i]==="\n")i++}else if(d==="\n")i++;
      else{out.push(s.charCodeAt(i)&255);i++}
    }else{out.push(c&255);i++}
  }
  return out;
}
function latin1(u8){var s="",i,C=8192;for(i=0;i<u8.length;i+=C)s+=String.fromCharCode.apply(null,u8.subarray(i,i+C));return s}
function bytesL1(s){var u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i)&255;return u}

/* ---------- caratteri: nome, larghezze, codici → testo (ToUnicode o codifica) ---------- */
var WINANSI={128:8364,130:8218,131:402,132:8222,133:8230,134:8224,135:8225,136:710,137:8240,138:352,139:8249,140:338,142:381,145:8216,146:8217,147:8220,148:8221,149:8226,150:8211,151:8212,152:732,153:8482,154:353,155:8250,156:339,158:382,159:376};
var WINREV={};Object.keys(WINANSI).forEach(function(k){WINREV[String.fromCharCode(WINANSI[k])]=+k});
var GLYPH={space:" ",exclam:"!",quotedbl:'"',numbersign:"#",dollar:"$",percent:"%",ampersand:"&",quotesingle:"'",quoteright:"’",quoteleft:"‘",parenleft:"(",parenright:")",asterisk:"*",plus:"+",comma:",",hyphen:"-",period:".",slash:"/",zero:"0",one:"1",two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",colon:":",semicolon:";",less:"<",equal:"=",greater:">",question:"?",at:"@",bracketleft:"[",backslash:"\\",bracketright:"]",asciicircum:"^",underscore:"_",grave:"`",braceleft:"{",bar:"|",braceright:"}",asciitilde:"~",quotedblleft:"“",quotedblright:"”",quotesinglbase:"‚",quotedblbase:"„",endash:"–",emdash:"—",bullet:"•",ellipsis:"…",Euro:"€",degree:"°",germandbls:"ß",ae:"æ",AE:"Æ",oslash:"ø",Oslash:"Ø",oe:"œ",OE:"Œ",guillemotleft:"«",guillemotright:"»",section:"§",copyright:"©",registered:"®",trademark:"™",nbspace:" ",minus:"−",multiply:"×",divide:"÷",dotlessi:"ı",fi:"ﬁ",fl:"ﬂ",sterling:"£",yen:"¥",cent:"¢",paragraph:"¶",periodcentered:"·",exclamdown:"¡",questiondown:"¿"};
var ACC={grave:"̀",acute:"́",circumflex:"̂",tilde:"̃",dieresis:"̈",ring:"̊",cedilla:"̧",caron:"̌"};
function glyphChar(nm){
  if(GLYPH[nm]!=null)return GLYPH[nm];
  if(nm.length===1)return nm;
  var m=/^uni([0-9A-Fa-f]{4})/.exec(nm)||/^u([0-9A-Fa-f]{4,6})$/.exec(nm);if(m)return String.fromCodePoint(parseInt(m[1],16));
  m=/^([A-Za-z])(grave|acute|circumflex|tilde|dieresis|ring|cedilla|caron)$/.exec(nm);if(m)return (m[1]+ACC[m[2]]).normalize("NFC");
  return null;
}
function u16(h){var s="";for(var i=0;i+3<h.length;i+=4)s+=String.fromCharCode(parseInt(h.substr(i,4),16));return s}
function parseCMap(s){
  var map={},m,x,re=/beginbfchar([\s\S]*?)endbfchar/g;
  while((m=re.exec(s))){var r2=/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;while((x=r2.exec(m[1])))map[parseInt(x[1],16)]=u16(x[2])}
  re=/beginbfrange([\s\S]*?)endbfrange/g;
  while((m=re.exec(s))){var r3=/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g;
    while((x=r3.exec(m[1]))){var lo=parseInt(x[1],16),hi=parseInt(x[2],16),c;if(hi<lo||hi-lo>65535)continue;
      if(x[3][0]==="["){var it=x[3].match(/<[0-9a-fA-F]*>/g)||[];for(c=lo;c<=hi&&c-lo<it.length;c++)map[c]=u16(it[c-lo].slice(1,-1))}
      else{var h=x[3].slice(1,-1),pre=h.slice(0,-4),b=parseInt(h.slice(-4)||"0",16);for(c=lo;c<=hi;c++)map[c]=u16(pre+("0000"+((b+c-lo)&65535).toString(16)).slice(-4))}}}
  return map;
}
var STD={Helvetica:"Helvetica","Helvetica-Bold":"HelveticaBold","Helvetica-Oblique":"HelveticaOblique","Helvetica-BoldOblique":"HelveticaBoldOblique",
  "Times-Roman":"TimesRoman","Times-Bold":"TimesRomanBold","Times-Italic":"TimesRomanItalic","Times-BoldItalic":"TimesRomanBoldItalic",
  Courier:"Courier","Courier-Bold":"CourierBold","Courier-Oblique":"CourierOblique","Courier-BoldOblique":"CourierBoldOblique"};
function stdOf(fam,b,i){var B={helv:"Helvetica",times:"TimesRoman",cour:"Courier"}[fam]||"Helvetica",it=fam==="times"?"Italic":"Oblique";return B+(b?(fam==="times"?"Bold":"Bold"):"")+(i?it:"")}
function nm(o){return o?String(o).replace(/^\//,""):""}
function nmb(o){try{return o&&o.asNumber?o.asNumber():o&&o.value?o.value():+o||0}catch(e){return 0}}
/* un carattere della pagina: quello che serve per misurare, leggere e riscrivere */
async function fontInfo(L,ctx,dict,metric){
  function g(d,k){try{return d.lookup(L.PDFName.of(k))}catch(e){return null}}
  var sub=nm(g(dict,"Subtype")),base=nm(g(dict,"BaseFont")),name=base.replace(/^[A-Z]{6}\+/,"");
  var f={base:base,type0:sub==="Type0",type3:sub==="Type3",w:{},dw:sub==="Type0"?1000:0,k:1,asc:.78,desc:-.22,map:null,enc:{},subset:/^[A-Z]{6}\+/.test(base),wOk:false,embedded:false};
  f.fam=/courier|mono|consol|typewriter/i.test(name)?"cour":(/times|serif|roman|georgia|garamond|cambria|book|minion|palatino|baskerville|century/i.test(name)&&!/sans/i.test(name))?"times":"helv";
  f.b=/bold|black|heavy|semibold|demi/i.test(name);f.i=/italic|oblique|kursiv/i.test(name);
  var fd=null,i;
  if(f.type0){
    var ds=g(dict,"DescendantFonts"),d0=ds&&ds.lookup?ds.lookup(0):null;
    if(d0){
      var dw=g(d0,"DW");if(dw)f.dw=nmb(dw);
      var W=g(d0,"W");
      if(W&&W.size){var a=[];for(i=0;i<W.size();i++)a.push(W.lookup(i));
        for(i=0;i<a.length;){var c0=nmb(a[i]);
          if(a[i+1]&&a[i+1].size){for(var j=0;j<a[i+1].size();j++)f.w[c0+j]=nmb(a[i+1].lookup(j));i+=2}
          else{var c1=nmb(a[i+1]),wv=nmb(a[i+2]);for(var c=c0;c<=c1&&c-c0<65536;c++)f.w[c]=wv;i+=3}}}
      f.wOk=true;fd=g(d0,"FontDescriptor");
    }
  }else{
    var fc=g(dict,"FirstChar"),ws=g(dict,"Widths");
    if(ws&&ws.size){var first=nmb(fc);for(i=0;i<ws.size();i++)f.w[first+i]=nmb(ws.lookup(i));f.wOk=true}
    fd=g(dict,"FontDescriptor");
    if(f.type3){var fm=g(dict,"FontMatrix");if(fm&&fm.size)f.k=nmb(fm.lookup(0))*1000}
    /* codifica: WinAnsi come base (la più comune), poi le differenze */
    var en=g(dict,"Encoding");
    for(i=32;i<256;i++)f.enc[i]=WINANSI[i]?String.fromCharCode(WINANSI[i]):(i<127||i>159)?String.fromCharCode(i):"";
    if(en&&en.lookup){var df=g(en,"Differences");if(df&&df.size){var cc=0;for(i=0;i<df.size();i++){var it2=df.lookup(i);if(it2 instanceof L.PDFNumber)cc=nmb(it2);else{var gc=glyphChar(nm(it2));if(gc!=null)f.enc[cc]=gc;cc++}}}}
    if(!f.wOk&&STD[name]&&metric){
      try{var mf=await metric(STD[name]);for(i=32;i<256;i++){var ch=f.enc[i];if(!ch)continue;try{f.w[i]=mf.widthOfTextAtSize(ch,1000)}catch(e){}}f.wOk=true}catch(e){}
    }
    if(STD[name])f.std=STD[name];
  }
  if(fd){
    var as=g(fd,"Ascent"),de=g(fd,"Descent"),fl=g(fd,"Flags"),mw=g(fd,"MissingWidth");
    if(as&&nmb(as)>0)f.asc=Math.min(1.2,nmb(as)/1000);if(de&&nmb(de)<0)f.desc=Math.max(-.6,nmb(de)/1000);
    if(fl){var F=nmb(fl);if(F&262144)f.b=true;if(F&64)f.i=true;if((F&2)&&f.fam==="helv"&&!/sans|arial|helv|verdana|calibri|segoe|roboto|dejavusans/i.test(name))f.fam="times";if(F&1&&f.fam!=="cour"&&/mono/i.test(name))f.fam="cour"}
    if(mw)f.missing=nmb(mw);
    f.embedded=!!(g(fd,"FontFile")||g(fd,"FontFile2")||g(fd,"FontFile3"));
  }
  var tu=g(dict,"ToUnicode");
  if(tu&&tu instanceof L.PDFRawStream){try{f.map=parseCMap(latin1(L.decodePDFRawStream(tu).decode()))}catch(e){f.map=null}}
  return f;
}
function fWidth(f,c){if(!f)return 500;var w=f.w[c];if(w==null)w=f.type0?f.dw:(f.missing||0);return w*f.k}
function fChar(f,c){
  if(!f)return String.fromCharCode(c);
  if(f.map&&f.map[c]!=null)return f.map[c];
  if(!f.type0)return f.enc[c]!=null?f.enc[c]:String.fromCharCode(c);
  return "";
}
/* testo → codici del carattere originale («Come l'originale», R-EDT-05): solo lettere che il carattere ha davvero */
function fEncode(f,str,seen){
  if(!f||f.type3)return null;
  if(!f.rev){f.rev={};var k;
    if(f.map)for(k in f.map){var u=f.map[k];if(u&&f.rev[u]==null)f.rev[u]=+k}
    if(!f.type0)for(k=32;k<256;k++){var ch=f.enc[k];if(ch&&f.rev[ch]==null)f.rev[ch]=k}}
  var out=[];
  for(var ch2 of str){
    var c=f.rev[ch2];if(c==null)return null;
    if((f.subset||f.embedded&&f.type0)&&!(seen&&seen.has(ch2))&&ch2!==" ")return null;
    if(f.type0){out.push(c>>8&255,c&255)}else out.push(c);
  }
  return out;
}
function hexOf(b){return "<"+b.map(function(x){return (x<16?"0":"")+x.toString(16)}).join("")+">"}

/* ---------- lettura: pezzi di testo e immagini, con lo stato grafico ---------- */
function walk(src,ops,fonts,xo){
  var gs={ctm:[1,0,0,1,0,0],fill:"0 g",rgb:[0,0,0],cs:null,font:null,fs:0,tc:0,tw:0,tz:100,tl:0,ts:0,tr:0},stack=[],tm=[1,0,0,1,0,0],tlm=tm,runs=[],imgs=[],depth=0;
  function clone(o){var c={};for(var k in o)c[k]=o[k];return c}
  function show(k,o,arg,op){
    var f=fonts[gs.font]||null,Th=gs.tz/100,adv=0,str="",nb=f&&f.type0?2:1,codes=[];
    var items=arg&&arg.t==="arr"?arg.items:[arg];
    items.forEach(function(it){
      if(!it)return;
      if(it.t==="num"){adv+=-it.v/1000*gs.fs*Th;return}
      var by=bytesOf(it);
      for(var i=0;i+nb<=by.length;i+=nb){
        var c=nb===2?by[i]*256+by[i+1]:by[i];codes.push(c);
        adv+=(fWidth(f,c)/1000*gs.fs+gs.tc+(nb===1&&c===32?gs.tw:0))*Th;str+=fChar(f,c);
      }
    });
    runs.push({k:k,op:op,font:gs.font,fs:gs.fs,tm:tm.slice(),ctm:gs.ctm.slice(),tc:gs.tc,tw:gs.tw,tz:gs.tz,ts:gs.ts,tr:gs.tr,fill:gs.fill,rgb:gs.rgb.slice(),adv:adv,str:str,
      show:arg?arg.raw+(arg.t==="arr"?" TJ":" Tj"):"",wOk:!!(f&&f.wOk)});
    tm=mul(tr(adv,0),tm);
  }
  for(var k=0;k<ops.length;k++){
    var o=ops[k],a=o.args,nv=function(i){return a[i]&&a[i].v!=null?a[i].v:0};
    switch(o.op){
      case "q":stack.push(clone(gs));depth++;break;
      case "Q":if(stack.length)gs=stack.pop();depth--;break;
      case "cm":gs.ctm=mul([nv(0),nv(1),nv(2),nv(3),nv(4),nv(5)],gs.ctm);break;
      case "g":gs.fill=src.slice(o.s,o.e);gs.rgb=[nv(0),nv(0),nv(0)];gs.cs=null;break;
      case "rg":gs.fill=src.slice(o.s,o.e);gs.rgb=[nv(0),nv(1),nv(2)];gs.cs=null;break;
      case "k":gs.fill=src.slice(o.s,o.e);gs.rgb=[(1-nv(0))*(1-nv(3)),(1-nv(1))*(1-nv(3)),(1-nv(2))*(1-nv(3))];gs.cs=null;break;
      case "cs":gs.cs=a[0]?a[0].raw:null;gs.fill=src.slice(o.s,o.e);gs.rgb=[0,0,0];break;
      case "sc":case "scn":{
        var vs=a.filter(function(x){return x.t==="num"}).map(function(x){return x.v});
        gs.fill=(gs.cs?gs.cs+" cs ":"")+src.slice(o.s,o.e);
        gs.rgb=vs.length===1?[vs[0],vs[0],vs[0]]:vs.length===3?vs:vs.length===4?[(1-vs[0])*(1-vs[3]),(1-vs[1])*(1-vs[3]),(1-vs[2])*(1-vs[3])]:[0,0,0];break}
      case "BT":tm=tlm=[1,0,0,1,0,0];break;
      case "Tf":gs.font=a[0]?a[0].raw:null;gs.fs=nv(1);break;
      case "Tc":gs.tc=nv(0);break;case "Tw":gs.tw=nv(0);break;case "Tz":gs.tz=nv(0);break;
      case "TL":gs.tl=nv(0);break;case "Ts":gs.ts=nv(0);break;case "Tr":gs.tr=nv(0);break;
      case "Td":tlm=mul(tr(nv(0),nv(1)),tlm);tm=tlm;break;
      case "TD":gs.tl=-nv(1);tlm=mul(tr(nv(0),nv(1)),tlm);tm=tlm;break;
      case "Tm":tm=tlm=[nv(0),nv(1),nv(2),nv(3),nv(4),nv(5)];break;
      case "T*":tlm=mul(tr(0,-gs.tl),tlm);tm=tlm;break;
      case "'":tlm=mul(tr(0,-gs.tl),tlm);tm=tlm;show(k,o,a[0],o.op);break;
      case '"':gs.tw=nv(0);gs.tc=nv(1);tlm=mul(tr(0,-gs.tl),tlm);tm=tlm;show(k,o,a[2],o.op);break;
      case "Tj":case "TJ":show(k,o,a[0],o.op);break;
      case "Do":{var x=a[0]&&xo[a[0].raw];if(x)imgs.push({k:k,name:a[0].raw,ctm:gs.ctm.slice(),iw:x.w,ih:x.h});break}
    }
  }
  return {runs:runs,imgs:imgs,depth:Math.max(0,depth)};
}
function contentOf(L,page){
  var ctx=page.doc.context,c=page.node.Contents(),refs=[];
  if(!c)return "";
  if(c instanceof L.PDFArray){for(var i=0;i<c.size();i++)refs.push(c.get(i))}else refs.push(page.node.get(L.PDFName.of("Contents")));
  return refs.map(function(r){var s=ctx.lookup(r);try{return latin1(L.decodePDFRawStream(s).decode())}catch(e){return s&&s.contents?latin1(s.contents):""}}).join("\n");
}
async function pageRes(L,page,metric,fcache){
  var res=page.node.Resources(),fonts={},xo={};if(!res)return {fonts:fonts,xo:xo};
  var F=res.lookup(L.PDFName.of("Font"));
  if(F&&F.entries)for(var en of F.entries()){
    var key=String(en[0]),d=page.doc.context.lookup(en[1]);if(!d)continue;
    var id=en[1]&&en[1].toString?en[1].toString():key;
    if(fcache&&fcache[id]){fonts[key]=fcache[id];continue}
    try{fonts[key]=await fontInfo(L,page.doc.context,d,metric);fonts[key].id=id;if(fcache)fcache[id]=fonts[key];S.fontsById[id]=fonts[key]}catch(e){}
  }
  var X=res.lookup(L.PDFName.of("XObject"));
  if(X&&X.entries)for(var ex of X.entries()){
    var s=page.doc.context.lookup(ex[1]);if(!s||!s.dict)continue;
    var st=s.dict.lookup(L.PDFName.of("Subtype"));
    if(nm(st)==="Image")xo[String(ex[0])]={w:nmb(s.dict.lookup(L.PDFName.of("Width"))),h:nmb(s.dict.lookup(L.PDFName.of("Height")))};
  }
  return {fonts:fonts,xo:xo};
}

/* ---------- pdf.js (lo stesso di Compila) ---------- */
var pdfjsP=null;
function pdfjs(){
  if(!pdfjsP)pdfjsP=import(new URL("vendor/pdfjs/pdf.min.mjs",location.href).href).then(function(m){
    m.GlobalWorkerOptions.workerSrc=new URL("vendor/pdfjs/pdf.worker.min.mjs",location.href).href;return m;
  }).catch(function(e){pdfjsP=null;throw e});
  return pdfjsP;
}
async function renderTo(pdoc,n,scale,clip){
  var p=await pdoc.getPage(n),vp=clip?p.getViewport({scale:scale,offsetX:-clip[0]*scale,offsetY:-clip[1]*scale}):p.getViewport({scale:scale});
  var cv=document.createElement("canvas");cv.width=Math.max(1,Math.round(clip?clip[2]*scale:vp.width));cv.height=Math.max(1,Math.round(clip?clip[3]*scale:vp.height));
  var g=cv.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,cv.width,cv.height);
  await p.render({canvasContext:g,viewport:vp}).promise;p.cleanup();
  return cv;
}
function jpgOf(cv,q){return APP.toJpeg(cv,q||E.jpgQ)}
function prevScale(){return E.dpi/72*Math.min(2,window.devicePixelRatio||1)}

/* ---------- lettura delle pagine (R-EDT-03) ---------- */
var S={src:null,name:"documento",pages:[],sel:null,view:"edit",adding:false,zoom:0,undo:[],redo:[],blobs:{},seen:{},style:null,nid:0};
window.__edt=S;
function busy(){return S.pages.length>0}
/* ingrandimento: al telefono si parte da 2×, così i testi piccoli si toccano bene; la pagina si scorre di lato */
function zoom(){if(!S.zoom)S.zoom=window.innerWidth<600?2:1;return S.zoom}
function vw(m,x,y){return ap(m,x,y)}
/* i pezzi diventano testi: stessa riga, vicini, stesso stile (R-EDT-03) */
function groupRuns(P,fonts){
  var T=[],cur=null;
  P.R.forEach(function(r,ri){
    if(r.inv||!r.hz)return;
    var f=fonts[r.font]||{fam:"helv",b:false,i:false};
    var join=cur&&cur.font===r.font&&Math.abs(cur.fs-r.fs)<=.02*r.fs&&cur.fill===r.fill&&Math.abs(cur.base-r.base)<=.25*r.size&&r.x0>=cur.x1-.3*r.size&&r.x0<=cur.x1+E.joinGap*r.size;
    if(join){
      if(r.x0-cur.x1>.2*r.size&&!/\s$/.test(cur.str)&&!/^\s/.test(r.str))cur.str+=" ";
      cur.str+=r.str;cur.runs.push(ri);cur.x1=Math.max(cur.x1,r.x1);cur.y0=Math.min(cur.y0,r.y0);cur.y1=Math.max(cur.y1,r.y1);
    }else{
      if(!r.str.trim())return;
      cur={kind:"pdf",runs:[ri],font:r.font,fs:r.fs,fill:r.fill,str:r.str,x0:r.x0,x1:r.x1,y0:r.y0,y1:r.y1,base:r.base,size:r.size,color:r.rgb.map(function(v){return Math.round(v*255)}),fam:f.fam,b:!!f.b||r.tr===2,i:!!f.i,fid:f.id||r.font};
      T.push(cur);
    }
  });
  T.forEach(function(x,i){x.id="t"+i;x.str=x.str.trim()});
  return T.filter(function(x){return x.str.trim()});
}
async function readDoc(bytes,ocrSaved){
  var L=await APP.pdfLib();if(!L)throw new Error("pdf-lib");
  var lib=await pdfjs();
  var doc=await L.PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false});
  if(doc.isEncrypted)throw new Error("locked");
  S.fontsById={};S.seen={};
  var pdoc=await lib.getDocument({data:bytes.slice(0),isEvalSupported:false}).promise;
  var md=null,mcache={},metric=async function(name){if(!md)md=await L.PDFDocument.create();if(!mcache[name])mcache[name]=await md.embedFont(L.StandardFonts[name]);return mcache[name]};
  var fcache={},pages=[],n=Math.min(doc.getPageCount(),E.maxPages);
  for(var i=0;i<n;i++){
    if(APP.cancelled())return null;
    if(n>1)APP.loaderN(nf(i+1)+" / "+nf(n));
    var page=doc.getPage(i),pp=await pdoc.getPage(i+1),vp=pp.getViewport({scale:1});
    var P={n:i,vw:vp.width,vh:vp.height,vt:vp.transform.slice(),R:[],T:[],I:[],A:[],ocr:false,fonts:{}};
    var res=await pageRes(L,page,metric,fcache),src=contentOf(L,page),ops=tokenize(src),w=walk(src,ops,res.fonts,res.xo);
    P.depth=w.depth;
    /* pezzi in punti di vista */
    w.runs.forEach(function(r){
      var f=res.fonts[r.font],V=mul(mul(r.tm,r.ctm),P.vt),asc=f?f.asc:.78,desc=f?f.desc:-.22;
      var b0=ap(V,0,r.ts),b1=ap(V,r.adv,r.ts),up=ap(V,0,r.ts+1),dx=b1[0]-b0[0],dy=b1[1]-b0[1],ux=up[0]-b0[0],uy=up[1]-b0[1],us=Math.hypot(ux,uy);
      r.inv=r.tr===3||r.tr===7;r.size=r.fs*us;r.base=b0[1];r.x0=Math.min(b0[0],b1[0]);r.x1=Math.max(b0[0],b1[0]);
      r.y0=b0[1]-asc*r.size;r.y1=b0[1]-desc*r.size;
      r.hz=r.size>.5&&uy<0&&Math.abs(ux)<.02*us&&(Math.abs(dy)<=.02*Math.abs(dx)||!r.adv)&&dx>=0;
      if(f&&r.str){var key=f.id;S.seen[key]=S.seen[key]||new Set();for(var ch of r.str)S.seen[key].add(ch)}
      delete r.tm0;
    });
    P.R=w.runs;
    w.runs.forEach(function(r){P.fonts[r.font]=P.fonts[r.font]||null});
    for(var fk in P.fonts){var fi=res.fonts[fk];P.fonts[fk]=fi?{fam:fi.fam,b:fi.b,i:fi.i,id:fi.id}:null}
    P.T=groupRuns(P,P.fonts);
    w.imgs.forEach(function(im,j){
      var g=geom(P,im.ctm);if(g.w<4||g.h<4)return;
      P.I.push({id:"i"+j,k:im.k,name:im.name,orig:im.ctm,cur:im.ctm.slice(),iw:im.iw,ih:im.ih,del:false,jpg:null});
    });
    /* scansione: niente testo visibile e un'immagine grande (R-EDT-03) */
    var big=P.I.some(function(im){var g=geom(P,im.cur);return g.w*g.h>=E.scanCover*P.vw*P.vh});
    if(!P.T.length&&big){
      P.ocr=true;
      if(ocrSaved&&ocrSaved[i]){P.T=ocrSaved[i].T;P.hi=ocrSaved[i].hi||null}
      else{
        APP.loaderTitle(t("ocrRead",{i:nf(i+1),n:nf(n)}));
        try{await ocrPage(pdoc,P)}catch(e){console.error(e)}
        APP.loaderTitle(t("editReading"));
      }
    }
    pp.cleanup();
    pages.push(P);
  }
  return {doc:doc,pdoc:pdoc,pages:pages,total:doc.getPageCount()};
}
/* una scansione letta con Tesseract: ogni riga è un testo, con inchiostro, carta e corpo misurati (R-EDT-03) */
async function ocrPage(pdoc,P){
  var k=E.ocrDpi/72,cv=await renderTo(pdoc,P.n+1,k);
  var code=APP.ocrLangFor(null)||"eng";
  var w=await APP.ocrRecWorker(code,function(){APP.loaderN(t("ocrLang"))});APP.loaderN("");
  try{await w.setParameters({tessedit_pageseg_mode:"3"})}catch(e){}
  var r=await w.recognize(cv,{},{tsv:true,text:false,blocks:false});APP.ocrTouch();
  var lines={},order=[];
  String(r&&r.data&&r.data.tsv||"").split("\n").slice(1).forEach(function(row){
    var c=row.split("\t");if(c.length<12||c[0]!=="5")return;
    var tx=(c[11]||"").trim(),cf=parseFloat(c[10]);if(!tx||cf<30)return;
    var key=c[2]+"."+c[3]+"."+c[4],x=+c[6],y=+c[7],ww=+c[8],hh=+c[9];
    if(!lines[key]){lines[key]={w:[]};order.push(key)}
    lines[key].w.push({t:tx,x:x,y:y,x1:x+ww,y1:y+hh});
  });
  var g=cv.getContext("2d",{willReadFrequently:true}),W=cv.width,H=cv.height,img=g.getImageData(0,0,W,H).data,T=[];
  order.forEach(function(key,i){
    var ws=lines[key].w,str=ws.map(function(x){return x.t}).join(" ");
    if(!/[\p{L}\p{N}]/u.test(str))return;
    var x0=Math.min.apply(0,ws.map(function(x){return x.x})),y0=Math.min.apply(0,ws.map(function(x){return x.y})),x1=Math.max.apply(0,ws.map(function(x){return x.x1})),y1=Math.max.apply(0,ws.map(function(x){return x.y1}));
    if(y1-y0>.08*H||x1-x0<4)return;
    var col=inkPaper(img,W,H,x0,y0,x1,y1);
    var v0=[x0/k,y0/k],v1=[x1/k,y1/k],sz=measure(str,"helv",false,false,100);
    var size=Math.max(4,Math.min((v1[1]-v0[1])*1.6,(v1[0]-v0[0])/sz*100));
    T.push({id:"o"+i,kind:"ocr",str:str,x0:v0[0],y0:v0[1],x1:v1[0],y1:v1[1],base:v1[1]-(v1[1]-v0[1])*.18,size:size,color:col.ink,bg:col.bg,fam:"helv",b:false,i:false});
  });
  P.T=T;
  P.hi=await jpgOf(cv,.85);
  cv.width=cv.height=0;
}
function median(a){if(!a.length)return 0;a.sort(function(x,y){return x-y});return a[a.length>>1]}
function inkPaper(d,W,H,x0,y0,x1,y1){
  var p=3,ring=[[],[],[]],box=[];
  function px(x,y){var i=(y*W+x)*4;return [d[i],d[i+1],d[i+2]]}
  for(var x=Math.max(0,x0|0);x<Math.min(W,x1);x+=1)[Math.max(0,y0-p-2),Math.max(0,y0-p),Math.min(H-1,y1+p),Math.min(H-1,y1+p+2)].forEach(function(y){var c=px(x,y|0);ring[0].push(c[0]);ring[1].push(c[1]);ring[2].push(c[2])});
  var bg=[median(ring[0]),median(ring[1]),median(ring[2])];
  for(var y=Math.max(0,y0|0);y<Math.min(H,y1);y++)for(x=Math.max(0,x0|0);x<Math.min(W,x1);x++){var c=px(x,y);box.push([Math.abs(c[0]-bg[0])+Math.abs(c[1]-bg[1])+Math.abs(c[2]-bg[2]),c])}
  box.sort(function(a,b){return b[0]-a[0]});
  var top=box.slice(0,Math.max(1,box.length/10|0)),ink=[0,1,2].map(function(ch){return median(top.map(function(v){return v[1][ch]}))});
  return {ink:ink,bg:bg};
}
/* larghezza di un testo nei caratteri standard, con il canvas (Helvetica → Arial, Times → Times New Roman) */
var mctx=null;
function cssFont(fam,b,i,size){return (i?"italic ":"")+(b?"bold ":"")+size+"px "+({helv:"Helvetica, Arial, sans-serif",times:"'Times New Roman', Times, serif",cour:"'Courier New', Courier, monospace"}[fam]||"Helvetica, Arial, sans-serif")}
function measure(str,fam,b,i,size){if(!mctx)mctx=document.createElement("canvas").getContext("2d");mctx.font=cssFont(fam,b,i,size);return mctx.measureText(str).width}

/* ---------- geometria delle immagini ---------- */
function toView(P,x,y){return ap(P.vt,x,y)}
function geom(P,m){
  var bl=toView(P,m[4],m[5]),u=ap(m,1,0),v=ap(m,0,1),br=toView(P,u[0],u[1]),tl=toView(P,v[0],v[1]);
  var w=dist(bl,br),h=dist(bl,tl),ang=Math.atan2(br[1]-bl[1],br[0]-bl[0]);
  return {w:w,h:h,ang:ang,cx:(br[0]+tl[0])/2,cy:(br[1]+tl[1])/2,bl:bl,br:br,tl:tl,tr:[br[0]+tl[0]-bl[0],br[1]+tl[1]-bl[1]]};
}
/* una trasformazione in punti di vista applicata alla matrice di un'immagine */
function viewX(P,m,X){return mul(m,mul(mul(P.vt,X),inv(P.vt)))}
/* matrice di un rettangolo dritto in punti di vista (centro, misure) */
function rectM(P,cx,cy,w,h,ang){
  ang=ang||0;var ux=[Math.cos(ang),Math.sin(ang)],up=[Math.sin(ang),-Math.cos(ang)];
  var bl=[cx-ux[0]*w/2-up[0]*h/2,cy-ux[1]*w/2-up[1]*h/2],br=[bl[0]+ux[0]*w,bl[1]+ux[1]*w],tl=[bl[0]+up[0]*h,bl[1]+up[1]*h];
  var iv=inv(P.vt),B=ap(iv,bl[0],bl[1]),R=ap(iv,br[0],br[1]),T=ap(iv,tl[0],tl[1]);
  return [R[0]-B[0],R[1]-B[1],T[0]-B[0],T[1]-B[1],B[0],B[1]];
}
function bbox(g){var xs=[g.bl[0],g.br[0],g.tl[0],g.tr[0]],ys=[g.bl[1],g.br[1],g.tl[1],g.tr[1]];return [Math.min.apply(0,xs),Math.min.apply(0,ys),Math.max.apply(0,xs),Math.max.apply(0,ys)]}
function resid(a){var d=a*180/Math.PI;return d-90*Math.round(d/90)}

/* ---------- stato delle modifiche, Annulla e Rifai (R-EDT-04) ---------- */
function snap(){return JSON.stringify(S.pages.map(function(P){return {T:P.T.map(function(x){return x.e||null}),I:P.I,A:P.A}}))}
function unsnap(s){var a=JSON.parse(s);a.forEach(function(x,i){var P=S.pages[i];if(!P)return;P.T.forEach(function(tx,j){if(x.T[j])tx.e=x.T[j];else delete tx.e});P.I=x.I;P.A=x.A})}
function pageSig(P){return JSON.stringify([P.T.map(function(x){return x.e||0}),P.I,P.A])}
function push(){S.undo.push(snap());if(S.undo.length>E.undo)S.undo.shift();S.redo=[]}
function undo(){if(!S.undo.length)return;var before=S.pages.map(pageSig);S.redo.push(snap());unsnap(S.undo.pop());S.sel=null;afterJump(before)}
function redo(){if(!S.redo.length)return;var before=S.pages.map(pageSig);S.undo.push(snap());unsnap(S.redo.pop());S.sel=null;afterJump(before)}
function afterJump(before){S.pages.forEach(function(P,i){if(pageSig(P)!==before[i])refresh(i)});render()}
function edits(){
  var n=0;
  S.pages.forEach(function(P){
    P.T.forEach(function(x){if(textChanged(x)||textMoved(x))n++});
    P.I.forEach(function(im){if(im.k==null||im.del||im.jpg||!same(im.cur,im.orig))n++});
    n+=P.A.filter(function(a){return a.str.trim()}).length;
  });
  return n;
}
function textChanged(x){var e=x.e;if(!e)return false;return !!e.del||e.str!==x.str||(!e.orig&&(e.fam!==x.fam||e.b!==x.b||e.i!==x.i))||Math.abs(e.size-x.size)>.01||e.color.join()!==x.color.join()}
function textMoved(x){var e=x.e;return !!e&&(Math.abs(e.dx)>.01||Math.abs(e.dy)>.01)}
/* il carattere del PDF resta finché ha le lettere scritte (R-EDT-05) */
function canOrig(x,str){return x.kind==="pdf"&&!!S.fontsById[x.fid]&&!!fEncode(S.fontsById[x.fid],String(str).replace(/\n/g," "),S.seen[x.fid])}
function eOf(x){if(!x.e)x.e={str:x.str,fam:x.fam,b:x.b,i:x.i,size:x.size,color:x.color.slice(),dx:0,dy:0,del:false,orig:canOrig(x,x.str)};return x.e}

/* ---------- anteprima di una pagina con le modifiche (pagina sola, R-EDT-04) ---------- */
var refreshQ={},refreshT={};
function refresh(pi,delay){
  clearTimeout(refreshT[pi]);
  refreshT[pi]=setTimeout(function(){refreshNow(pi)},delay||0);
}
async function refreshNow(pi){
  var P=S.pages[pi];if(!P)return;
  if(refreshQ[pi]){refreshQ[pi].again=true;return}
  refreshQ[pi]={again:false};
  var sig=pageSig(P);
  try{
    var url=null;
    if(!dirtyPage(P)){var cv=await renderTo(S.pdoc,pi+1,prevScale());url=URL.createObjectURL(await jpgOf(cv,.85));cv.width=cv.height=0;P.bytes=null}
    else{
      var L=await APP.pdfLib(),d=await L.PDFDocument.create(),cp=(await d.copyPages(S.doc,[pi]))[0];d.addPage(cp);
      await applyPage(L,d,cp,P);
      var bytes=await d.save({useObjectStreams:false});P.bytes=bytes;
      var lib=await pdfjs(),one=await lib.getDocument({data:bytes.slice(0),isEvalSupported:false}).promise;
      var cv2=await renderTo(one,1,prevScale());url=URL.createObjectURL(await jpgOf(cv2,.85));cv2.width=cv2.height=0;one.destroy();
    }
    if(P.url)URL.revokeObjectURL(P.url);P.url=url;P.urlSig=sig;
    var im=document.querySelector('.epage[data-p="'+pi+'"]>img');if(im)im.src=url;
    var th=document.querySelector(".esaveThumb img");if(th&&pi===0)th.src=url;
  }catch(e){console.error(e);APP.say(t("failed"),true)}
  var again=refreshQ[pi].again;refreshQ[pi]=null;
  if(again||pageSig(P)!==sig)refresh(pi);
}
function dirtyPage(P){return P.T.some(function(x){return textChanged(x)||textMoved(x)})||P.I.some(function(im){return im.k==null||im.del||im.jpg||!same(im.cur,im.orig)})||P.A.some(function(a){return a.str.trim()})}

/* ---------- schermata (R-EDT-02…07) ---------- */
function panel(tag){var s=el("section","panel");s.appendChild(el("div","tag",tag));return s}
function btn(cls,label,fn,icon){var b=el("button","btn "+cls);b.type="button";if(icon)b.innerHTML=icon;if(label)b.appendChild(document.createTextNode(label));b.addEventListener("click",fn);return b}
var ICON={
  plus:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  save:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  back:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  undo:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  redo:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
  straight:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" aria-hidden="true"><path d="M6 5l13-2 2 14-13 2z"/><path d="M3 4v17h17" stroke-linecap="round" stroke-dasharray="2 3"/></svg>',
  split:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/><path d="M13 7h5M7 13v5" stroke-linecap="round"/></svg>',
  turn:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 3v5h-5"/></svg>',
  del:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  corners:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" aria-hidden="true"><path d="M5 6l14-2 1 15-15 1z"/><circle cx="5" cy="6" r="2" fill="currentColor"/><circle cx="19" cy="4" r="2" fill="currentColor"/><circle cx="20" cy="19" r="2" fill="currentColor"/><circle cx="5" cy="20" r="2" fill="currentColor"/></svg>'
};
function render(){
  saveSoon();
  var box=$("edit");if(!box)return;
  var old=box.querySelector(".fscroll");if(old)S.scrollX=old.scrollLeft;
  box.textContent="";
  if(!APP.isEdit())return;
  if(!S.pages.length){renderStart(box);return}
  if(S.view==="save"){renderSave(box);return}
  renderEdit(box);
}
/* passo 1 (R-EDT-02) */
function renderStart(box){
  var p1=panel(t("editS1")),tray=el("div","tray fillTray");
  tray.appendChild(el("p",null,t("editDrop")));
  var acts=el("div","fillPick"),pick=el("label","btn go");pick.appendChild(el("span",null,t("editPick")));
  var inp=document.createElement("input");inp.type="file";inp.className="vh";inp.accept="application/pdf,.pdf,image/*";
  inp.addEventListener("change",function(){var fs=Array.from(inp.files||[]);inp.value="";if(fs.length)openFiles(fs)});
  pick.appendChild(inp);acts.appendChild(pick);tray.appendChild(acts);p1.appendChild(tray);box.appendChild(p1);
  tray.addEventListener("dragover",function(e){e.preventDefault();tray.classList.add("over")});
  tray.addEventListener("dragleave",function(){tray.classList.remove("over")});
  tray.addEventListener("drop",function(e){e.preventDefault();tray.classList.remove("over");var fs=Array.from(e.dataTransfer&&e.dataTransfer.files||[]);if(fs.length)openFiles(fs)});
  var off=panel(t("editS2"));off.classList.add("off");off.appendChild(el("div","tag",t("editS3")));box.appendChild(off);
}
function baseName(n){return String(n||"documento").replace(/\.[^.]+$/,"").replace(/[\\/:*?"<>|]+/g,"-").slice(0,80)||"documento"}
async function openFiles(fs){
  var pdf=fs.filter(function(f){return /\.pdf$/i.test(f.name)||f.type==="application/pdf"})[0];
  var imgs=fs.filter(function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)});
  if(!pdf&&!imgs.length){APP.say(t("editNoFile"),true);return}
  var name=baseName((pdf||imgs[0]).name),bytes;
  if(pdf)bytes=new Uint8Array(await pdf.arrayBuffer());
  else{APP.loaderOn("scan",t("editReading"));try{bytes=await photoPdf(imgs)}catch(e){bytes=null}await APP.loaderOff();if(!bytes){APP.say(t("failed"),true);return}}
  await load(bytes,name);
}
/* una foto diventa una pagina A4 (210 mm di larghezza) con la foto intera (R-EDT-02) */
async function photoPdf(imgs){
  var L=await APP.pdfLib(),d=await L.PDFDocument.create();
  for(var i=0;i<imgs.length;i++){
    var bmp=await createImageBitmap(imgs[i]),cv=document.createElement("canvas"),k=Math.min(1,3000/Math.max(bmp.width,bmp.height));
    cv.width=Math.round(bmp.width*k);cv.height=Math.round(bmp.height*k);cv.getContext("2d").drawImage(bmp,0,0,cv.width,cv.height);if(bmp.close)bmp.close();
    var jb=await jpgOf(cv,.92),im=await d.embedJpg(new Uint8Array(await jb.arrayBuffer())),pw=595.28,ph=pw*cv.height/cv.width;cv.width=cv.height=0;
    d.addPage([pw,ph]).drawImage(im,{x:0,y:0,width:pw,height:ph});
  }
  return await d.save();
}
var cancel=false;
async function load(bytes,name,rec){
  cancel=false;
  if(!rec)sessDrop();
  APP.loaderOn("scan",t("editReading"));
  await new Promise(function(r){setTimeout(r,40)});
  var R=null,err=null;
  try{R=await readDoc(bytes,rec&&rec.ocr)}catch(e){console.error(e);err=e}
  var was=await APP.loaderOff();
  if(was||cancel||!R){if(err)APP.say(t(err.message==="locked"?"editLocked":"failed"),true);if(R&&R.pdoc)R.pdoc.destroy();render();return false}
  clearAll(true);
  S.src=bytes;S.name=name||"documento";S.doc=R.doc;S.pdoc=R.pdoc;S.pages=R.pages;S.sel=null;S.view="edit";S.adding=false;S.undo=[];S.redo=[];
  if(rec){
    S.blobs=rec.blobs||{};S.nid=rec.nid||0;S.view=rec.view||"edit";S.zoom=rec.zoom||0;S.style=rec.style||null;
    try{unsnap(rec.snap)}catch(e){}
    S.sid=rec.id;S.stored=true;
  }
  var tn=0,inN=0;S.pages.forEach(function(P){tn+=P.T.length;inN+=P.I.length});
  APP.stat("modifica/apri/"+APP.bucket(S.pages.length));
  if(!rec)APP.say(R.total>S.pages.length?t("editTooMany",{n:nf(S.pages.length)}):t("editFound",{t:nf(tn),i:nf(inN)}));
  /* anteprime: la prima subito, le altre in fila mentre si guarda */
  if(S.pages.length)await refreshNow(0).catch(function(){});
  render();
  if(!rec)try{window.scrollTo({top:0,behavior:"smooth"})}catch(e){}
  (async function(){for(var i=1;i<S.pages.length;i++){if(!S.pages[i]||S.pages[i].url)continue;await refreshNow(i).catch(function(){})}})();
  return true;
}
function clearAll(keep){
  S.pages.forEach(function(P){if(P.url)URL.revokeObjectURL(P.url)});
  if(S.pdoc&&S.pdoc.destroy)try{S.pdoc.destroy()}catch(e){}
  S.pages=[];S.sel=null;S.undo=[];S.redo=[];S.pdoc=null;S.doc=null;
  if(!keep){S.src=null;S.blobs={};S.view="edit";S.adding=false;S.zoom=0}
}
function top(){try{$("edit").scrollIntoView({behavior:"smooth",block:"start"})}catch(e){}}
function pct(v,tot){return (v/tot*100)+"%"}
function counts(){var tn=0,inn=0;S.pages.forEach(function(P){tn+=P.T.filter(function(x){return !(x.e&&x.e.del)}).length+P.A.length;inn+=P.I.filter(function(im){return !im.del}).length});return {t:tn,i:inn}}
/* passo 2 */
function renderEdit(box){
  var p2=panel(t("editS2"));
  p2.appendChild(el("p","hint",S.adding?t("editAddTip"):t("editTip")));
  var row=el("div","fchips erow"),cs=counts();
  var ub=btn("alt sm eico","",undo,ICON.undo);ub.setAttribute("aria-label",t("editUndo"));ub.disabled=!S.undo.length;row.appendChild(ub);
  var rb=btn("alt sm eico","",redo,ICON.redo);rb.setAttribute("aria-label",t("editRedo"));rb.disabled=!S.redo.length;row.appendChild(rb);
  [["#2f6fdb",t("editTexts",{n:nf(cs.t)})],["#f08a24",t("editImages",{n:nf(cs.i)})]].forEach(function(x){var c=el("span","fchip",x[1]);c.style.setProperty("--c",x[0]);row.appendChild(c)});
  var zb=el("span","fzoom");
  [["−",-1],["+",1]].forEach(function(z){var b=el("button","btn alt sm",z[0]);b.type="button";b.setAttribute("aria-label",t(z[1]<0?"fillZoomOut":"fillZoomIn"));b.disabled=z[1]<0?zoom()<=1:zoom()>=3;b.addEventListener("click",function(){S.zoom=Math.max(1,Math.min(3,zoom()+z[1]));render()});zb.appendChild(b)});
  row.appendChild(zb);p2.appendChild(row);
  var sc=el("div","fscroll z"+zoom());sc.dir="ltr";sc.style.setProperty("--z",zoom());
  S.pages.forEach(function(P,pi){sc.appendChild(pageView(P,pi))});
  p2.appendChild(sc);
  requestAnimationFrame(function(){sc.scrollLeft=S.scrollX||0});
  var bar=el("div","fillBar ebar");
  var add=btn("alt"+(S.adding?" on":""),t("editAdd"),function(){S.adding=!S.adding;S.sel=null;render()},ICON.plus);add.setAttribute("aria-pressed",String(S.adding));
  bar.appendChild(add);
  bar.appendChild(btn("ok",t("editSave"),function(){S.view="save";S.sel=null;S.adding=false;render();top()},ICON.save));
  p2.appendChild(bar);box.appendChild(p2);
  var p3=panel(t("editS3"));p3.classList.add("off");box.appendChild(p3);
  var s=selected();
  if(s&&s.kind==="i")box.appendChild(imgBar(s));
  else if(s)box.appendChild(textSheet(s));
  box.classList.toggle("withSheet",!!s);
  if(s)requestAnimationFrame(showSel);
}
/* il riquadro scelto resta visibile sopra il foglio in basso */
function showSel(){
  var b=document.querySelector(".ebox.sel"),sh=document.querySelector("#edit .fsheet");if(!b)return;
  var sc=b.closest(".fscroll");
  if(sc){var rs=sc.getBoundingClientRect(),rb=b.getBoundingClientRect();if(rb.left<rs.left+8||rb.right>rs.right-8){sc.scrollLeft+=rb.left-rs.left-Math.max(8,(rs.width-rb.width)/2);S.scrollX=sc.scrollLeft}}
  var r=b.getBoundingClientRect(),avail=window.innerHeight-(sh?sh.offsetHeight:0);
  if(r.top<70||r.bottom>avail-16)try{window.scrollBy({top:r.top-Math.max(70,(avail-r.height)/2),behavior:"smooth"})}catch(e){}
}
function selected(){
  var s=S.sel;if(!s)return null;var P=S.pages[s.p];if(!P)return null;
  var o=s.kind==="t"?P.T[s.i]:s.kind==="a"?P.A[s.i]:P.I[s.i];if(!o)return null;
  return {kind:s.kind,P:P,pi:s.p,o:o};
}
/* una pagina: anteprima vera con le modifiche, contorni blu dei testi e arancioni delle immagini */
function pageView(P,pi){
  var wrap=el("div","fpage epage");wrap.style.aspectRatio=P.vw+" / "+P.vh;wrap.setAttribute("data-p",String(pi));
  var im=document.createElement("img");if(P.url)im.src=P.url;im.alt=t("pageN",{n:nf(pi+1)});im.draggable=false;wrap.appendChild(im);
  P.I.forEach(function(o,i){if(!o.del)wrap.appendChild(imgBox(P,pi,o,i))});
  P.T.forEach(function(x,i){if(!(x.e&&x.e.del))wrap.appendChild(textBox(P,pi,x,i,"t"))});
  P.A.forEach(function(x,i){wrap.appendChild(textBox(P,pi,x,i,"a"))});
  wrap.addEventListener("click",function(e){
    if(e.target!==wrap&&e.target!==im)return;
    if(S.adding){var r=wrap.getBoundingClientRect(),k=P.vw/r.width;addText(pi,(e.clientX-r.left)*k,(e.clientY-r.top)*k);return}
    if(S.sel){S.sel=null;render()}
  });
  if(S.adding)wrap.classList.add("eadd");
  return wrap;
}
function isSel(pi,kind,i){var s=S.sel;return !!s&&s.p===pi&&s.kind===kind&&s.i===i}
/* riquadro di un testo: dove sta ora (spostato o cambiato) */
function textGeom(x){
  if(x.kind==="add"){var w0=Math.max(...(x.str||" ").split("\n").map(function(l){return measure(l||" ",x.fam,x.b,x.i,x.size)}));var nl=(x.str||" ").split("\n").length;
    return {x0:x.x,y0:x.y-x.size*.8,x1:x.x+Math.max(w0,x.size*2),y1:x.y+x.size*(.25+1.2*(nl-1))}}
  var e=x.e;if(!e)return {x0:x.x0,y0:x.y0,x1:x.x1,y1:x.y1};
  var x0=x.x0+e.dx,y0=x.y0+e.dy,x1=x.x1+e.dx,y1=x.y1+e.dy;
  if(textChanged(x)){var lines=e.str.split("\n"),w=Math.max.apply(0,lines.map(function(l){return measure(l||" ",e.fam,e.b,e.i,e.size)}));x1=x0+Math.max(w,e.size);var bs=x.base+e.dy;y0=bs-e.size*.8;y1=bs+e.size*(.25+1.2*(lines.length-1))}
  return {x0:x0,y0:y0,x1:x1,y1:y1};
}
function textBox(P,pi,x,i,kind){
  var g=textGeom(x),sel=isSel(pi,kind,i),b=el("button","ebox et"+(sel?" sel":""));b.type="button";
  b.setAttribute("aria-label",x.kind==="add"?t("editNewText"):((x.e&&x.e.str)||x.str));
  var pad=Math.max(1,(g.y1-g.y0)*.12);
  b.style.left=pct(g.x0-pad,P.vw);b.style.top=pct(g.y0-pad,P.vh);b.style.width=pct(g.x1-g.x0+2*pad,P.vw);b.style.height=pct(g.y1-g.y0+2*pad,P.vh);
  b.addEventListener("click",function(e){e.stopPropagation();if(b._moved){b._moved=false;return}if(S.adding)return;if(!sel){S.sel={p:pi,kind:kind,i:i};S.sheetPushed=false;render()}});
  if(sel)drag(b,P,function(dx,dy){
    push();
    if(kind==="a"){x.x+=dx;x.y+=dy}else{var e=eOf(x);e.dx+=dx;e.dy+=dy}
    refresh(pi);render();
  });
  return b;
}
function imgBox(P,pi,o,i){
  var sel=isSel(pi,"i",i),b=el("button","ebox ei"+(sel?" sel":""));b.type="button";b.setAttribute("aria-label",t("editImage"));
  placeImg(b,P,o.cur);
  b.addEventListener("click",function(e){e.stopPropagation();if(b._moved){b._moved=false;return}if(S.adding)return;if(!sel){S.sel={p:pi,kind:"i",i:i};render()}});
  if(sel){
    ["nw","ne","se","sw"].forEach(function(c){var h=el("span","egrip "+c);h.setAttribute("data-h",c);b.appendChild(h)});
    var r=el("span","erot");r.setAttribute("data-h","rot");b.appendChild(r);
    imgDrag(b,P,pi,o);
  }
  return b;
}
function placeImg(b,P,m){
  var g=geom(P,m);
  b.style.left=pct(g.cx-g.w/2,P.vw);b.style.top=pct(g.cy-g.h/2,P.vh);b.style.width=pct(g.w,P.vw);b.style.height=pct(g.h,P.vh);
  b.style.transform="rotate("+g.ang+"rad)";
}
/* trascinare: il riquadro segue il dito, al rilascio la modifica (in punti di vista) */
function drag(b,P,done){
  var st=null;
  b.addEventListener("pointerdown",function(e){
    var r=b.parentNode.getBoundingClientRect();st={x:e.clientX,y:e.clientY,k:P.vw/r.width,moved:false};
    try{b.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();
  });
  b.addEventListener("pointermove",function(e){
    if(!st)return;var dx=e.clientX-st.x,dy=e.clientY-st.y;
    if(Math.abs(dx)+Math.abs(dy)>4)st.moved=true;if(!st.moved)return;
    b.style.translate=dx+"px "+dy+"px";
  });
  function up(e){
    if(!st)return;var s=st;st=null;
    if(!s.moved)return;b._moved=true;b.style.translate="";
    done((e.clientX-s.x)*s.k,(e.clientY-s.y)*s.k);
  }
  b.addEventListener("pointerup",up);b.addEventListener("pointercancel",function(){st=null;b.style.translate=""});
}
/* immagine: spostare, angoli per ingrandire (proporzioni fisse), maniglia tonda per ruotare (R-EDT-07) */
function imgDrag(b,P,pi,o){
  var st=null;
  function pt(e){var r=b.parentNode.getBoundingClientRect(),k=P.vw/r.width;return [(e.clientX-r.left)*k,(e.clientY-r.top)*k]}
  b.addEventListener("pointerdown",function(e){
    var h=e.target.getAttribute&&e.target.getAttribute("data-h"),g=geom(P,o.cur);
    var opp={nw:g.br,ne:g.bl,se:g.tl,sw:g.tr},corner={nw:g.tl,ne:g.tr,se:g.br,sw:g.bl};
    st={h:h||"move",p0:pt(e),g:g,anchor:h&&opp[h],c0:h&&corner[h],moved:false,X:null};
    try{b.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();e.stopPropagation();
  });
  b.addEventListener("pointermove",function(e){
    if(!st)return;var p=pt(e),dx=p[0]-st.p0[0],dy=p[1]-st.p0[1];
    if(!st.moved&&Math.abs(dx)+Math.abs(dy)<P.vw/300)return;st.moved=true;
    var X,g=st.g;
    if(st.h==="move")X=tr(dx,dy);
    else if(st.h==="rot"){
      var a=Math.atan2(p[1]-g.cy,p[0]-g.cx)-Math.atan2(st.p0[1]-g.cy,st.p0[0]-g.cx),d=(g.ang+a)*180/Math.PI,sn=90*Math.round(d/90);
      if(Math.abs(d-sn)<3)a=sn*Math.PI/180-g.ang;
      X=about(rot(a),g.cx,g.cy);
    }else{
      var A=st.anchor,s=Math.max(.05,dist(p,A)/Math.max(1,dist(st.c0,A)));
      X=about([s,0,0,s,0,0],A[0],A[1]);
    }
    st.X=X;placeImg(b,P,viewX(P,o.cur,X));
  });
  function up(){
    if(!st)return;var s=st;st=null;
    if(!s.moved||!s.X)return;b._moved=true;
    push();o.cur=viewX(P,o.cur,s.X);refresh(pi);render();
  }
  b.addEventListener("pointerup",up);b.addEventListener("pointercancel",function(){st=null;placeImg(b,P,o.cur)});
}
/* «+ Testo» e un tocco: testo nuovo con lo stile dell'ultimo usato (R-EDT-06) */
function addText(pi,x,y){
  var P=S.pages[pi],st=S.style||{fam:"helv",b:false,i:false,size:12,color:[0,0,0]};
  push();
  P.A.push({id:"a"+(++S.nid),kind:"add",str:"",x:x,y:y+st.size*.35,fam:st.fam,b:st.b,i:st.i,size:st.size,color:st.color.slice()});
  S.adding=false;S.sel={p:pi,kind:"a",i:P.A.length-1};S.sheetPushed=true;render();
  setTimeout(function(){var ta=document.querySelector(".esheet textarea");if(ta)ta.focus()},50);
}
/* lettere che Helvetica, Times e Courier non hanno (WinAnsi, R-EDT-11) */
function winAnsiMissing(s){var out="";for(var ch of s){var c=ch.charCodeAt(0);if(ch==="\n")continue;if(ch.length>1||!((c>=32&&c<127)||(c>=160&&c<256)||WINREV[ch]!=null))if(out.indexOf(ch)<0)out+=ch}return out}
/* foglio del testo (R-EDT-05) */
var SW=[null,[0,0,0],[31,79,191],[19,138,77],[192,57,43],[107,75,214]];
function textSheet(sel){
  var x=sel.o,isAdd=sel.kind==="a",e=isAdd?x:eOf(x),pi=sel.pi;
  var sh=el("div","fsheet esheet");sh.setAttribute("role","dialog");sh.setAttribute("aria-label",t("editText"));
  sh.appendChild(el("h3",null,isAdd?t("editNewText"):t("editText")));
  function changed(){
    if(!S.sheetPushed){push();S.sheetPushed=true}
    if(!isAdd)S.style={fam:e.fam,b:e.b,i:e.i,size:e.size,color:e.color.slice()};else S.style={fam:x.fam,b:x.b,i:x.i,size:x.size,color:x.color.slice()};
    warn();refresh(pi,350);
    var bx=document.querySelector(".ebox.sel");if(bx){var g=textGeom(x),P=sel.P,pad=Math.max(1,(g.y1-g.y0)*.12);bx.style.left=pct(g.x0-pad,P.vw);bx.style.top=pct(g.y0-pad,P.vh);bx.style.width=pct(g.x1-g.x0+2*pad,P.vw);bx.style.height=pct(g.y1-g.y0+2*pad,P.vh)}
    saveSoon();
  }
  var ta=document.createElement("textarea");ta.className="fin";ta.rows=2;ta.value=e.str;ta.setAttribute("aria-label",t("editText"));
  ta.addEventListener("input",function(){e.str=ta.value;changed()});
  sh.appendChild(ta);
  /* carattere: «come l'originale» se il carattere del PDF ha le lettere */
  var withOrig=!isAdd&&x.kind==="pdf"&&!!S.fontsById[x.fid];
  var fl=el("label","flab erowl",t("editFont")),fs=document.createElement("select");fs.className="fin esel";
  var opts=[["helv","Helvetica"],["times","Times"],["cour","Courier"]];if(withOrig)opts.unshift(["orig",t("editFontOrig")]);
  opts.forEach(function(o){var op=document.createElement("option");op.value=o[0];op.textContent=o[1];fs.appendChild(op)});
  fs.value=e.orig?"orig":e.fam;
  fs.addEventListener("change",function(){if(fs.value==="orig"){e.orig=true;e.fam=x.fam;e.b=x.b;e.i=x.i}else{e.orig=false;e.fam=fs.value}bi();changed()});
  fl.appendChild(fs);sh.appendChild(fl);
  /* corpo, grassetto, corsivo */
  var row=el("div","erow2");
  row.appendChild(el("span","flab",t("editSize")));
  function sv(){return nf(Math.round(e.size*10)/10)}
  var st=el("div","estep"),val=el("span","eval",sv());
  function sz(d){e.size=Math.max(4,Math.min(144,Math.round((e.size+d)*2)/2));val.textContent=sv();changed()}
  var mi=btn("alt sm","−",function(){sz(e.size>20?-2:-.5)});mi.setAttribute("aria-label",t("editSmaller"));
  var pl=btn("alt sm","+",function(){sz(e.size>=20?2:.5)});pl.setAttribute("aria-label",t("editBigger"));
  st.appendChild(mi);st.appendChild(val);st.appendChild(pl);row.appendChild(st);
  var bb=btn("alt sm ebold","B",function(){e.b=!e.b;e.orig=false;fs.value=e.fam;bi();changed()});bb.setAttribute("aria-label",t("editBold"));
  var ib=btn("alt sm eital","I",function(){e.i=!e.i;e.orig=false;fs.value=e.fam;bi();changed()});ib.setAttribute("aria-label",t("editItalic"));
  function bi(){bb.setAttribute("aria-pressed",String(!!e.b));ib.setAttribute("aria-pressed",String(!!e.i))}
  bi();row.appendChild(bb);row.appendChild(ib);sh.appendChild(row);
  /* colore */
  sh.appendChild(el("p","flab",t("editColor")));
  var sw=el("div","eswatch"),orig=isAdd?null:x.color;
  SW.forEach(function(c,j){
    if(!c&&!orig)return;if(c&&orig&&c.join()===orig.join())return;var col=c||orig,b=el("button","esw");b.type="button";b.style.background="rgb("+col.join(",")+")";
    b.setAttribute("aria-label",j===0?t("editColorOrig"):"rgb("+col.join(",")+")");
    b.setAttribute("aria-pressed",String(e.color.join()===col.join()));
    b.addEventListener("click",function(){e.color=col.slice();sw.querySelectorAll(".esw").forEach(function(o){o.setAttribute("aria-pressed","false")});b.setAttribute("aria-pressed","true");changed()});
    sw.appendChild(b);
  });
  var pick=document.createElement("input");pick.type="color";pick.className="esw epick";pick.setAttribute("aria-label",t("editColorPick"));
  pick.value="#"+e.color.map(function(v){return ("0"+v.toString(16)).slice(-2)}).join("");
  pick.addEventListener("input",function(){var h=pick.value;e.color=[1,3,5].map(function(i){return parseInt(h.substr(i,2),16)});changed()});
  sw.appendChild(pick);sh.appendChild(sw);
  var wn=el("p","hint ewarn");sh.appendChild(wn);
  function warn(){
    var miss=e.orig&&canOrig(x,e.str)?"":winAnsiMissing(e.str);
    wn.textContent=miss?t("editNoGlyphs",{s:miss}):"";wn.hidden=!miss;
  }
  warn();
  var bt=el("div","acts");
  bt.appendChild(btn("danger",t("editDelText"),function(){push();if(isAdd)sel.P.A.splice(S.sel.i,1);else e.del=true;S.sel=null;refresh(pi);render()}));
  bt.appendChild(btn("ok",t("fillDone"),function(){if(isAdd&&!x.str.trim())sel.P.A.splice(S.sel.i,1);S.sel=null;refresh(pi);render()}));
  sh.appendChild(bt);setTimeout(function(){APP.fitBtns(bt)},0);
  return sh;
}
/* barra dell'immagine selezionata (R-EDT-07) */
function imgBar(sel){
  var o=sel.o,P=sel.P,pi=sel.pi;
  var bar=el("div","fsheet ebarI");bar.setAttribute("role","dialog");bar.setAttribute("aria-label",t("editImage"));
  bar.appendChild(el("p","hint",t("editImgTip")));
  var g=el("div","egrid");
  g.appendChild(btn("ok",t("editStraight"),function(){straighten(pi,o)},ICON.straight));
  g.appendChild(btn("alt",t("editSplit"),function(){splitIt(pi,o)},ICON.split));
  g.appendChild(btn("alt",t("editTurn"),function(){var gg=geom(P,o.cur);push();o.cur=viewX(P,o.cur,about(rot(Math.PI/2),gg.cx,gg.cy));refresh(pi);render()},ICON.turn));
  g.appendChild(btn("danger",t("editDelImg"),function(){push();if(o.k==null)P.I.splice(S.sel.i,1);else o.del=true;S.sel=null;refresh(pi);render()},ICON.del));
  if(o.st)g.appendChild(btn("alt ewide",t("editCorners"),function(){cornersAgain(pi,o)},ICON.corners));
  bar.appendChild(g);
  bar.appendChild(btn("alt sm edone",t("fillDone"),function(){S.sel=null;render()}));
  return bar;
}

/* ---------- immagini: zona da lavorare, Raddrizza, Separa (R-EDT-08/09) ---------- */
/* la zona dell'immagine com'è ora (con le modifiche), alla risoluzione dell'immagine */
async function regionOf(pi,o){
  var P0=S.pages[pi];if(P0.urlSig!==pageSig(P0)||refreshQ[pi]){clearTimeout(refreshT[pi]);while(refreshQ[pi])await new Promise(function(r){setTimeout(r,60)});if(P0.urlSig!==pageSig(P0))await refreshNow(pi)}
  var P=S.pages[pi],g=geom(P,o.cur),bb=bbox(g),bw=bb[2]-bb[0],bh=bb[3]-bb[1];
  var px=o.jpg?(o.jw||1000):(o.iw||1000),native=px/(g.w/72);
  var D=Math.max(150,Math.min(E.dpiMax,native)),k=D/72;
  if(bw*k*bh*k>12e6)k=Math.sqrt(12e6/(bw*bh));
  var src=P.bytes?await (await pdfjs()).getDocument({data:P.bytes.slice(0),isEvalSupported:false}).promise:S.pdoc;
  var cv=await renderTo(src,P.bytes?1:pi+1,k,[bb[0],bb[1],bw,bh]);
  if(P.bytes)src.destroy();
  return {work:cv,bb:bb,k:k,g:g};
}
function blobPut(b){var id="b"+(++S.nid);S.blobs[id]=b;return id}
async function jpgSize(b){var bm=await createImageBitmap(b),r=[bm.width,bm.height];if(bm.close)bm.close();return r}
async function canvasOf(b){var bm=await createImageBitmap(b),c=document.createElement("canvas");c.width=bm.width;c.height=bm.height;c.getContext("2d").drawImage(bm,0,0);if(bm.close)bm.close();return c}
async function warpTo(work,q,mids){
  var W=Math.max(8,Math.round((dist(q[0],q[1])+dist(q[3],q[2]))/2)),H=Math.max(8,Math.round((dist(q[0],q[3])+dist(q[1],q[2]))/2));
  var img=await APP.warp(work,q,mids||APP.projMids(q),W,H),c=document.createElement("canvas");c.width=W;c.height=H;c.getContext("2d").putImageData(img,0,0);
  return c;
}
async function straighten(pi,o){
  var P=S.pages[pi],g=geom(P,o.cur),r=resid(g.ang);
  /* messa storta nel PDF: si gira la matrice, senza ricomprimere */
  if(Math.abs(r)>E.tilt){push();o.cur=viewX(P,o.cur,about(rot(-r*Math.PI/180),g.cx,g.cy));refresh(pi);APP.stat("modifica/raddrizza");render();return}
  /* dritta, con dentro un foglio o una foto storti: l'algoritmo di Cattura */
  APP.loaderOn("scan",t("editStraightening"));
  await new Promise(function(r2){setTimeout(r2,40)});
  var done=false;
  try{
    var R=await regionOf(pi,o),w=R.work,f=null;
    try{f=APP.detectPage(w)}catch(e){}
    var W=w.width,H=w.height,tol=.015*Math.max(W,H);
    var full=!f||f.q.every(function(p,j){var c=[[0,0],[W,0],[W,H],[0,H]][j];return dist(p,c)<tol});
    if(!full){
      var out=await warpTo(w,f.q,f.mids),jb=await jpgOf(out),srcId=blobPut(await jpgOf(w,.92));
      push();
      var s=(R.bb[2]-R.bb[0])/W,c=f.q.reduce(function(a,p){return [a[0]+p[0]/4,a[1]+p[1]/4]},[0,0]);
      o.jpg=blobPut(jb);o.jw=out.width;o.cur=rectM(P,R.bb[0]+c[0]*s,R.bb[1]+c[1]*s,out.width*s,out.height*s,0);
      o.st={src:srcId,q:f.q,mids:f.mids,s:s};out.width=out.height=0;done=true;
    }
    w.width=w.height=0;
  }catch(e){console.error(e)}
  await APP.loaderOff();
  if(!done){APP.say(t("editNoStraight"));return}
  APP.stat("modifica/raddrizza");refresh(pi);render();
}
/* «Angoli a mano» sull'immagine raddrizzata: l'editor di Cattura sulla zona di partenza */
async function cornersAgain(pi,o){
  var st=o.st;if(!st||!S.blobs[st.src])return;
  var work=await canvasOf(S.blobs[st.src]);
  var r=await APP.editCorners(work,{q:st.q,mids:st.mids},{plain:true});
  if(!r||r==="retake")return;
  APP.loaderOn("scan",t("editStraightening"));
  try{
    var out=await warpTo(r.work,r.q,r.mids),jb=await jpgOf(out),P=S.pages[pi],g=geom(P,o.cur);
    push();o.jpg=blobPut(jb);o.cur=rectM(P,g.cx,g.cy,out.width*st.s,out.height*st.s,g.ang);o.jw=out.width;o.st={src:st.src,q:r.q,mids:r.mids,s:st.s};
    out.width=out.height=0;
  }catch(e){console.error(e)}
  await APP.loaderOff();refresh(pi);render();
}
/* «Separa» (R-EDT-09): le foto dentro l'immagine, ognuna dritta e a sé; sotto, lo sfondo ricostruito */
async function splitIt(pi,o){
  APP.loaderOn("scan",t("editSplitting"));
  await new Promise(function(r2){setTimeout(r2,40)});
  var n=0;
  try{
    var P=S.pages[pi],R=await regionOf(pi,o),w=R.work,res=splitImage(w);
    if(res.quads.length){
      var s=(R.bb[2]-R.bb[0])/w.width,parts=[];
      for(var j=0;j<res.quads.length;j++){
        var q=res.quads[j],out=await warpTo(w,q),jb=await jpgOf(out),c=q.reduce(function(a,p){return [a[0]+p[0]/4,a[1]+p[1]/4]},[0,0]);
        parts.push({jpg:blobPut(jb),jw:out.width,cur:rectM(P,R.bb[0]+c[0]*s,R.bb[1]+c[1]*s,out.width*s,out.height*s,0)});out.width=out.height=0;
      }
      fillHoles(w,res.mask,res.mw,res.mh);
      var bg=blobPut(await jpgOf(w));
      push();
      var at=o.k!=null?o.k:o.at,idx=P.I.indexOf(o);
      o.jpg=bg;o.jw=w.width;o.cur=rectM(P,(R.bb[0]+R.bb[2])/2,(R.bb[1]+R.bb[3])/2,R.bb[2]-R.bb[0],R.bb[3]-R.bb[1],0);o.st=null;
      parts.forEach(function(p,j){P.I.splice(idx+1+j,0,{id:"n"+(++S.nid),k:null,at:at,name:null,orig:null,cur:p.cur,jpg:p.jpg,jw:p.jw,del:false})});
      n=parts.length;
    }
    w.width=w.height=0;
  }catch(e){console.error(e)}
  await APP.loaderOff();
  if(!n){APP.say(t("editNoSplit"));return}
  APP.stat("modifica/separa/"+APP.bucket(n));
  APP.say(t("editSplitDone",{n:nf(n)}));S.sel=null;refresh(pi);render();
}
/* trova le foto: sfondo dal bordo, maschera, componenti; quelle attaccate si dividono restringendole */
function splitImage(work){
  var C=E.split,W0=work.width,H0=work.height,k=Math.min(1,C.size/Math.max(W0,H0)),w=Math.max(8,Math.round(W0*k)),h=Math.max(8,Math.round(H0*k)),n=w*h,i,x,y;
  var cv=document.createElement("canvas");cv.width=w;cv.height=h;var g=cv.getContext("2d",{willReadFrequently:true});g.imageSmoothingQuality="high";g.drawImage(work,0,0,w,h);
  var d=g.getImageData(0,0,w,h).data;cv.width=cv.height=0;
  var ch=[0,1,2].map(function(c){var a=new Float32Array(n);for(i=0;i<n;i++)a[i]=d[i*4+c];return blur(blur(a,w,h,2),w,h,2)});
  var b=Math.max(3,Math.round(Math.min(w,h)*.013)),ring=[];
  for(y=0;y<h;y++)for(x=0;x<w;x++)if(x<b||y<b||x>=w-b||y>=h-b)ring.push(y*w+x);
  var bg=[0,1,2].map(function(c){return median(ring.map(function(j){return ch[c][j]}))});
  var diff=new Float32Array(n);for(i=0;i<n;i++)diff[i]=Math.max(Math.abs(ch[0][i]-bg[0]),Math.abs(ch[1][i]-bg[1]),Math.abs(ch[2][i]-bg[2]));
  var rd=ring.map(function(j){return diff[j]}).sort(function(a,b2){return a-b2}),noise=rd[Math.floor(rd.length*.99)]||0,thr=Math.max(C.minDiff,noise*C.noise);
  var m=new Uint8Array(n);for(i=0;i<n;i++)m[i]=diff[i]>thr?1:0;
  m=morph(morph(m,w,h,C.close,true),w,h,C.close,false);m=morph(morph(m,w,h,C.open,false),w,h,C.open,true);
  var comps=label(m,w,h).filter(function(c){return c.length>=C.minArea*n}),quads=[],all=new Uint8Array(n);
  comps.forEach(function(c){parts(c,w,h,0).forEach(function(p){
    if(p.length<C.minArea*n)return;
    var r=minRect(p,w);if(!r)return;
    quads.push(order(r).map(function(pt){return [Math.max(0,Math.min(W0,pt[0]/k)),Math.max(0,Math.min(H0,pt[1]/k))]}));
    p.forEach(function(j){all[j]=1});
  })});
  all=morph(all,w,h,C.grow,true);
  return {quads:quads,mask:all,mw:w,mh:h};
}
function blur(a,w,h,r){
  var o=new Float32Array(a.length),x,y,s,c;
  for(y=0;y<h;y++){s=0;c=0;for(x=-r;x<w+r;x++){var ad=x+r;if(ad<w){s+=a[y*w+ad];c++}var rm=x-r-1;if(rm>=0){s-=a[y*w+rm];c--}if(x>=0&&x<w)o[y*w+x]=s/c}}
  var o2=new Float32Array(a.length);
  for(x=0;x<w;x++){s=0;c=0;for(y=-r;y<h+r;y++){var ad2=y+r;if(ad2<h){s+=o[ad2*w+x];c++}var rm2=y-r-1;if(rm2>=0){s-=o[rm2*w+x];c--}if(y>=0&&y<h)o2[y*w+x]=s/c}}
  return o2;
}
/* dilata (grow) o erode un quadrato di raggio r, separabile */
function morph(m,w,h,r,grow){
  if(r<=0)return m;var t1=new Uint8Array(m.length),o=new Uint8Array(m.length),x,y,j;
  for(y=0;y<h;y++)for(x=0;x<w;x++){var v=grow?0:1;for(j=Math.max(0,x-r);j<=Math.min(w-1,x+r);j++){var q=m[y*w+j];if(grow?q:!q){v=grow?1:0;break}}t1[y*w+x]=v}
  for(x=0;x<w;x++)for(y=0;y<h;y++){var v2=grow?0:1;for(j=Math.max(0,y-r);j<=Math.min(h-1,y+r);j++){var q2=t1[j*w+x];if(grow?q2:!q2){v2=grow?1:0;break}}o[y*w+x]=v2}
  return o;
}
function label(m,w,h){
  var seen=new Uint8Array(m.length),out=[],st=[];
  for(var i=0;i<m.length;i++){if(!m[i]||seen[i])continue;var c=[];seen[i]=1;st.push(i);
    while(st.length){var p=st.pop();c.push(p);var x=p%w,y=(p/w)|0;
      if(x>0&&m[p-1]&&!seen[p-1]){seen[p-1]=1;st.push(p-1)}if(x<w-1&&m[p+1]&&!seen[p+1]){seen[p+1]=1;st.push(p+1)}
      if(y>0&&m[p-w]&&!seen[p-w]){seen[p-w]=1;st.push(p-w)}if(y<h-1&&m[p+w]&&!seen[p+w]){seen[p+w]=1;st.push(p+w)}}
    out.push(c)}
  return out;
}
/* una macchia che riempie poco il suo rettangolo può essere più foto che si toccano: si restringe finché si stacca */
function parts(c,w,h,depth){
  var r=minRect(c,w);if(!r||depth>2||c.length/r.area>=E.split.fill)return [c];
  var inC=new Uint8Array(w*h);c.forEach(function(j){inC[j]=1});
  var dt=new Float32Array(w*h),i,x,y,mx=0;
  for(i=0;i<w*h;i++)dt[i]=inC[i]?1e9:0;
  for(y=0;y<h;y++)for(x=0;x<w;x++){i=y*w+x;if(!inC[i])continue;var v=dt[i];if(x>0)v=Math.min(v,dt[i-1]+3);if(y>0){v=Math.min(v,dt[i-w]+3);if(x>0)v=Math.min(v,dt[i-w-1]+4);if(x<w-1)v=Math.min(v,dt[i-w+1]+4)}if(x===0||y===0)v=Math.min(v,3);dt[i]=v}
  for(y=h-1;y>=0;y--)for(x=w-1;x>=0;x--){i=y*w+x;if(!inC[i])continue;var v2=dt[i];if(x<w-1)v2=Math.min(v2,dt[i+1]+3);if(y<h-1){v2=Math.min(v2,dt[i+w]+3);if(x<w-1)v2=Math.min(v2,dt[i+w+1]+4);if(x>0)v2=Math.min(v2,dt[i+w-1]+4)}if(x===w-1||y===h-1)v2=Math.min(v2,3);dt[i]=v2;if(v2>mx)mx=v2}
  for(var f=.2;f<=.81;f+=.05){
    var th=f*mx,core=new Uint8Array(w*h),cn=0;c.forEach(function(j){if(dt[j]>th){core[j]=1;cn++}});
    var cc=label(core,w,h).filter(function(q){return q.length>.15*cn});
    if(cc.length<2)continue;
    /* ogni pixel della macchia al nucleo più vicino, camminando dentro la macchia */
    var lab=new Int32Array(w*h),qu=[],head=0;
    cc.forEach(function(q,qi){q.forEach(function(j){lab[j]=qi+1;qu.push(j)})});
    while(head<qu.length){var p=qu[head++],px=p%w,l=lab[p];[p-1,p+1,p-w,p+w].forEach(function(nq,d){if(nq<0||nq>=w*h||(d===0&&px===0)||(d===1&&px===w-1))return;if(inC[nq]&&!lab[nq]){lab[nq]=l;qu.push(nq)}})}
    var out=cc.map(function(){return []});c.forEach(function(j){if(lab[j])out[lab[j]-1].push(j)});
    var res=[];out.forEach(function(o){res=res.concat(parts(o,w,h,depth+1))});return res;
  }
  return [c];
}
/* rettangolo di area minima (guscio convesso, un lato del guscio per direzione) */
function minRect(c,w){
  var pts=[],rows={};
  c.forEach(function(j){var x=j%w,y=(j/w)|0,r=rows[y];if(!r)rows[y]=[x,x];else{if(x<r[0])r[0]=x;if(x>r[1])r[1]=x}});
  for(var y in rows){var r2=rows[y],yy=+y;pts.push([r2[0],yy],[r2[1]+1,yy],[r2[0],yy+1],[r2[1]+1,yy+1])}
  if(pts.length<3)return null;
  pts.sort(function(a,b){return a[0]-b[0]||a[1]-b[1]});
  function cross(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])}
  var lo=[],up=[];
  pts.forEach(function(p){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)});
  for(var i=pts.length-1;i>=0;i--){var p=pts[i];while(up.length>=2&&cross(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p)}
  var hull=lo.slice(0,-1).concat(up.slice(0,-1)),best=null;
  for(i=0;i<hull.length;i++){
    var a=hull[i],b=hull[(i+1)%hull.length],ang=Math.atan2(b[1]-a[1],b[0]-a[0]),cs=Math.cos(ang),sn=Math.sin(ang),x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    hull.forEach(function(p){var u=p[0]*cs+p[1]*sn,v=-p[0]*sn+p[1]*cs;if(u<x0)x0=u;if(u>x1)x1=u;if(v<y0)y0=v;if(v>y1)y1=v});
    var area=(x1-x0)*(y1-y0);
    if(!best||area<best.area)best={area:area,pts:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(function(q){return [q[0]*cs-q[1]*sn,q[0]*sn+q[1]*cs]})};
  }
  return best;
}
function order(r){
  var p=r.pts.slice().sort(function(a,b){return a[1]-b[1]}),tp=p.slice(0,2).sort(function(a,b){return a[0]-b[0]}),bt=p.slice(2).sort(function(a,b){return b[0]-a[0]});
  return [tp[0],tp[1],bt[0],bt[1]];
}
/* lo sfondo sotto le foto: medie da una piramide di copie più piccole, ingrandite nei buchi */
function fillHoles(work,mask,mw,mh){
  var cv=document.createElement("canvas");cv.width=mw;cv.height=mh;var g=cv.getContext("2d",{willReadFrequently:true});g.drawImage(work,0,0,mw,mh);
  var im=g.getImageData(0,0,mw,mh),d=im.data,n=mw*mh,lv=[],c,i,x,y;
  var col=[0,1,2].map(function(ch){var a=new Float32Array(n);for(i=0;i<n;i++)a[i]=d[i*4+ch];return a}),wt=new Float32Array(n);for(i=0;i<n;i++)wt[i]=mask[i]?0:1;
  lv.push({w:mw,h:mh,c:col,wt:wt});
  while(lv[lv.length-1].w>1||lv[lv.length-1].h>1){
    var L=lv[lv.length-1],w2=Math.max(1,Math.ceil(L.w/2)),h2=Math.max(1,Math.ceil(L.h/2)),cc=[new Float32Array(w2*h2),new Float32Array(w2*h2),new Float32Array(w2*h2)],ww=new Float32Array(w2*h2);
    for(y=0;y<L.h;y++)for(x=0;x<L.w;x++){var j=y*L.w+x,k2=(y>>1)*w2+(x>>1),q=L.wt[j];if(!q)continue;ww[k2]+=q;for(c=0;c<3;c++)cc[c][k2]+=L.c[c][j]*q}
    for(i=0;i<w2*h2;i++){if(ww[i]>0)for(c=0;c<3;c++)cc[c][i]/=ww[i];ww[i]=Math.min(1,ww[i])}
    lv.push({w:w2,h:h2,c:cc,wt:ww});
  }
  for(var l=lv.length-2;l>=0;l--){
    var A=lv[l],B=lv[l+1];
    for(y=0;y<A.h;y++)for(x=0;x<A.w;x++){var j2=y*A.w+x,q2=A.wt[j2];if(q2>=1)continue;var kb=Math.min(B.h-1,y>>1)*B.w+Math.min(B.w-1,x>>1);for(c=0;c<3;c++)A.c[c][j2]=A.c[c][j2]*q2+B.c[c][kb]*(1-q2);A.wt[j2]=1}
  }
  for(i=0;i<n;i++){if(!mask[i])continue;for(c=0;c<3;c++)d[i*4+c]=col[c][i]}
  /* solo i buchi: la copia piccola ingrandita va dove c'era una foto, il resto resta a piena risoluzione */
  for(i=0;i<n;i++)d[i*4+3]=mask[i]?255:0;
  g.putImageData(im,0,0);
  var big=document.createElement("canvas");big.width=work.width;big.height=work.height;var bg=big.getContext("2d");bg.imageSmoothingQuality="high";bg.drawImage(cv,0,0,big.width,big.height);
  work.getContext("2d").drawImage(big,0,0);cv.width=cv.height=big.width=big.height=0;
}

/* ---------- PDF modificato (R-EDT-10/11) ---------- */
function blankOp(r){
  var th=r.tz/100,n=r.fs&&th?-1000*r.adv/(r.fs*th):0;
  var pre=r.op==="'"?"T* ":r.op==='"'?num(r.tw)+" Tw "+num(r.tc)+" Tc T* ":"";
  return pre+"["+num(n)+"] TJ";
}
function showOnly(r){return r.show}
function reemit(r,du){
  return "q 1 0 0 1 "+num(du[0])+" "+num(du[1])+" cm "+r.ctm.map(num).join(" ")+" cm BT "+r.fill+" "+r.font+" "+num(r.fs)+" Tf "+num(r.tc)+" Tc "+num(r.tw)+" Tw "+num(r.tz)+" Tz "+num(r.ts)+" Ts "+r.tr+" Tr "+r.tm.map(num).join(" ")+" Tm "+showOnly(r)+" ET Q";
}
function userDelta(P,dx,dy){var iv=inv(P.vt),a=ap(iv,0,0),b=ap(iv,dx,dy);return [b[0]-a[0],b[1]-a[1]]}
function userPt(P,x,y){return ap(inv(P.vt),x,y)}
function rgbOp(c,op){return c.map(function(v){return num(v/255)}).join(" ")+" "+op}
function safeText(s){var o="";for(var ch of s){var c=ch.charCodeAt(0);o+=(ch==="\n"||ch.length===1&&((c>=32&&c<127)||(c>=160&&c<256)||WINREV[ch]!=null))?ch:"?"}return o}
async function applyPage(L,doc,page,P){
  var ctx=doc.context,src=contentOf(L,page),ops=tokenize(src),rep={},extra=[],news=[],crops=[],stdF={};
  function fontStd(fam,b,i){var k=stdOf(fam,b,i);if(!stdF[k])stdF[k]=doc.embedFont(L.StandardFonts[k]);return stdF[k]}
  async function xobj(blobId){var b=S.blobs[blobId];if(!b)return null;var im=await doc.embedJpg(new Uint8Array(await b.arrayBuffer()));return String(page.node.newXObject("EdIm",im.ref))}
  /* testi */
  P.T.forEach(function(x){
    var ch=textChanged(x),mv=textMoved(x);if(!ch&&!mv)return;var e=x.e;
    if(x.kind==="pdf"){
      x.runs.forEach(function(ri){var r=P.R[ri];rep[r.k]=blankOp(r)});
      if(!ch){var du=userDelta(P,e.dx,e.dy);x.runs.forEach(function(ri){extra.push(reemit(P.R[ri],du))})}
      else if(!e.del&&e.str.trim())news.push({x:x.x0+e.dx,y:x.base+e.dy,e:e,src:x});
    }else{
      var pad=(x.y1-x.y0)*.15,cs=[[x.x0-pad,x.y0-pad],[x.x1+pad,x.y0-pad],[x.x1+pad,x.y1+pad],[x.x0-pad,x.y1+pad]].map(function(p){return userPt(P,p[0],p[1])});
      extra.push("q "+rgbOp(x.bg,"rg")+" "+cs.map(function(p,j){return num(p[0])+" "+num(p[1])+(j?" l":" m")}).join(" ")+" h f Q");
      P.R.forEach(function(r){if(r.inv&&r.x1>x.x0-pad&&r.x0<x.x1+pad&&r.base>x.y0-pad&&r.base<x.y1+pad*3)rep[r.k]=blankOp(r)});
      if(!ch)crops.push({x:x,pad:pad});
      else if(!e.del&&e.str.trim())news.push({x:x.x0+e.dx,y:x.base+e.dy,e:e,src:x});
    }
  });
  P.A.forEach(function(a){if(a.str.trim())news.push({x:a.x,y:a.y,e:a,src:null})});
  /* immagini: al loro posto nel flusso, così restano sopra o sotto quello che avevano intorno */
  var after={};
  for(var j=0;j<P.I.length;j++){
    var o=P.I[j];
    if(o.k==null){if(o.del)continue;var nmx=await xobj(o.jpg);if(!nmx)continue;var at=o.at!=null?o.at:-1;var host=P.I.find(function(z){return z.k===at});
      var base=host?host.orig:[1,0,0,1,0,0],fx=mul(o.cur,inv(base));(after[at]=after[at]||[]).push("q "+fx.map(num).join(" ")+" cm "+nmx+" Do Q");continue}
    if(o.del){rep[o.k]="";continue}
    if(!o.jpg&&same(o.cur,o.orig))continue;
    var name=o.name;if(o.jpg){name=await xobj(o.jpg);if(!name)continue}
    var fix=mul(o.cur,inv(o.orig));
    rep[o.k]="q "+fix.map(num).join(" ")+" cm "+name+" Do Q";
  }
  Object.keys(after).forEach(function(k){
    var kk=+k,add=after[k].join(" ");
    if(kk<0){extra.unshift(add);return}
    var op=ops[kk];rep[kk]=(rep[kk]!=null?rep[kk]:src.slice(op.s,op.e))+" "+add;
  });
  /* righe di una scansione solo spostate: ritagliate dalla pagina letta e rimesse altrove */
  if(crops.length&&P.hi){
    var hi=await canvasOf(P.hi),k=hi.width/P.vw;
    for(var c=0;c<crops.length;c++){
      var x=crops[c].x,pd=crops[c].pad,e2=x.e,cv=document.createElement("canvas"),x0=x.x0-pd,y0=x.y0-pd,w=x.x1-x.x0+2*pd,h=x.y1-x.y0+2*pd;
      cv.width=Math.max(1,Math.round(w*k));cv.height=Math.max(1,Math.round(h*k));cv.getContext("2d").drawImage(hi,x0*k,y0*k,w*k,h*k,0,0,cv.width,cv.height);
      var im=await doc.embedJpg(new Uint8Array(await (await jpgOf(cv,.9)).arrayBuffer())),nmc=String(page.node.newXObject("EdLn",im.ref));cv.width=cv.height=0;
      var M=rectM(P,x0+w/2+e2.dx,y0+h/2+e2.dy,w,h,0);
      extra.push("q "+M.map(num).join(" ")+" cm "+nmc+" Do Q");
    }
    hi.width=hi.height=0;
  }
  /* testi cambiati «come l'originale»: i codici del carattere del PDF */
  var fonts=null;
  for(var q=0;q<news.length;q++){
    var nw=news[q];if(!nw.e.orig||!nw.src||nw.src.kind!=="pdf")continue;
    var f=S.fontsById[nw.src.fid],lines=nw.e.str.split("\n"),codes=lines.map(function(l){return fEncode(f,l,S.seen[nw.src.fid])});
    if(codes.some(function(c2){return !c2}))continue;
    var r=P.R[nw.src.runs[0]],d=userDelta(P,1,0),up=userDelta(P,0,-1),b0=userPt(P,nw.x,nw.y),s=nw.e.size;
    var out="q BT "+rgbOp(nw.e.color,"rg")+" "+r.font+" "+num(s)+" Tf";
    lines.forEach(function(l,li){var p=[b0[0]-up[0]*li*s*1.2,b0[1]-up[1]*li*s*1.2];out+=" "+[d[0],d[1],up[0],up[1],p[0],p[1]].map(num).join(" ")+" Tm "+hexOf(codes[li])+" Tj"});
    extra.push(out+" ET Q");nw.done=true;
  }
  /* il flusso della pagina, con le sostituzioni, tra q … Q; poi le aggiunte */
  var out2=src,ks=Object.keys(rep).map(Number).sort(function(a,b){return b-a});
  ks.forEach(function(k3){var o3=ops[k3];out2=out2.slice(0,o3.s)+rep[k3]+out2.slice(o3.e)});
  var bal="";for(var z=0;z<P.depth;z++)bal+=" Q";
  var refs=[ctx.register(ctx.flateStream(bytesL1("q\n"+out2+"\n"+bal+"\nQ\n")))];
  if(extra.length)refs.push(ctx.register(ctx.flateStream(bytesL1(extra.join("\n")))));
  page.node.set(L.PDFName.of("Contents"),ctx.obj(refs));
  /* testi nuovi con i caratteri standard (R-EDT-11) */
  for(q=0;q<news.length;q++){
    var n2=news[q];if(n2.done)continue;
    var e3=n2.e,font=await fontStd(e3.fam,e3.b,e3.i),bp=userPt(P,n2.x,n2.y),dd=userDelta(P,1,0),ang=Math.atan2(dd[1],dd[0])*180/Math.PI;
    try{page.drawText(safeText(e3.str),{x:bp[0],y:bp[1],size:e3.size,font:font,color:L.rgb(e3.color[0]/255,e3.color[1]/255,e3.color[2]/255),lineHeight:e3.size*1.2,rotate:L.degrees(ang)})}catch(er){console.error(er)}
  }
}
async function build(){
  var L=await APP.pdfLib();if(!L)throw new Error("pdf-lib");
  var doc=await L.PDFDocument.load(S.src,{ignoreEncryption:true,updateMetadata:false});
  for(var i=0;i<S.pages.length;i++){var P=S.pages[i];if(dirtyPage(P))await applyPage(L,doc,doc.getPage(i),P)}
  return new Blob([await doc.save({useObjectStreams:true})],{type:"application/pdf"});
}
/* passo 3 (R-EDT-12) */
function renderSave(box){
  var p=panel(t("editS3"));p.classList.add("fsave");
  var n=edits();
  p.appendChild(el("p","fq",S.name+"-"+t("editSuffix")+".pdf"));
  var b=el("button","btn lg fbig ok esaveBig");b.type="button";
  var th=el("span","fthumb esaveThumb"),im=document.createElement("img");if(S.pages[0]&&S.pages[0].url)im.src=S.pages[0].url;im.alt="";th.appendChild(im);b.appendChild(th);
  var tx=el("span","two");tx.appendChild(el("span",null,t("editSavePdf")));tx.appendChild(el("small",null,t("editChanges",{n:nf(n)})));b.appendChild(tx);
  b.addEventListener("click",save);p.appendChild(b);
  var bt=el("div","acts");bt.appendChild(btn("alt",t("editBack"),function(){S.view="edit";render();top()},ICON.back));p.appendChild(bt);
  box.appendChild(p);
}
async function save(){
  APP.loaderOn("scan",t("buildPdf"));
  var blob=null;try{blob=await build()}catch(e){console.error(e)}
  await APP.loaderOff();
  if(!blob){APP.say(t("failed"),true);return}
  var nmf=S.name+"-"+t("editSuffix")+".pdf";
  if(await APP.saveBlob(nmf,blob)){
    APP.say(t("saved",{name:APP.savedAs()}));APP.stat("modifica/salva");APP.festa();
    sessDrop();S.cleanSig=sig();
  }
}

/* ---------- lavoro salvato sul dispositivo (R-EDT-13, R-APP-18) ---------- */
function sig(){return snap()+"|"+S.view}
function saveSoon(){if(!S.pages.length)return;clearTimeout(S.saveT);S.saveT=setTimeout(saveNow,1500)}
function sessDrop(){clearTimeout(S.saveT);if(S.sid){APP.jobDrop(S.sid);S.sid=null}S.stored=false;S.storedB={}}
async function saveNow(){
  clearTimeout(S.saveT);if(!S.pages.length||S.saving)return;
  var g=sig();if(g===S.cleanSig||g===S.lastSig&&S.sid)return;
  if(!edits()&&!S.sid)return;
  S.saving=true;
  try{
    if(!S.sid){S.sid="e"+Date.now();S.stored=false;S.storedB={}}
    var id=S.sid;S.storedB=S.storedB||{};
    if(!S.stored){
      await APP.filePut(id,"src",new Blob([S.src],{type:"application/pdf"}));
      for(var i=0;i<S.pages.length;i++)if(S.pages[i].hi)await APP.filePut(id,"hi"+i,S.pages[i].hi);
      S.stored=true;
    }
    for(var b in S.blobs)if(!S.storedB[b]){await APP.filePut(id,b,S.blobs[b]);S.storedB[b]=1}
    if(S.sid!==id)return;
    var ocr={};S.pages.forEach(function(P,i){if(P.ocr)ocr[i]={T:P.T.map(function(x){var c={};for(var k in x)if(k!=="e")c[k]=x[k];return c})}});
    await APP.jobPut({id:id,v:APP.JOBV(),kind:"edit",t:Date.now(),name:S.name,n:edits(),pages:S.pages.length,view:S.view,zoom:S.zoom,style:S.style,nid:S.nid,
      blobIds:Object.keys(S.blobs),ocr:ocr,snap:snap()});
    S.lastSig=g;
  }catch(e){}
  finally{S.saving=false}
}
async function restore(rec){
  var sb=await APP.fileGet(rec.id,"src");if(!sb)return false;
  var bytes=new Uint8Array(await sb.arrayBuffer()),blobs={};
  for(var i=0;i<(rec.blobIds||[]).length;i++){var b=await APP.fileGet(rec.id,rec.blobIds[i]);if(b)blobs[rec.blobIds[i]]=b}
  var ocr=rec.ocr||{};for(var k in ocr){var hb=await APP.fileGet(rec.id,"hi"+k);ocr[k].hi=hb||null}
  var ok=await load(bytes,rec.name,{id:rec.id,ocr:ocr,blobs:blobs,nid:rec.nid,view:rec.view,zoom:rec.zoom,style:rec.style,snap:rec.snap});
  if(ok){S.storedB={};Object.keys(blobs).forEach(function(b2){S.storedB[b2]=1});S.lastSig=sig();S.cleanSig=null}
  return ok;
}

window.Modifica={
  render:render,busy:busy,
  clear:function(){sessDrop();clearAll(false);S.cleanSig=S.lastSig=null},
  saveNow:saveNow,restore:restore,openFiles:openFiles,
  cancel:function(){cancel=true},
  /* per le prove */
  _state:S,_build:build,_tokenize:tokenize,_walk:walk,_split:splitImage
};
})();

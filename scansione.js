/* Scansione di Schiaccia (R-APP-21): da una foto di un documento alla pagina raddrizzata e pulita.
   Bordi del foglio, prospettiva, pieghe, ombre, pulizia dei bordi, orientamento e inclinazione (R-SCN), e i motori di
   Tesseract con il loro spegnimento (R-APP-17). La stessa per la pagina (Cattura, Compila, Modifica) e per altre app sullo
   stesso dominio (Kapibo). Script classico, senza dipendenze: va caricato dopo config.js (window.CONFIG). Carica da solo,
   dalla sua cartella, vendor/tesseract/ solo quando serve. Nessuna chiamata di rete con le immagini.
   API pubblica: window.Scansione (vedi in fondo e docs/ARCHITETTURA.md). */
(function (G) {
"use strict";
var CFG=G.CONFIG;
/* cartella da cui caricare i propri file: quella di scansione.js */
var BASE=(function(){try{var s=G.document&&G.document.currentScript;return new URL("./",s&&s.src?s.src:G.location.href).href}catch(e){return "./"}})();
function url(p){return new URL(p,new URL(BASE,G.location.href)).href}
var scriptP={};
function loadScript(src){
  var u=url(src);
  return scriptP[u]||(scriptP[u]=new Promise(function(res,rej){
    var sc=G.document.createElement("script");sc.src=u;sc.onload=res;sc.onerror=function(){scriptP[u]=null;rej(new Error(src))};G.document.head.appendChild(sc);
  }));
}
/* misure dei tempi e dati di prova: la pagina li accende con ?perf=1 (setPerf, onPerf) */
var PERF=false;
function perf(label,t0){if(S.onPerf)try{S.onPerf(label,t0)}catch(e){}}

function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
/* omografia che porta i quattro punti dst sui quattro punti src (sistema lineare 8×8) */
function homography(dst,src){
  var A=[],B=[];
  for(var i=0;i<4;i++){
    var x=dst[i][0],y=dst[i][1],u=src[i][0],v=src[i][1];
    A.push([x,y,1,0,0,0,-u*x,-u*y]);B.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);B.push(v);
  }
  for(var c=0;c<8;c++){
    var piv=c;for(var r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[piv][c]))piv=r;
    var tA=A[c];A[c]=A[piv];A[piv]=tA;var tB=B[c];B[c]=B[piv];B[piv]=tB;
    for(r=0;r<8;r++){
      if(r===c)continue;
      var f=A[r][c]/A[c][c];if(!f)continue;
      for(var k=c;k<8;k++)A[r][k]-=f*A[c][k];
      B[r]-=f*B[c];
    }
  }
  var hh=[];for(c=0;c<8;c++)hh.push(B[c]/A[c][c]);hh.push(1);
  return hh;
}
function applyH(m,x,y){var d=m[6]*x+m[7]*y+1;return [(m[0]*x+m[1]*y+m[2])/d,(m[3]*x+m[4]*y+m[5])/d]}
var UNIT=[[0,0],[1,0],[1,1],[0,1]];
/* punti medi «prospettici» dei lati (dove cadrebbe il centro di un lato dritto): alto, destra, basso, sinistra */
function projMids(q){var m=homography(UNIT,q);return [applyH(m,.5,0),applyH(m,1,.5),applyH(m,.5,1),applyH(m,0,.5)]}
/* funzione che porta un punto del foglio raddrizzato (0…W, 0…H) sulla foto.
   I quattro angoli danno la prospettiva; le maniglie dei lati, riportate nel foglio raddrizzato, danno quattro curve
   di Bézier e una superficie di Coons che piega il reticolato. Lati dritti = sola prospettiva. */
function pageMap(q,mids,W,H){
  var Hm=homography([[0,0],[W,0],[W,H],[0,H]],q),Hi=homography(q,[[0,0],[W,0],[W,H],[0,H]]);
  var mo=mids.map(function(p){return applyH(Hi,p[0],p[1])});
  var Ct=[2*mo[0][0]-W/2,2*mo[0][1]],Cr=[2*mo[1][0]-W,2*mo[1][1]-H/2],Cb=[2*mo[2][0]-W/2,2*mo[2][1]-H],Cl=[2*mo[3][0],2*mo[3][1]-H/2];
  var tol=Math.max(W,H)*.002;
  var curved=Math.abs(Ct[1])>tol||Math.abs(Cb[1]-H)>tol||Math.abs(Cl[0])>tol||Math.abs(Cr[0]-W)>tol||
             Math.abs(Ct[0]-W/2)>tol||Math.abs(Cb[0]-W/2)>tol||Math.abs(Cl[1]-H/2)>tol||Math.abs(Cr[1]-H/2)>tol;
  return function(x,y){
    if(curved){
      var u=x/W,v=y/H,su=1-u,sv=1-v;
      var tx=2*su*u*Ct[0]+u*u*W,ty=2*su*u*Ct[1];
      var bx=2*su*u*Cb[0]+u*u*W,by=su*su*H+2*su*u*Cb[1]+u*u*H;
      var lx=2*sv*v*Cl[0],ly=2*sv*v*Cl[1]+v*v*H;
      var rx=sv*sv*W+2*sv*v*Cr[0]+v*v*W,ry=2*sv*v*Cr[1]+v*v*H;
      x=sv*tx+v*bx+su*lx+u*rx-u*W;
      y=sv*ty+v*by+su*ly+u*ry-v*H;
    }
    var d=Hm[6]*x+Hm[7]*y+1;
    return [(Hm[0]*x+Hm[1]*y+Hm[2])/d,(Hm[3]*x+Hm[4]*y+Hm[5])/d];
  };
}
/* ---------- scansione sulla scheda grafica (R-APP-09) ----------
   Raddrizzamento: una griglia di triangoli, ogni vertice portato sulla foto con pageMap; la grafica campiona in bilineare.
   Pulizia: luce del foglio e livelli calcolati su una copia piccola (come enhance), divisione e curve in uno shader.
   Se WebGL2 manca o qualcosa non torna, restituisce null e si usa il calcolo in JavaScript. */
var glS=null,glOff=false;
function glSetup(){
  if(glS||glOff)return glS;
  try{if(/[?&]gl=0/.test(location.search)){glOff=true;return null}}catch(e){}
  var c=document.createElement("canvas"),gl=c.getContext("webgl2",{premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:false});
  if(!gl){glOff=true;return null}
  /* una grafica simulata dal processore (SwiftShader, llvmpipe) è più lenta del calcolo in JavaScript: lì no, salvo ?gl=1 */
  try{
    var dbg=gl.getExtension("WEBGL_debug_renderer_info"),rn=dbg?String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)):"";
    if(/swiftshader|llvmpipe|software|softpipe/i.test(rn)&&!/[?&]gl=1/.test(location.search)){glOff=true;return null}
  }catch(e){}
  function sh(type,src){var o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o}
  function prog(vs,fs){var p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.bindAttribLocation(p,0,"pos");gl.bindAttribLocation(p,1,"uv");gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p}
  try{
    var VS="#version 300 es\nin vec2 pos;in vec2 uv;out vec2 v;void main(){v=uv;gl_Position=vec4(pos,0.,1.);}";
    glS={c:c,gl:gl,max:gl.getParameter(gl.MAX_TEXTURE_SIZE),
      copy:prog(VS,"#version 300 es\nprecision highp float;in vec2 v;uniform sampler2D t;out vec4 o;void main(){o=vec4(texture(t,v).rgb,1.);}"),
      /* mode 0 = colore (livelli per canale), 1 = documento, 2 = bianco e nero */
      fin:prog(VS,"#version 300 es\nprecision highp float;in vec2 v;uniform sampler2D t;uniform sampler2D bg;uniform int mode;uniform vec3 lo;uniform vec3 hi;uniform float low;out vec4 o;"+
        "float L(float i){float z=max(0.,(floor(i)-low)/(250.-low));return 255.*pow(min(1.,z),1.25);}"+
        "void main(){vec3 c=floor(texture(t,v).rgb*255.+.5);vec3 r;"+
        "if(mode==0){r=(c-lo)*255./(hi-lo)*.6+c*.4;}"+
        "else{vec3 b=texture(bg,v).rgb*255.;vec3 d=min(vec3(255.),floor(c*248./max(b,vec3(40.))));"+
        "if(mode==1){r=vec3(L(d.r),L(d.g),L(d.b));}else{float g=L(floor(dot(d,vec3(.3,.59,.11))));r=vec3(clamp((g-150.)*255./70.,0.,255.));}}"+
        "o=vec4(clamp(floor(r)/255.,0.,1.),1.);}"),
      buf:gl.createBuffer()};
    c.addEventListener("webglcontextlost",function(e){e.preventDefault();glS=null;glOff=true});
  }catch(e){glOff=true;glS=null}
  return glS;
}
function glTex(gl,src,w,h,linear){
  var t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  var f=linear?gl.LINEAR:gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  if(src&&!(src instanceof Uint8Array))gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,src||null);
  return t;
}
function glDraw(S,prog,data,mode){
  var gl=S.gl;gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,S.buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STREAM_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);
  gl.drawArrays(mode||gl.TRIANGLES,0,data.length/4);
}
var QUAD=new Float32Array([-1,-1,0,0, 1,-1,1,0, -1,1,0,1, -1,1,0,1, 1,-1,1,0, 1,1,1,1]);
async function glPage(work,q,mids,W,H,style){
  var S=glSetup();if(!S)return null;
  var gl=S.gl,sw=work.width,sh=work.height;
  if(Math.max(sw,sh,W,H)>S.max)return null;
  var texs=[],fbs=[];
  try{
    /* 1) raddrizzamento nella texture A (W×H): riga 0 in alto = y di clip +1 */
    var src=glTex(gl,work,sw,sh,true);texs.push(src);
    var A=glTex(gl,null,W,H,true);texs.push(A);
    var fA=gl.createFramebuffer();fbs.push(fA);gl.bindFramebuffer(gl.FRAMEBUFFER,fA);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,A,0);
    gl.viewport(0,0,W,H);
    var map=pageMap(q,mids,W,H),GX=48,GY=Math.max(8,Math.round(48*H/W)),pts=[],x,y;
    for(y=0;y<=GY;y++)for(x=0;x<=GX;x++){var X=x/GX*W,Y=y/GY*H,m=map(X,Y);pts.push([X/W*2-1,1-Y/H*2,m[0]/sw,m[1]/sh])}
    var tri=new Float32Array(GX*GY*24),k=0;
    function put(p){tri[k++]=p[0];tri[k++]=p[1];tri[k++]=p[2];tri[k++]=p[3]}
    for(y=0;y<GY;y++)for(x=0;x<GX;x++){var a=pts[y*(GX+1)+x],b=pts[y*(GX+1)+x+1],c2=pts[(y+1)*(GX+1)+x],d=pts[(y+1)*(GX+1)+x+1];put(a);put(b);put(c2);put(c2);put(b);put(d)}
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,src);gl.useProgram(S.copy);gl.uniform1i(gl.getUniformLocation(S.copy,"t"),0);
    glDraw(S,S.copy,tri);
    /* 2) copia piccola (lato lungo ≈ 1/4) per luce del foglio e livelli, letta sulla CPU */
    var kq=Math.min(1,600/Math.max(W,H)),w2=Math.max(8,Math.round(W*kq)),h2=Math.max(8,Math.round(H*kq));
    var B=glTex(gl,null,w2,h2,true);texs.push(B);
    var fB=gl.createFramebuffer();fbs.push(fB);gl.bindFramebuffer(gl.FRAMEBUFFER,fB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,B,0);
    gl.viewport(0,0,w2,h2);gl.bindTexture(gl.TEXTURE_2D,A);glDraw(S,S.copy,QUAD);
    var sm=new Uint8Array(w2*h2*4);gl.readPixels(0,0,w2,h2,gl.RGBA,gl.UNSIGNED_BYTE,sm);
    /* readPixels parte dal basso: si gira la copia per avere la riga 0 in alto, come la pagina */
    var row=w2*4,flip=new Uint8Array(sm.length);for(y=0;y<h2;y++)flip.set(sm.subarray((h2-1-y)*row,(h2-y)*row),y*row);sm=flip;
    var mode=style==="photo"?0:style==="bw"?2:1,lo=[0,0,0],hi=[255,255,255],low=0,BG=null,i,n2=w2*h2;
    if(mode===0){
      var hs=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];
      for(i=0;i<n2*4;i+=4){hs[0][sm[i]]++;hs[1][sm[i+1]]++;hs[2][sm[i+2]]++}
      for(var ch=0;ch<3;ch++){lo[ch]=percentile(hs[ch],n2,.005);hi[ch]=Math.max(lo[ch]+1,percentile(hs[ch],n2,.995))}
    }else{
      /* riquadri di 16 pixel della pagina = 16·kq pixel della copia; massimo per luminosità, allargato e sfumato come in enhance */
      var T=16*kq,bw=Math.ceil(w2/T),bh=Math.ceil(h2/T),bgs=[0,1,2].map(function(){return new Float32Array(bw*bh)}),tmp=new Float32Array(bw*bh);
      for(var by=0;by<bh;by++)for(var bx=0;bx<bw;bx++){
        var mr=0,mg=0,mb=0,ml=-1;
        for(var yy=Math.floor(by*T);yy<Math.min(h2,Math.ceil(by*T+T));yy++)for(var xx=Math.floor(bx*T);xx<Math.min(w2,Math.ceil(bx*T+T));xx++){
          var kk=(yy*w2+xx)*4,lv=sm[kk]*.3+sm[kk+1]*.59+sm[kk+2]*.11;if(lv>ml){ml=lv;mr=sm[kk];mg=sm[kk+1];mb=sm[kk+2]}
        }
        var j0=by*bw+bx;bgs[0][j0]=mr;bgs[1][j0]=mg;bgs[2][j0]=mb;
      }
      function pass(srcA,dst,dx,dy,r,useMax){
        for(var y3=0;y3<bh;y3++)for(var x3=0;x3<bw;x3++){
          var acc=0,cnt=0;
          for(var s3=-r;s3<=r;s3++){var X3=x3+dx*s3,Y3=y3+dy*s3;if(X3<0||Y3<0||X3>=bw||Y3>=bh)continue;var vv=srcA[Y3*bw+X3];if(useMax){if(vv>acc)acc=vv}else{acc+=vv;cnt++}}
          dst[y3*bw+x3]=useMax?acc:acc/cnt;
        }
      }
      bgs.forEach(function(bg){pass(bg,tmp,1,0,2,true);pass(tmp,bg,0,1,2,true);for(var it2=0;it2<2;it2++){pass(bg,tmp,1,0,3,false);pass(tmp,bg,0,1,3,false)}});
      /* la texture parte dal basso: le righe dei riquadri vanno caricate dall'ultima alla prima */
      BG=new Uint8Array(bw*bh*4);
      for(var ty=0;ty<bh;ty++)for(var tx=0;tx<bw;tx++){var si=(bh-1-ty)*bw+tx,di=(ty*bw+tx)*4;BG[di]=Math.min(255,bgs[0][si]);BG[di+1]=Math.min(255,bgs[1][si]);BG[di+2]=Math.min(255,bgs[2][si]);BG[di+3]=255}
      /* livelli: istogramma della copia già divisa per la luce */
      var hist=new Uint32Array(256);
      for(y=0;y<h2;y++){var gy=Math.min(bh-1.001,Math.max(0,y/T-.5)),y0=gy|0,fy=gy-y0;
        for(x=0;x<w2;x++){var gx=Math.min(bw-1.001,Math.max(0,x/T-.5)),x0=gx|0,fx=gx-x0,jj=y0*bw+x0,o2=(y*w2+x)*4,dv=[0,0,0];
          for(var c3=0;c3<3;c3++){var bgc=bgs[c3],bb=(bgc[jj]*(1-fx)+bgc[jj+1]*fx)*(1-fy)+(bgc[jj+bw]*(1-fx)+bgc[jj+bw+1]*fx)*fy;dv[c3]=Math.min(255,sm[o2+c3]*248/Math.max(bb,40))}
          hist[(dv[0]*.3+dv[1]*.59+dv[2]*.11)|0]++}}
      low=Math.min(120,percentile(hist,n2,.015));
      var bgT=glTex(gl,BG,bw,bh,true);texs.push(bgT);
    }
    /* 3) pulizia sulla pagina intera, dritta nella tela WebGL, poi copiata in una tela 2D */
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);S.c.width=W;S.c.height=H;gl.viewport(0,0,W,H);
    gl.useProgram(S.fin);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,A);gl.uniform1i(gl.getUniformLocation(S.fin,"t"),0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,BG?texs[texs.length-1]:A);gl.uniform1i(gl.getUniformLocation(S.fin,"bg"),1);
    gl.uniform1i(gl.getUniformLocation(S.fin,"mode"),mode);
    gl.uniform3f(gl.getUniformLocation(S.fin,"lo"),lo[0],lo[1],lo[2]);gl.uniform3f(gl.getUniformLocation(S.fin,"hi"),hi[0],hi[1],hi[2]);
    gl.uniform1f(gl.getUniformLocation(S.fin,"low"),low);
    gl.activeTexture(gl.TEXTURE0);
    /* nella texture A la riga in alto della pagina sta a v=1, come in alto nella tela: quadrato diritto */
    glDraw(S,S.fin,QUAD);
    var out=document.createElement("canvas");out.width=W;out.height=H;out.getContext("2d").drawImage(S.c,0,0);
    if(gl.getError()!==gl.NO_ERROR)throw new Error("gl");
    return out;
  }catch(e){return null}
  finally{texs.forEach(function(t){gl.deleteTexture(t)});fbs.forEach(function(f){gl.deleteFramebuffer(f)});gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
}
/* raddrizza: per ogni pixel d'uscita prende il punto corrispondente della foto (bilineare), a blocchi di righe */
async function warp(work,q,mids,W,H){
  var sw=work.width,sh=work.height,sd=work.getContext("2d").getImageData(0,0,sw,sh).data;
  var out=new ImageData(W,H),od=out.data,map=pageMap(q,mids,W,H),t0=Date.now();
  for(var y=0;y<H;y++){
    for(var x=0;x<W;x++){
      var p=map(x,y),u=p[0],v=p[1];
      if(u<0)u=0;if(v<0)v=0;if(u>sw-1.001)u=sw-1.001;if(v>sh-1.001)v=sh-1.001;
      var x0=u|0,y0=v|0,fx=u-x0,fy=v-y0,i00=(y0*sw+x0)*4,i10=i00+4,i01=i00+sw*4,i11=i01+4,o=(y*W+x)*4;
      for(var ch=0;ch<3;ch++){
        var a=sd[i00+ch]+(sd[i10+ch]-sd[i00+ch])*fx,b=sd[i01+ch]+(sd[i11+ch]-sd[i01+ch])*fx;
        od[o+ch]=a+(b-a)*fy;
      }
      od[o+3]=255;
    }
    if(Date.now()-t0>40){await new Promise(function(r){setTimeout(r,0)});t0=Date.now()}
  }
  return out;
}
/* trova il foglio nella foto (R-SCN-09/10): maschera dei pixel chiari e poco saturi (soglia di Otsu),
   pulizia, componente più grande; angoli agli estremi; maniglie dei lati sul bordo della maschera.
   Restituisce {q, mids} in coordinate della foto, oppure null se non è convincente. */
/* bordi proposti (R-SCN-09): prima con la soglia che separa chiaro e scuro; se il foglio non si stacca (sfondo chiaro o colorato
   che si unisce al foglio), di nuovo cercando la separazione solo tra le parti chiare (R-SCN-28) */
/* ---- bordi dai lati dritti (R-SCN-31): pendenza del colore, rette più forti (Hough), quadrilateri formati da due rette
   «orizzontali» e due «verticali»; ogni quadrilatero vale quanto contorno vero ha sotto i lati, meno quello che manca.
   Lo stesso punteggio decide tra questi e quelli trovati con la maschera chiaro/scuro. */
var edgeCache=new WeakMap();
function edgeGrad(work){
  var G=edgeCache.get(work);if(G)return G;
  var E=CFG.scan.edges,k=Math.min(1,E.size/Math.max(work.width,work.height)),w=Math.max(16,Math.round(work.width*k)),h=Math.max(16,Math.round(work.height*k)),n=w*h,i,x,y,c;
  var cv=document.createElement("canvas");cv.width=w;cv.height=h;var g=cv.getContext("2d",{willReadFrequently:true});g.drawImage(work,0,0,w,h);
  var d=g.getImageData(0,0,w,h).data;cv.width=cv.height=0;
  /* tre canali sfumati (due medie 3×3), poi Sobel: per ogni pixel la pendenza del canale che cambia di più */
  var ch=[0,1,2].map(function(c){var a=new Float32Array(n);for(var j=0;j<n;j++)a[j]=d[j*4+c];return shBlur(a,w,h,1)});
  var gx=new Float32Array(n),gy=new Float32Array(n);
  for(y=1;y<h-1;y++)for(x=1;x<w-1;x++){i=y*w+x;var bm=-1;
    for(c=0;c<3;c++){var a=ch[c];
      var sx=(a[i-w+1]+2*a[i+1]+a[i+w+1]-a[i-w-1]-2*a[i-1]-a[i+w-1])/8,sy=(a[i+w-1]+2*a[i+w]+a[i+w+1]-a[i-w-1]-2*a[i-w]-a[i-w+1])/8,m=sx*sx+sy*sy;
      if(m>bm){bm=m;gx[i]=sx;gy[i]=sy}}}
  var lum=new Float32Array(n),sat=new Uint8Array(n);for(i=0;i<n;i++){lum[i]=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11;sat[i]=Math.max(d[i*4],d[i*4+1],d[i*4+2])-Math.min(d[i*4],d[i*4+1],d[i*4+2])}
  G={w:w,h:h,k:k,gx:gx,gy:gy,lum:lum,sat:sat};edgeCache.set(work,G);
  return G;
}
/* rette forti: ogni pixel di contorno vota solo per le direzioni vicine alla sua (±2°), pesato dalla pendenza */
function edgeLines(G){
  var E=CFG.scan.edges,w=G.w,h=G.h,n=w*h,i,NT=180,D=Math.ceil(Math.hypot(w,h))+1,R=2*D+1,acc=new Float32Array(NT*R),mag=new Float32Array(n);
  for(i=0;i<n;i++)mag[i]=Math.hypot(G.gx[i],G.gy[i]);
  var srt=Array.prototype.slice.call(mag).sort(function(a,b){return a-b}),thr=Math.max(E.minGrad,srt[Math.floor(n*.9)]);
  var cs=new Float32Array(NT),sn=new Float32Array(NT);for(var t=0;t<NT;t++){cs[t]=Math.cos(t*Math.PI/NT);sn[t]=Math.sin(t*Math.PI/NT)}
  for(i=0;i<n;i++){if(mag[i]<=thr)continue;var x=i%w,y=(i/w)|0,a=Math.atan2(G.gy[i],G.gx[i]);if(a<0)a+=Math.PI;
    var t0=Math.round(a/Math.PI*NT),wt=Math.min(60,mag[i]);
    for(var dt=-2;dt<=2;dt++){var ti=((t0+dt)%NT+NT)%NT,r=Math.round(x*cs[ti]+y*sn[ti])+D;acc[ti*R+r]+=wt}}
  var out=[];
  for(var l=0;l<E.lines;l++){
    var bi=0,bv=0;for(i=0;i<acc.length;i++)if(acc[i]>bv){bv=acc[i];bi=i}
    if(bv<=0)break;var T=(bi/R)|0,rr=bi%R;out.push({t:T*Math.PI/NT,r:rr-D});
    for(dt=-4;dt<=4;dt++){var tt=((T+dt)%NT+NT)%NT,o=tt*R;for(var r2=Math.max(0,rr-8);r2<=Math.min(R-1,rr+8);r2++)acc[o+r2]=0}
  }
  return out;
}
/* punteggio di un quadrilatero (coordinate della copia piccola): per ogni lato, i punti con una pendenza di traverso al lato
   (entro ±1,5 px) contano come contorno; i punti fuori dalla foto non contano né in un senso né nell'altro */
function quadScoreG(G,Q,M){
  var w=G.w,h=G.h,cx=(Q[0][0]+Q[1][0]+Q[2][0]+Q[3][0])/4,cy=(Q[0][1]+Q[1][1]+Q[2][1]+Q[3][1])/4,E=CFG.scan.edges,score=0,sup=[],cont=[];
  function L0(x,y){x=Math.round(x);y=Math.round(y);return x<0||y<0||x>=w||y>=h?-1:G.lum[y*w+x]}
  /* livello della carta: i punti appena dentro i lati */
  var inner=[];
  for(var j=0;j<4;j++){var a=Q[j],b=Q[(j+1)%4];for(var s=1;s<12;s++){var t=s/12,px=a[0]+(b[0]-a[0])*t,py=a[1]+(b[1]-a[1])*t,dx=cx-px,dy=cy-py,dl=Math.hypot(dx,dy)||1,v=L0(px+dx/dl*6,py+dy/dl*6);if(v>=0)inner.push(v)}}
  inner.sort(function(x,y){return x-y});var paper=inner.length?inner[Math.floor(inner.length*.75)]:255,reach=Math.max(6,Math.min(w,h)*E.contReach);
  var map=M?pageMap(Q,M,1,1):null;
  function sidePt(j,t){return j===0?map(t,0):j===1?map(1,t):j===2?map(1-t,1):map(0,1-t)}
  for(j=0;j<4;j++){
    a=Q[j];b=Q[(j+1)%4];var L=dist(a,b);if(L<8)return {s:-1e9,sup:[0,0,0,0],cont:[0,0,0,0]};
    var ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L,nx=-uy,ny=ux,pos=0,neg=0,rid=0,tot=0,cn=0;
    if((cx-a[0])*nx+(cy-a[1])*ny>0){nx=-nx;ny=-ny}
    for(s=0;s<48;s++){t=.03+.94*s/47;px=a[0]+ux*t*L;py=a[1]+uy*t*L;
      /* lati curvi (maniglie dei lati): il punto e la direzione si prendono sulla curva */
      if(map){var c0=sidePt(j,t),c1=sidePt(j,Math.min(1,t+.01)),c2=sidePt(j,Math.max(0,t-.01)),tl=dist(c1,c2)||1;px=c0[0];py=c0[1];ux=(c1[0]-c2[0])/tl;uy=(c1[1]-c2[1])/tl;nx=-uy;ny=ux;if((cx-px)*nx+(cy-py)*ny>0){nx=-nx;ny=-ny}}
      if(px<1||py<1||px>w-2||py>h-2)continue;tot++;var bp=0,bn=0;
      for(var o=-1.5;o<=1.5;o+=.75){var X=Math.round(px+nx*o),Y=Math.round(py+ny*o);if(X<1||Y<1||X>w-2||Y>h-2)continue;var ii=Y*w+X,gx=G.gx[ii],gy=G.gy[ii];
        var gs=gx*nx+gy*ny,gt=Math.abs(gx*ux+gy*uy);if(Math.abs(gs)>1.8*gt){if(gs>bp)bp=gs;if(-gs>bn)bn=-gs}}
      /* un bordo vero passa sempre dallo stesso chiaro allo stesso scuro; una riga di testo dà pendenze nei due versi.
         Una costa sottile e chiara (lo spigolo di una scatola) dà i due versi forti insieme e vale mezzo */
      if(bp>2*E.minGrad&&bn>2*E.minGrad)rid++;else if(bp>E.minGrad&&bp>=bn)pos++;else if(bn>E.minGrad)neg++;
      /* appena fuori dal lato: carta chiara quasi come dentro (anche un po' in ombra) con dei tratti scuri = il foglio continua (piega, riquadro stampato) */
      var mx=-1,mn=999,sq=false;for(o=3;o<=reach;o+=2){var Xo=Math.round(px+nx*o),Yo=Math.round(py+ny*o),v=L0(Xo,Yo);if(v<0)continue;if(G.sat[Yo*w+Xo]>=E.growSat)sq=true;if(v>mx)mx=v;if(v<mn)mn=v}
      /* e subito fuori (3–5 px) è ancora carta: un bordo vero ha lì lo sfondo */
      var near=-1;for(o=3;o<=5;o++){var Xn=Math.round(px+nx*o),Yn=Math.round(py+ny*o),vn=L0(Xn,Yn);if(vn>=0&&G.sat[Yn*w+Xn]<E.growSat&&vn>near)near=vn}
      if(!sq&&near>=paper-E.contPaper&&mx>=paper-E.contPaper&&mn<mx-E.contInk)cn++;
    }
    var f=tot?(Math.max(pos,neg)+rid*.5)/tot:0,seen=L*tot/48,c=tot?cn/tot:0;sup.push(tot>=12?f:-1);cont.push(Math.round(c*100)/100);
    score+=seen*(f-(1-f)*E.miss-c*E.cont)-(L-seen)*E.unseen;
  }
  return {s:score,sup:sup,cont:cont};
}
function edgeQuad(G){
  var E=CFG.scan.edges,w=G.w,h=G.h,L=edgeLines(G),hz=[],vt=[];
  /* anche i bordi della foto, appena fuori: un foglio che esce dall'inquadratura ha lì il suo lato */
  L=L.concat([{t:Math.PI/2,r:-1},{t:Math.PI/2,r:h},{t:0,r:-1},{t:0,r:w}]);
  L.forEach(function(l){if(Math.abs(Math.sin(l.t))>.6)hz.push(l);if(Math.abs(Math.cos(l.t))>.6)vt.push(l)});
  function X(a,b){var det=Math.cos(a.t)*Math.sin(b.t)-Math.sin(a.t)*Math.cos(b.t);if(Math.abs(det)<1e-3)return null;
    return [(a.r*Math.sin(b.t)-b.r*Math.sin(a.t))/det,(b.r*Math.cos(a.t)-a.r*Math.cos(b.t))/det]}
  var top=[],ox=w*E.outside,oy=h*E.outside;
  for(var a=0;a<hz.length;a++)for(var b=a+1;b<hz.length;b++)for(var c=0;c<vt.length;c++)for(var d=c+1;d<vt.length;d++){
    var Q=[X(hz[a],vt[c]),X(hz[a],vt[d]),X(hz[b],vt[d]),X(hz[b],vt[c])];
    if(Q.some(function(p){return !p||p[0]<-ox||p[1]<-oy||p[0]>w+ox||p[1]>h+oy}))continue;
    Q=quadOrder(Q);if(!Q||quadArea(Q)<w*h*E.minArea)continue;
    var sc=quadScoreG(G,Q);top.push({s:sc.s,q:Q});
  }
  top.sort(function(x,y){return y.s-x.s});
  /* i migliori, diversi tra loro (angoli lontani almeno 4% della foto) */
  var out=[];top.forEach(function(c){if(out.length<E.keep&&out.every(function(o){return o.q.some(function(p,i){return dist(p,c.q[i])>Math.max(w,h)*.04})}))out.push(c)});
  return out;
}
/* la striscia tra il lato j di Q e quello di T è carta come l'interno di Q (chiara e senza colore in almeno 80% dei punti)? */
function paperBand(G,Q,T,j){
  var E=CFG.scan.edges,w=G.w,h=G.h,a=Q[j],b=Q[(j+1)%4],A=T[j],B=T[(j+1)%4],cx=(Q[0][0]+Q[1][0]+Q[2][0]+Q[3][0])/4,cy=(Q[0][1]+Q[1][1]+Q[2][1]+Q[3][1])/4,inner=[],ok=0,n=0;
  function at(x,y){x=Math.round(x);y=Math.round(y);return x<0||y<0||x>=w||y>=h?-1:y*w+x}
  for(var s=1;s<12;s++){var px=a[0]+(b[0]-a[0])*s/12,py=a[1]+(b[1]-a[1])*s/12,dx=cx-px,dy=cy-py,dl=Math.hypot(dx,dy)||1,i=at(px+dx/dl*6,py+dy/dl*6);if(i>=0)inner.push(G.lum[i])}
  inner.sort(function(x,y){return x-y});var paper=inner.length?inner[Math.floor(inner.length*.75)]:255;
  for(s=1;s<12;s++)for(var u=1;u<4;u++){var t=s/12,v=u/4,P=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],R=[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t];
    var k=at(P[0]+(R[0]-P[0])*v,P[1]+(R[1]-P[1])*v);if(k<0)continue;n++;if(G.lum[k]>=paper-E.contPaper&&G.sat[k]<E.paperSat)ok++}
  return n>0&&ok>=n*.8&&inkBand(G,Q,T,j,paper);
}
/* nella striscia ci sono scritte (il foglio continua davvero, non è un tavolo chiaro)? */
function inkBand(G,Q,T,j,paper,frac){
  var E=CFG.scan.edges,w=G.w,h=G.h,a=Q[j],b=Q[(j+1)%4],A=T[j],B=T[(j+1)%4],cols=0,ink=0;
  for(var s=1;s<24;s++){var t=s/24,P=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],R=[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t],L=dist(P,R),mx=-1,mn=999;
    for(var q=0;q<=L;q+=1.5){var x=Math.round(P[0]+(R[0]-P[0])*q/L),y=Math.round(P[1]+(R[1]-P[1])*q/L);if(x<0||y<0||x>=w||y>=h)continue;var v=G.lum[y*w+x];if(v>mx)mx=v;if(v<mn)mn=v}
    if(mx>=0){cols++;if(mn<mx-E.contInk)ink++}}
  return cols>0&&ink>=cols*(frac||.2);
}
/* ogni lato si sposta (in dentro o in fuori, un po' inclinato) dove il punteggio del quadrilatero sale: trova anche i lati deboli
   che non erano tra le rette più forti */
function quadSides(G,Q){
  var E=CFG.scan.edges,w=G.w,h=G.h,cur=Q.map(function(p){return p.slice()}),sc=quadScoreG(G,cur).s;
  function X(p1,p2,p3,p4){var d=(p1[0]-p2[0])*(p3[1]-p4[1])-(p1[1]-p2[1])*(p3[0]-p4[0]);if(Math.abs(d)<1e-6)return null;
    var t=((p1[0]-p3[0])*(p3[1]-p4[1])-(p1[1]-p3[1])*(p3[0]-p4[0]))/d;return [p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]}
  for(var round=0;round<2;round++)for(var j=0;j<4;j++){
    var a=cur[j],b=cur[(j+1)%4],pa=cur[(j+3)%4],nb=cur[(j+2)%4],L=dist(a,b),nx=-(b[1]-a[1])/L,ny=(b[0]-a[0])/L;
    var D=Math.min(dist(a,pa),dist(b,nb))*E.sideRange,best=null;
    for(var d=-D;d<=D;d+=1.5)for(var e=-E.sideTilt;e<=E.sideTilt;e+=2){
      var A=X([a[0]+nx*(d+e),a[1]+ny*(d+e)],[b[0]+nx*(d-e),b[1]+ny*(d-e)],pa,a),B=X([a[0]+nx*(d+e),a[1]+ny*(d+e)],[b[0]+nx*(d-e),b[1]+ny*(d-e)],nb,b);if(!A||!B)continue;
      var T=cur.slice();T[j]=A;T[(j+1)%4]=B;
      /* in fuori solo su carta con scritte (la striscia aggiunta è chiara e senza colore come dentro);
         in dentro solo se la striscia lasciata fuori non è piena di scritte (non si taglia il testo) */
      if(quadArea(T)>quadArea(cur)?!paperBand(G,cur,T,j):inkBand(G,T,cur,j,0,E.cutInk))continue;
      if(T.some(function(p){return p[0]<-w*E.outside||p[1]<-h*E.outside||p[0]>w*(1+E.outside)||p[1]>h*(1+E.outside)}))continue;
      if(!quadOrder(T)||quadArea(T)<w*h*E.minArea)continue;
      var v=quadScoreG(G,T).s;if(v>sc+1e-6&&(!best||v>best.v))best={v:v,T:T};
    }
    if(best){sc=best.v;cur=best.T}
  }
  return {q:cur,s:sc};
}
function quadArea(P){var a=0;for(var j=0;j<4;j++){var p=P[j],q2=P[(j+1)%4];a+=p[0]*q2[1]-q2[0]*p[1]}return Math.abs(a)/2}
/* angoli in ordine: alto a sinistra, poi in senso orario; null se il quadrilatero non è convesso */
function quadOrder(P){
  var cx=(P[0][0]+P[1][0]+P[2][0]+P[3][0])/4,cy=(P[0][1]+P[1][1]+P[2][1]+P[3][1])/4;
  P=P.slice().sort(function(a,b){return Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx)});
  var st=0;for(var j=1;j<4;j++)if(P[j][0]+P[j][1]<P[st][0]+P[st][1])st=j;
  P=[P[st],P[(st+1)%4],P[(st+2)%4],P[(st+3)%4]];
  for(j=0;j<4;j++){var a=P[j],b=P[(j+1)%4],c=P[(j+2)%4];if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<=0)return null}
  return P;
}
/* curvatura dei lati di un quadrilatero trovato dalle rette: al centro di ogni lato, il contorno più forte entro ±6% */
function edgeMids(G,Q){
  var pm=projMids(Q),cx=(Q[0][0]+Q[1][0]+Q[2][0]+Q[3][0])/4,cy=(Q[0][1]+Q[1][1]+Q[2][1]+Q[3][1])/4,sides=[[0,1],[1,2],[3,2],[0,3]];
  return pm.map(function(M,j){
    var a=Q[sides[j][0]],b=Q[sides[j][1]],L=dist(a,b),ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L,nx=-uy,ny=ux,R=Math.round(L*.06),offs=[];
    for(var s=-4;s<=4;s++){var px=M[0]+ux*s*L*.02,py=M[1]+uy*s*L*.02,bo=null,bv=CFG.scan.edges.minGrad*1.5;
      for(var o=-R;o<=R;o++){var X=Math.round(px+nx*o),Y=Math.round(py+ny*o);if(X<1||Y<1||X>G.w-2||Y>G.h-2)continue;var ii=Y*G.w+X,gn=Math.abs(G.gx[ii]*nx+G.gy[ii]*ny),gt=Math.abs(G.gx[ii]*ux+G.gy[ii]*uy);
        if(gn>1.8*gt&&gn>bv*(1+Math.abs(o)/R*.5)){bv=gn;bo=o}}
      if(bo!==null)offs.push(bo)}
    if(offs.length<6)return M;
    offs.sort(function(x,y){return x-y});var med=offs[offs.length>>1],agree=offs.filter(function(o){return Math.abs(o-med)<=1.5}).length;
    return agree>=6&&Math.abs(med)>=Math.max(2,L*.012)?[M[0]+nx*med,M[1]+ny*med]:M;
  });
}
/* ritocco: ogni angolo si sposta di un passo (2 px, poi 1) finché il contorno sotto i lati aumenta */
function quadPolish(G,Q){
  var cur=Q.map(function(p){return p.slice()}),sc=quadScoreG(G,cur).s;
  [2,1].forEach(function(st){
    for(var it=0;it<8;it++){var moved=false;
      for(var i=0;i<4;i++)for(var dx=-st;dx<=st;dx+=st)for(var dy=-st;dy<=st;dy+=st){if(!dx&&!dy)continue;
        var tr=cur.map(function(p){return p.slice()});tr[i][0]+=dx;tr[i][1]+=dy;var v=quadScoreG(G,tr).s;if(v>sc+1e-6){sc=v;cur=tr;moved=true}}
      if(!moved)break}});
  return {q:cur,s:sc};
}
/* un lato senza contorno (fuori dalla foto o su un'altra carta, come la piega di un biglietto aperto): se il contorno di un lato
   vicino finisce prima dell'angolo, lì c'è l'angolo vero; il lato passa per quel punto, parallelo al lato opposto */
function quadTrim(G,Q){
  var E=CFG.scan.edges,w=G.w,h=G.h;Q=Q.map(function(p){return p.slice()});
  var cx=(Q[0][0]+Q[1][0]+Q[2][0]+Q[3][0])/4,cy=(Q[0][1]+Q[1][1]+Q[2][1]+Q[3][1])/4;
  function on(a,b,t){var L=dist(a,b),ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L,nx=-uy,ny=ux,px=a[0]+(b[0]-a[0])*t,py=a[1]+(b[1]-a[1])*t;
    if(px<1||py<1||px>w-2||py>h-2)return -1;var bp=0,bn=0;
    for(var o=-1.5;o<=1.5;o+=.75){var X=Math.round(px+nx*o),Y=Math.round(py+ny*o);if(X<1||Y<1||X>w-2||Y>h-2)continue;var i=Y*w+X,gs=G.gx[i]*nx+G.gy[i]*ny,gt=Math.abs(G.gx[i]*ux+G.gy[i]*uy);if(Math.abs(gs)>1.8*gt){if(gs>bp)bp=gs;if(-gs>bn)bn=-gs}}
    return bp>E.minGrad||bn>E.minGrad?1:0}
  function X(p1,p2,p3,p4){var d=(p1[0]-p2[0])*(p3[1]-p4[1])-(p1[1]-p2[1])*(p3[0]-p4[0]);if(Math.abs(d)<1e-6)return null;
    var t=((p1[0]-p3[0])*(p3[1]-p4[1])-(p1[1]-p3[1])*(p3[0]-p4[0]))/d;return [p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]}
  var sc=quadScoreG(G,Q).sup;
  for(var j=0;j<4;j++){
    if(sc[j]>=E.trimFrom)continue;
    var c0=Q[j],c1=Q[(j+1)%4],o0=Q[(j+3)%4],o1=Q[(j+2)%4],best=null;
    /* i due lati vicini: da o0 verso c0 e da o1 verso c1 */
    [[o0,c0],[o1,c1]].forEach(function(sd){
      var N=60,vals=[];for(var s=0;s<=N;s++)vals.push(on(sd[0],sd[1],s/N));
      var last=-1;for(s=0;s<=N;s++)if(vals[s]===1)last=s;
      if(last<0||last>N*(1-E.trimMin))return;
      var tail=vals.slice(last+1).filter(function(v){return v>=0}),hit=tail.filter(function(v){return v===1}).length;
      var head=vals.slice(0,last+1).filter(function(v){return v>=0}),hh=head.filter(function(v){return v===1}).length;
      if(tail.length<N*E.trimMin*.5||hit>tail.length*.2||hh<head.length*.7)return;
      var P=[sd[0][0]+(sd[1][0]-sd[0][0])*last/N,sd[0][1]+(sd[1][1]-sd[0][1])*last/N],cut=1-last/N;
      if(!best||cut>best.cut)best={P:P,cut:cut};
    });
    if(!best)continue;
    /* parallelo al lato opposto (o0–o1); se così taglierebbe delle scritte, ruota in fuori attorno al punto finché non le taglia più */
    var dx=o1[0]-o0[0],dy=o1[1]-o0[1],T=null;
    for(var ang=0;ang<=E.trimTurn&&!T;ang+=2)for(var sg=-1;sg<=1&&!T;sg+=2){if(!ang&&sg>0)continue;
      var r=sg*ang*Math.PI/180,rx=dx*Math.cos(r)-dy*Math.sin(r),ry=dx*Math.sin(r)+dy*Math.cos(r),P2=[best.P[0]+rx,best.P[1]+ry];
      var A=X(best.P,P2,o0,c0),B=X(best.P,P2,o1,c1);if(!A||!B)continue;
      var Tt=Q.slice();Tt[j]=A;Tt[(j+1)%4]=B;if(!quadOrder(Tt)||quadArea(Tt)>=quadArea(Q))continue;
      if(!inkBand(G,Tt,Q,j,0,E.trimInk))T=Tt}
    if(!T)continue;
    Q=T;
  }
  return Q;
}
/* ogni lato spostato di d px verso l'interno */
function quadInset(Q,d){
  if(!d)return Q;var cx=(Q[0][0]+Q[1][0]+Q[2][0]+Q[3][0])/4,cy=(Q[0][1]+Q[1][1]+Q[2][1]+Q[3][1])/4,Ls=[];
  for(var j=0;j<4;j++){var a=Q[j],b=Q[(j+1)%4],L=dist(a,b),nx=-(b[1]-a[1])/L,ny=(b[0]-a[0])/L;if((cx-a[0])*nx+(cy-a[1])*ny<0){nx=-nx;ny=-ny}
    Ls.push([[a[0]+nx*d,a[1]+ny*d],[b[0]+nx*d,b[1]+ny*d]])}
  function X(p1,p2,p3,p4){var dd=(p1[0]-p2[0])*(p3[1]-p4[1])-(p1[1]-p2[1])*(p3[0]-p4[0]);if(Math.abs(dd)<1e-6)return null;
    var t=((p1[0]-p3[0])*(p3[1]-p4[1])-(p1[1]-p3[1])*(p3[0]-p4[0]))/dd;return [p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]}
  var out=[];for(j=0;j<4;j++){var c=X(Ls[(j+3)%4][0],Ls[(j+3)%4][1],Ls[j][0],Ls[j][1]);if(!c)return Q;out.push(c)}
  return out;
}
/* copertine con una cornice colorata: il contorno più forte è quello tra la cornice e l'interno; se appena fuori, parallelo,
   c'è un altro lato netto e la striscia in mezzo è colorata, il lato vero è quello esterno */
function quadOuter(G,Q){
  var E=CFG.scan.edges,w=G.w,h=G.h;Q=Q.map(function(p){return p.slice()});
  function X(p1,p2,p3,p4){var d=(p1[0]-p2[0])*(p3[1]-p4[1])-(p1[1]-p2[1])*(p3[0]-p4[0]);if(Math.abs(d)<1e-6)return null;
    var t=((p1[0]-p3[0])*(p3[1]-p4[1])-(p1[1]-p3[1])*(p3[0]-p4[0]))/d;return [p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]}
  for(var j=0;j<4;j++){
    var a=Q[j],b=Q[(j+1)%4],pa=Q[(j+3)%4],nb=Q[(j+2)%4],L=dist(a,b),cx=(Q[0][0]+Q[1][0]+Q[2][0]+Q[3][0])/4,cy=(Q[0][1]+Q[1][1]+Q[2][1]+Q[3][1])/4;
    var nx=-(b[1]-a[1])/L,ny=(b[0]-a[0])/L;if((cx-a[0])*nx+(cy-a[1])*ny>0){nx=-nx;ny=-ny}
    var depth=Math.min(dist(a,pa),dist(b,nb)),best=null;
    for(var d=3;d<=depth*E.frame;d+=1)for(var e=-3;e<=3;e+=1.5){
      var A=X([a[0]+nx*(d+e),a[1]+ny*(d+e)],[b[0]+nx*(d-e),b[1]+ny*(d-e)],pa,a),B=X([a[0]+nx*(d+e),a[1]+ny*(d+e)],[b[0]+nx*(d-e),b[1]+ny*(d-e)],nb,b);if(!A||!B)continue;
      var T=Q.slice();T[j]=A;T[(j+1)%4]=B;var r=quadScoreG(G,T);if(r.sup[j]<E.frameSup)continue;
      /* striscia in mezzo: colorata */
      var col=0,n=0;for(var s=1;s<16;s++)for(var u=1;u<4;u++){var t=s/16,P=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],R=[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t];
        var x=Math.round(P[0]+(R[0]-P[0])*u/4),y=Math.round(P[1]+(R[1]-P[1])*u/4);if(x<0||y<0||x>=w||y>=h)continue;n++;if(G.sat[y*w+x]>=E.frameSat)col++}
      if(n&&col>=n*.6&&(!best||r.sup[j]>best.f))best={f:r.sup[j],T:T};
    }
    if(best)Q=best.T
  }
  return Q;
}
function inQuad(Q,p){for(var j=0;j<4;j++){var a=Q[j],b=Q[(j+1)%4];if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])<0)return false}return true}
/* i bordi proposti, poi ogni lato appoggiato al bordo vero della carta (R-SCN-35) */
function detectPage(work){
  var r=detectPage0(work);
  if(r)try{var f=sideFit(work,r.q,r.mids);if(f){if(PERF)(window.__fit=window.__fit||[]).push({from:r.q.map(function(p){return p.map(Math.round)}),to:f.q.map(function(p){return p.map(Math.round)}),moved:f.moved});r.q=f.q;r.mids=f.mids}}catch(e){}
  return r;
}
/* lati sul bordo vero (R-SCN-35): lungo ogni lato, n punti; per ognuno, cercando lungo la perpendicolare, il passaggio più netto
   da carta (dentro, chiara e senza colore) a sfondo (fuori). Con abbastanza punti validi, il lato segue una parabola su quei punti
   (per una carta un po' incurvata); gli angoli si spostano con i due lati che vi arrivano */
function sideFit(work,q,mids){
  var F=CFG.scan.fit;if(!F||!F.on)return null;
  var W=work.width,H=work.height,k=Math.min(1,F.size/Math.max(W,H)),w=Math.max(16,Math.round(W*k)),h=Math.max(16,Math.round(H*k)),n=w*h,i;
  var cv=document.createElement("canvas");cv.width=w;cv.height=h;var g=cv.getContext("2d",{willReadFrequently:true});g.drawImage(work,0,0,w,h);
  var d=g.getImageData(0,0,w,h).data;cv.width=cv.height=0;
  var P=new Float32Array(n);for(i=0;i<n;i++){var r=d[i*4],gg=d[i*4+1],b=d[i*4+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);P[i]=r*.3+gg*.59+b*.11-F.sat*(mx-mn)}
  function at(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return NaN;return P[y*w+x]}
  var Q=q.map(function(p){return [p[0]*k,p[1]*k]}),M=(mids||projMids(q)).map(function(p){return [p[0]*k,p[1]*k]});
  var C=[(Q[0][0]+Q[1][0]+Q[2][0]+Q[3][0])/4,(Q[0][1]+Q[1][1]+Q[2][1]+Q[3][1])/4],band=Math.max(4,F.band*Math.max(w,h)),fit=[],moved=0;
  /* il foglio dev'essere carta chiara: la mediana dentro il quadrilatero (un volantino colorato non si tocca) */
  var smp=[];for(var yy=0;yy<h;yy+=4)for(var xx=0;xx<w;xx+=4)if(inQuad(Q,[xx,yy]))smp.push(P[yy*w+xx]);
  smp.sort(function(a,b){return a-b});var paper=smp.length?smp[smp.length>>1]:0;if(paper<F.paper)return null;
  function curve(A,Mm,B,tt){return [A[0]*(1-tt)*(1-2*tt)+4*Mm[0]*tt*(1-tt)+B[0]*tt*(2*tt-1),A[1]*(1-tt)*(1-2*tt)+4*Mm[1]*tt*(1-tt)+B[1]*tt*(2*tt-1)]}
  for(var j=0;j<4;j++){
    var A=Q[j],B=Q[(j+1)%4],Mm=M[j],dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy)||1,nx=dy/L,ny=-dx/L;
    if((Mm[0]-C[0])*nx+(Mm[1]-C[1])*ny<0){nx=-nx;ny=-ny}
    var pts=[];
    for(var s2=0;s2<F.n;s2++){
      var tt=.02+.96*s2/(F.n-1),c=curve(A,Mm,B,tt),best=-1e9,bo=0;
      for(var o=-band;o<=band;o++){
        var inn=0,out=0,ni=0,no=0;
        for(var e=2;e<=8;e++){var v1=at(c[0]+nx*(o-e),c[1]+ny*(o-e)),v2=at(c[0]+nx*(o+e),c[1]+ny*(o+e));if(v1===v1){inn+=v1;ni++}if(v2===v2){out+=v2;no++}}
        if(ni<4)continue;
        /* oltre il margine della foto: lo sfondo non si vede, il foglio può finire lì */
        /* dentro dev'essere carta (chiara e senza colore): i passaggi tra i colori di un volantino non contano */
        if(inn/ni<paper*F.inner)continue;
        var diff=no?inn/ni-out/no:F.step;
        if(diff>best){best=diff;bo=o}
      }
      if(best>=F.step)pts.push([tt,bo]);
    }
    if(pts.length<F.min*F.n){fit.push(null);continue}
    /* parabola sugli spostamenti (minimi quadrati), poi via i punti lontani e di nuovo */
    var cf=null;
    for(var it=0;it<2;it++){
      cf=quadFit(pts);if(!cf)break;
      var res=pts.map(function(p){return Math.abs(p[1]-(cf[0]+cf[1]*p[0]+cf[2]*p[0]*p[0]))}),sr=res.slice().sort(function(a,b){return a-b}),med=sr[sr.length>>1];
      var keep=pts.filter(function(p,ii){return res[ii]<=Math.max(2,3*med)});if(keep.length<F.min*F.n*.8)break;pts=keep;
    }
    if(!cf){fit.push(null);continue}
    /* curvo solo se la parabola segue i punti nettamente meglio della retta: altrimenti agli angoli la curva scappa */
    var ln=quadFit(pts,true),rms=function(cc){return Math.sqrt(pts.reduce(function(sum,p){var e2=p[1]-(cc[0]+cc[1]*p[0]+cc[2]*p[0]*p[0]);return sum+e2*e2},0)/pts.length)};
    if(ln&&(rms(cf)>.85*rms(ln)||Math.abs(cf[2])/4>.015*L))cf=ln;
    /* agli angoli conta il tratto vicino (una carta incurvata piega soprattutto lì): retta sui punti del primo e dell'ultimo terzo */
    var gl=function(cc){return function(x){return cc[0]+cc[1]*x+cc[2]*x*x}}(cf),lo2=pts.filter(function(p){return p[0]<.4}),hi2=pts.filter(function(p){return p[0]>.6});
    var l0=lo2.length>=4?quadFit(lo2,true):null,l1=hi2.length>=4?quadFit(hi2,true):null;
    /* appena dentro il bordo (inset px della copia): niente filo di sfondo */
    var o0=(l0?l0[0]:gl(0))-F.inset,o1=(l1?l1[0]+l1[1]:gl(1))-F.inset;
    fit.push({n:[nx,ny],o:function(g2,a0,a1){return function(x){return x===0?a0:x===1?a1:g2(x)-F.inset}}(gl,o0,o1)});
  }
  if(!fit.some(function(f){return f}))return null;
  var NQ=Q.map(function(p,jj){
    var x=p[0],y=p[1],a=fit[jj],b2=fit[(jj+3)%4];
    if(a){var oa=a.o(0);x+=a.n[0]*oa;y+=a.n[1]*oa}
    if(b2){var ob=b2.o(1);x+=b2.n[0]*ob;y+=b2.n[1]*ob}
    return [x,y];
  });
  var NM=M.map(function(p,jj){
    var f=fit[jj],A2=NQ[jj],B2=NQ[(jj+1)%4],old=projMids([Q[0],Q[1],Q[2],Q[3]])[jj];
    /* la curvatura di prima, più quella trovata ora */
    var bend=[p[0]-(Q[jj][0]+Q[(jj+1)%4][0])/2,p[1]-(Q[jj][1]+Q[(jj+1)%4][1])/2],mid=[(A2[0]+B2[0])/2+bend[0],(A2[1]+B2[1])/2+bend[1]];
    if(f){var om=f.o(.5)-(f.o(0)+f.o(1))/2;mid[0]+=f.n[0]*om;mid[1]+=f.n[1]*om}
    return mid;
  });
  NQ.forEach(function(p,jj){moved=Math.max(moved,Math.hypot(p[0]-Q[jj][0],p[1]-Q[jj][1]))});
  /* per sicurezza: niente salti più grandi della fascia cercata, area simile */
  if(moved>band*1.6)return null;
  var a0=quadArea(Q),a1=quadArea(NQ);if(a1<a0*.8||a1>a0*1.25)return null;
  return {q:NQ.map(function(p){return [p[0]/k,p[1]/k]}),mids:NM.map(function(p){return [p[0]/k,p[1]/k]}),moved:moved/k};
}
function quadFit(pts,line){
  /* minimi quadrati di o = a + b t + c t² (con line, solo la retta: c = 0) */
  if(line){var n=pts.length,st=0,so=0,stt=0,sto=0;pts.forEach(function(p){st+=p[0];so+=p[1];stt+=p[0]*p[0];sto+=p[0]*p[1]});var den=n*stt-st*st;if(!n||Math.abs(den)<1e-9)return null;var bb=(n*sto-st*so)/den;return [(so-bb*st)/n,bb,0]}
  var S=[[0,0,0],[0,0,0],[0,0,0]],R=[0,0,0];
  pts.forEach(function(p){var v=[1,p[0],p[0]*p[0]];for(var a=0;a<3;a++){R[a]+=v[a]*p[1];for(var b=0;b<3;b++)S[a][b]+=v[a]*v[b]}});
  /* Gauss */
  for(var c=0;c<3;c++){var piv=c;for(var r=c+1;r<3;r++)if(Math.abs(S[r][c])>Math.abs(S[piv][c]))piv=r;if(Math.abs(S[piv][c])<1e-9)return null;
    var tS=S[c];S[c]=S[piv];S[piv]=tS;var tR=R[c];R[c]=R[piv];R[piv]=tR;
    for(r=0;r<3;r++)if(r!==c){var f=S[r][c]/S[c][c];for(var cc=0;cc<3;cc++)S[r][cc]-=f*S[c][cc];R[r]-=f*R[c]}}
  return [R[0]/S[0][0],R[1]/S[1][1],R[2]/S[2][2]];
}
function detectPage0(work){
  var G=edgeGrad(work),k=G.k,E=CFG.scan.edges,cands=[];
  var f=detectPageSeg(work);
  if(f){
    cands.push({q:f.q,mids:f.mids,seg:true});
    var rf=null;try{rf=refineQuad(work,f.q,f.mids)}catch(err){}
    if(rf)cands.push({q:rf.q,mids:rf.mids,seg:true});
  }
  /* foglio colorato: la maschera del colore più luminoso (R-SCN-34) */
  var fv=null;try{fv=detectPageAt(work,0,true)}catch(err){}
  if(fv){
    cands.push({q:fv.q,mids:fv.mids,seg:true,vivid:true});
    var rv=null;try{rv=refineQuad(work,fv.q,fv.mids)}catch(err){}
    if(rv)cands.push({q:rv.q,mids:rv.mids,seg:true,vivid:true});
  }
  cands.forEach(function(c){c.g=c.q.map(function(p){return [p[0]*k,p[1]*k]})});
  var e=null;try{var tops=edgeQuad(G);tops.forEach(function(c){var r=quadSides(G,c.q);r=quadPolish(G,r.q);if(!e||r.s>e.s)e=r})}catch(err){}
  if(e){var gr=e.q,pre=e.s;
    gr=quadTrim(G,gr);
    cands.push({g:gr,seg:false,pre:pre})}
  if(!cands.length)return null;
  cands.forEach(function(c){var r=quadScoreG(G,c.g,c.mids&&c.mids.map(function(p){return [p[0]*k,p[1]*k]}));c.s=r.s;c.sup=r.sup;c.cont=r.cont;c.min=Math.min.apply(0,r.sup.filter(function(v){return v>=0}).concat([1]))});
  /* la maschera, quando c'è, ha già i lati curvi: vince anche se ha un po' meno contorno (segBias); e vince comunque se il
     quadrilatero dei lati dritti le sta dentro (era una piega o un riquadro stampato) purché ogni suo lato abbia un po' di contorno */
  var ed=cands[cands.length-1].seg?null:cands[cands.length-1],best=null;
  cands.forEach(function(c){c.v=c.seg?c.s*(c.min>=E.segGood?E.segGoodBias:E.segBias):c.s;
    if(c.seg&&ed&&c.min>=E.segMin&&c.s>0&&ed.g.every(function(p){return inQuad(c.g,p)}))c.v=Math.max(c.v,ed.s+1);
    /* foglio colorato (R-SCN-34): sta dentro il quadrilatero dei lati dritti e attorno, fino a quei lati, c'è uno sfondo nettamente
       più scuro: i lati dritti erano quelli del divano o del tavolo, il foglio è il colorato */
    if(c.vivid&&ed&&vividWins(work,c.q,ed.g.map(function(p){return [p[0]/k,p[1]/k]})))c.v=Math.max(c.v,ed.s+1+c.s);
    if(!best||c.v>best.v)best=c});
  if(PERF)(window.__det=window.__det||[]).push(cands.map(function(c){return {g:c.g.map(function(p){return [Math.round(p[0]/k),Math.round(p[1]/k)]}),vivid:!!c.vivid,seg:c.seg,s:Math.round(c.s),min:Math.round(c.min*100)/100,sup:c.sup.map(function(v){return Math.round(v*100)/100}),cont:c.cont,best:c===best}}));
  /* un lato spostato su un contorno debole abbassa il punteggio: conta quello di prima */
  if(Math.max(best.s,best.pre||-1)<=0)return null;
  /* cornice colorata: vale per qualunque proposta */
  var og=quadOuter(G,best.g);
  if(best.seg&&og.every(function(p,i){return p[0]===best.g[i][0]&&p[1]===best.g[i][1]}))return {q:best.q,mids:best.mids,edge:false};
  best.g=og;
  /* lati appena dentro il contorno (il passaggio chiaro/scuro sta a metà pixel: senza, resta un filo di sfondo) */
  var g=quadInset(best.g,E.inset);
  /* curvatura dei lati solo se segue il contorno meglio dei lati dritti (una copertina rigida resta dritta) */
  var m=edgeMids(G,g),ms=quadScoreG(G,g,m).s,ss=quadScoreG(G,g).s;if(ms<ss+E.curveGain*Math.max(1,ss))m=projMids(g);
  return {q:g.map(function(p){return [p[0]/k,p[1]/k]}),mids:m.map(function(p){return [p[0]/k,p[1]/k]}),edge:true};
}
/* punteggio di un quadrilatero in coordinate della foto (per scegliere tra proposta e correzione automatica) */
function quadScore(work,q){var G=edgeGrad(work),k=G.k;return quadScoreG(G,q.map(function(p){return [p[0]*k,p[1]*k]})).s}
function vividWins(work,qin,qout){
  /* intorno al foglio colorato, in una fascia larga un decimo del foglio, lo sfondo è nettamente più scuro; e i lati dritti
     prendono molto più del foglio (una parte di divano o di tavolo) */
  function area(Q){var a=0;for(var j=0;j<4;j++){var p=Q[j],q=Q[(j+1)%4];a+=p[0]*q[1]-q[0]*p[1]}return Math.abs(a)/2}
  if(area(qout)<area(qin)*1.15)return false;
  var cx=qin.reduce(function(a,b){return a+b[0]},0)/4,cy=qin.reduce(function(a,b){return a+b[1]},0)/4,ring=qin.map(function(p){return [cx+(p[0]-cx)*1.12,cy+(p[1]-cy)*1.12]});
  var W=work.width,H=work.height,k=Math.min(1,200/Math.max(W,H)),w=Math.round(W*k),h=Math.round(H*k),c=document.createElement("canvas");c.width=w;c.height=h;
  var g=c.getContext("2d",{willReadFrequently:true});g.drawImage(work,0,0,w,h);var d=g.getImageData(0,0,w,h).data;c.width=c.height=0;
  var si=0,ni=0,so=0,no=0;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){
    var P=[x/k,y/k],i=(y*w+x)*4,v=Math.max(d[i],d[i+1],d[i+2]);
    if(inQuad(qin,P)){si+=v;ni++}else if(inQuad(ring,P)){so+=v;no++}
  }
  if(!ni||no<ni*.05)return false;
  return si/ni-so/no>=CFG.scan.edges.vividGap&&ni/(w*h)>=CFG.scan.edges.vividArea;
}
function detectPageSeg(work){
  var a=detectPageAt(work,0),b=detectPageAt(work,1);
  if(!b)return a;if(!a)return b;
  /* il chiaro contiene un quadrilatero più chiaro, ben più piccolo e dai bordi dritti: il primo era il foglio insieme alla superficie
     su cui sta (una cartellina, una tovaglia chiara), il secondo è il foglio */
  /* e deve stare dentro il primo con margine su tutti e quattro i lati: se ne condivide uno, è solo un pezzo del foglio
     (per esempio tagliato da un'ombra) */
  function box(q){var xs=q.map(function(p){return p[0]}),ys=q.map(function(p){return p[1]});return [Math.min.apply(0,xs),Math.min.apply(0,ys),Math.max.apply(0,xs),Math.max.apply(0,ys)]}
  var A=box(a.q),Bx=box(b.q),mx=(A[2]-A[0])*.03,my=(A[3]-A[1])*.03;
  var inside=Bx[0]>A[0]+mx&&Bx[1]>A[1]+my&&Bx[2]<A[2]-mx&&Bx[3]<A[3]-my;
  return inside&&b.area<a.area*.7&&b.area>.08?b:a;
}
/* vivid: foglio colorato (volantino, copertina) su uno sfondo scuro: conta la luminosità del colore più forte, non il bianco (R-SCN-34) */
function detectPageAt(work,lvl,vivid){
  var W=work.width,H=work.height,k=Math.min(1,360/Math.max(W,H)),w=Math.max(16,Math.round(W*k)),h=Math.max(16,Math.round(H*k));
  var cv=document.createElement("canvas");cv.width=w;cv.height=h;
  var g=cv.getContext("2d");g.drawImage(work,0,0,w,h);
  var d=g.getImageData(0,0,w,h).data,n=w*h,sc=new Uint8Array(n),hist=new Uint32Array(256),i;
  for(i=0;i<n;i++){
    var r=d[i*4],gg=d[i*4+1],b=d[i*4+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);
    var v=vivid?mx:r*.3+gg*.59+b*.11-(mx-mn)*.8;v=v<0?0:v>255?255:v;sc[i]=v;hist[v|0]++;
  }
  /* Otsu tra i livelli lo..255 */
  function otsu(lo){
    var nn=0,sum=0,sumB=0,wB=0,best=0,th=lo;
    for(var j=lo;j<256;j++){nn+=hist[j];sum+=j*hist[j]}
    for(j=lo;j<256;j++){
      wB+=hist[j];if(!wB)continue;var wF=nn-wB;if(!wF)break;
      sumB+=j*hist[j];var mB=sumB/wB,mF=(sum-sumB)/wF,bt=wB*wF*(mB-mF)*(mB-mF);
      if(bt>best){best=bt;th=j}
    }
    return th;
  }
  var lo=0,thr=otsu(0);
  if(lvl){lo=thr+1;thr=otsu(lo);if(thr<=lo)return null}
  /* la soglia si abbassa verso lo sfondo: le zone del foglio in ombra o più lontane dalla luce restano dentro */
  var cB=0,sB=0;for(i=lo;i<=thr;i++){cB+=hist[i];sB+=i*hist[i]}
  var mBg=cB?sB/cB:0;thr=mBg+(thr-mBg)*.55;
  var m=new Uint8Array(n);for(i=0;i<n;i++)m[i]=sc[i]>thr?1:0;
  function morph(src,keep){
    var o=new Uint8Array(n);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var all=1,any=0;
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){
        var X=x+dx,Y=y+dy,val=(X<0||Y<0||X>=w||Y>=h)?0:src[Y*w+X];
        if(val)any=1;else all=0;
      }
      o[y*w+x]=keep?all:any;
    }
    return o;
  }
  m=morph(morph(m,1),0);m=morph(morph(m,0),1);
  var lab=new Int32Array(n),stack=new Int32Array(n),bestId=0,bestArea=0,id=0;
  for(i=0;i<n;i++){
    if(!m[i]||lab[i])continue;
    id++;var sp=0,area=0;stack[sp++]=i;lab[i]=id;
    while(sp){
      var p=stack[--sp];area++;
      var px=p%w,py=(p/w)|0;
      if(px>0&&m[p-1]&&!lab[p-1]){lab[p-1]=id;stack[sp++]=p-1}
      if(px<w-1&&m[p+1]&&!lab[p+1]){lab[p+1]=id;stack[sp++]=p+1}
      if(py>0&&m[p-w]&&!lab[p-w]){lab[p-w]=id;stack[sp++]=p-w}
      if(py<h-1&&m[p+w]&&!lab[p+w]){lab[p+w]=id;stack[sp++]=p+w}
    }
    if(area>bestArea){bestArea=area;bestId=id}
  }
  if(!bestId||bestArea<n*.12)return null;
  var edge=0,perim=2*(w+h);
  for(var x=0;x<w;x++){if(lab[x]===bestId)edge++;if(lab[(h-1)*w+x]===bestId)edge++}
  for(var y=0;y<h;y++){if(lab[y*w]===bestId)edge++;if(lab[y*w+w-1]===bestId)edge++}
  if(edge>perim*.45)return null;
  var D=[[1e9,0,0],[-1e9,0,0],[-1e9,0,0],[1e9,0,0]],A=[[1e9,0,0],[-1e9,0,0],[-1e9,0,0],[1e9,0,0]];
  for(y=0;y<h;y++)for(x=0;x<w;x++){
    if(lab[y*w+x]!==bestId)continue;
    var s=x+y,t=x-y;
    if(s<D[0][0])D[0]=[s,x,y];if(t>D[1][0])D[1]=[t,x,y];if(s>D[2][0])D[2]=[s,x,y];if(t<D[3][0])D[3]=[t,x,y];
    if(y<A[0][0])A[0]=[y,x,y];if(x>A[1][0])A[1]=[x,x,y];if(y>A[2][0])A[2]=[y,x,y];if(x<A[3][0])A[3]=[x,x,y];
  }
  function quadArea(P){var a=0;for(var j=0;j<4;j++){var p=P[j],q2=P[(j+1)%4];a+=p[0]*q2[1]-q2[0]*p[1]}return Math.abs(a)/2}
  function order(P){
    var cx=(P[0][0]+P[1][0]+P[2][0]+P[3][0])/4,cy=(P[0][1]+P[1][1]+P[2][1]+P[3][1])/4;
    P=P.slice().sort(function(a,b){return Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx)});
    var st=0;for(var j=1;j<4;j++)if(P[j][0]+P[j][1]<P[st][0]+P[st][1])st=j;
    return [P[st],P[(st+1)%4],P[(st+2)%4],P[(st+3)%4]];
  }
  var qa=order(D.map(function(e){return [e[1]+.5,e[2]+.5]})),qb=order(A.map(function(e){return [e[1]+.5,e[2]+.5]}));
  var q=quadArea(qb)>quadArea(qa)*1.08?qb:qa,qa2=quadArea(q);
  if(qa2<bestArea*.75||qa2>bestArea*1.3)return null;
  /* bordo esterno del foglio: si riempie dall'esterno tutto ciò che non è foglio; i buchi interni (le scritte) restano fuori */
  var outside=new Uint8Array(n),sp2=0;
  function seed(j){if(!outside[j]&&lab[j]!==bestId){outside[j]=1;stack[sp2++]=j}}
  for(x=0;x<w;x++){seed(x);seed((h-1)*w+x)}
  for(y=0;y<h;y++){seed(y*w);seed(y*w+w-1)}
  while(sp2){
    var pp=stack[--sp2],qx=pp%w,qy=(pp/w)|0;
    if(qx>0)seed(pp-1);if(qx<w-1)seed(pp+1);if(qy>0)seed(pp-w);if(qy<h-1)seed(pp+w);
  }
  var bd=[];
  for(y=1;y<h-1;y++)for(x=1;x<w-1;x++){
    var p0=y*w+x;
    if(!outside[p0]&&(outside[p0-1]||outside[p0+1]||outside[p0-w]||outside[p0+w]))bd.push([x+.5,y+.5]);
  }
  /* ogni lato: punti del bordo vicini al lato, lontani dagli angoli; retta per minimi quadrati totali, scartando i punti
     lontani (un'ombra o un dito su un angolo non spostano la retta). Gli angoli diventano le intersezioni delle rette. */
  var sides=[[q[0],q[1]],[q[1],q[2]],[q[3],q[2]],[q[0],q[3]]];
  function near(a,b,lo,hi){
    var L=dist(a,b),ux=(b[0]-a[0])/L,uy=(b[1]-a[1])/L,out=[];
    bd.forEach(function(p){
      var t=((p[0]-a[0])*ux+(p[1]-a[1])*uy)/L,dn=Math.abs((p[0]-a[0])*uy-(p[1]-a[1])*ux);
      if(t>lo&&t<hi&&dn<L*.09)out.push(p);
    });
    return out;
  }
  function fitLine(P){
    for(var round=0;round<3;round++){
      if(P.length<8)return null;
      var mx=0,my=0;P.forEach(function(p){mx+=p[0];my+=p[1]});mx/=P.length;my/=P.length;
      var sxx=0,syy=0,sxy=0;P.forEach(function(p){var dx=p[0]-mx,dy=p[1]-my;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy});
      var ang=.5*Math.atan2(2*sxy,sxx-syy),dx=Math.cos(ang),dy=Math.sin(ang);
      var res=P.map(function(p){return Math.abs((p[0]-mx)*dy-(p[1]-my)*dx)}),srt=res.slice().sort(function(a,b){return a-b});
      var lim=Math.max(1.2,2.5*srt[srt.length>>1]),keep=P.filter(function(p,j){return res[j]<=lim});
      if(round===2||keep.length===P.length)return {x:mx,y:my,dx:dx,dy:dy,n:keep.length,of:P.length};
      P=keep;
    }
  }
  function cross(l1,l2){
    var det=l1.dx*l2.dy-l1.dy*l2.dx;if(Math.abs(det)<1e-6)return null;
    var tt=((l2.x-l1.x)*l2.dy-(l2.y-l1.y)*l2.dx)/det;return [l1.x+l1.dx*tt,l1.y+l1.dy*tt];
  }
  var lines=sides.map(function(s){return fitLine(near(s[0],s[1],.12,.88))});
  var cxm=(q[0][0]+q[1][0]+q[2][0]+q[3][0])/4,cym=(q[0][1]+q[1][1]+q[2][1]+q[3][1])/4;
  /* un lato è curvo se il centro e le due estremità stanno da parti opposte della retta, con le estremità concordi
     (un'ombra o un dito su un solo angolo spostano una sola estremità e non contano come curvatura) */
  var sag=sides.map(function(s,j){
    var l=lines[j];if(!l)return 0;
    var nx=-l.dy,ny=l.dx;if(nx*(l.x-cxm)+ny*(l.y-cym)<0){nx=-nx;ny=-ny}
    function med(lo,hi){var v=near(s[0],s[1],lo,hi).map(function(p){return (p[0]-l.x)*nx+(p[1]-l.y)*ny}).sort(function(x,y){return x-y});return v.length>3?v[v.length>>1]:null}
    var c=med(.4,.6),e1=med(.1,.24),e2=med(.76,.9),L=dist(s[0],s[1]);
    if(c===null||e1===null||e2===null)return 0;
    var ends=(e1+e2)/2,ratio=Math.abs(e1)/Math.max(.01,Math.abs(e2));
    if(e1*e2>0&&ratio>.4&&ratio<2.5&&Math.abs(e1)>L*.004&&(c-ends)*e1<0&&Math.abs(c-ends)>L*.015)return c-ends;
    return 0;
  });
  /* angoli: intersezione delle rette dove i due lati sono dritti, altrimenti l'estremo trovato prima */
  var adj=[[0,3],[0,1],[2,1],[2,3]];
  q=q.map(function(p0,i){
    var A=lines[adj[i][0]],B=lines[adj[i][1]];
    if(!A||!B||sag[adj[i][0]]||sag[adj[i][1]]||A.n<10||B.n<10)return p0;
    var c=cross(A,B);
    if(!c||c[0]<-w*.05||c[1]<-h*.05||c[0]>w*1.05||c[1]>h*1.05)return p0;
    return [Math.max(0,Math.min(w,c[0])),Math.max(0,Math.min(h,c[1]))];
  });
  var a3=quadArea(q);if(a3<bestArea*.8||a3>bestArea*1.5)return null;
  /* maniglie dei lati: punto medio prospettico, spostato della curvatura trovata */
  var pm=projMids(q);
  var mids=pm.map(function(M,j){
    if(!sag[j])return M;
    var s=[[q[0],q[1]],[q[1],q[2]],[q[3],q[2]],[q[0],q[3]]][j],L=dist(s[0],s[1]),nx=-(s[1][1]-s[0][1])/L,ny=(s[1][0]-s[0][0])/L;
    if(nx*(M[0]-cxm)+ny*(M[1]-cym)<0){nx=-nx;ny=-ny}
    return [M[0]+nx*sag[j],M[1]+ny*sag[j]];
  });
  var inv=1/k;
  return {q:q.map(function(p){return [p[0]*inv,p[1]*inv]}),mids:mids.map(function(p){return [p[0]*inv,p[1]*inv]}),area:bestArea/n};
}
/* ---------- bordi: calamita e controllo (R-SCN-23/24) ----------
   paperMap: punteggio carta/sfondo come in detectPage, a 900 px, con la stessa soglia abbassata verso lo sfondo. */
var paperCache=new WeakMap();
function paperMap(work){
  var m=paperCache.get(work);if(m)return m;
  var W=work.width,H=work.height,k=Math.min(1,900/Math.max(W,H)),w=Math.max(16,Math.round(W*k)),h=Math.max(16,Math.round(H*k));
  var cv=document.createElement("canvas");cv.width=w;cv.height=h;
  var g=cv.getContext("2d",{willReadFrequently:true});g.drawImage(work,0,0,w,h);
  var d=g.getImageData(0,0,w,h).data,n=w*h,v=new Uint8Array(n),hist=new Uint32Array(256),i;
  for(i=0;i<n;i++){
    var r=d[i*4],gg=d[i*4+1],b=d[i*4+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);
    var x=r*.3+gg*.59+b*.11-(mx-mn)*.8;x=x<0?0:x>255?255:x;v[i]=x;hist[x|0]++;
  }
  var sum=0,sumB=0,wB=0,best=0,thr=128;
  for(i=0;i<256;i++)sum+=i*hist[i];
  for(i=0;i<256;i++){wB+=hist[i];if(!wB)continue;var wF=n-wB;if(!wF)break;sumB+=i*hist[i];var mB=sumB/wB,mF=(sum-sumB)/wF,bt=wB*wF*(mB-mF)*(mB-mF);if(bt>best){best=bt;thr=i}}
  var cB=0,sB=0,cF=0,sF=0;for(i=0;i<256;i++){if(i<=thr){cB+=hist[i];sB+=i*hist[i]}else{cF+=hist[i];sF+=i*hist[i]}}
  var mBg=cB?sB/cB:0,mFg=cF?sF/cF:255;
  m={w:w,h:h,k:k,v:v,thr:mBg+(thr-mBg)*.55,contrast:mFg-mBg};
  paperCache.set(work,m);cv.width=cv.height=0;
  return m;
}
function pmAt(m,x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=m.w||y>=m.h)return -1;return m.v[y*m.w+x]}
function lineFit(P){
  for(var round=0;round<3;round++){
    if(P.length<5)return null;
    var mx=0,my=0;P.forEach(function(p){mx+=p[0];my+=p[1]});mx/=P.length;my/=P.length;
    var sxx=0,syy=0,sxy=0;P.forEach(function(p){var dx=p[0]-mx,dy=p[1]-my;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy});
    var ang=.5*Math.atan2(2*sxy,sxx-syy),dx=Math.cos(ang),dy=Math.sin(ang);
    var res=P.map(function(p){return Math.abs((p[0]-mx)*dy-(p[1]-my)*dx)}),srt=res.slice().sort(function(a,b){return a-b});
    var lim=Math.max(1.5,2.5*srt[srt.length>>1]),keep=P.filter(function(p,j){return res[j]<=lim});
    if(round===2||keep.length===P.length)return {x:mx,y:my,dx:dx,dy:dy,n:keep.length,of:P.length};
    P=keep;
  }
}
function lineCross(l1,l2){
  var det=l1.dx*l2.dy-l1.dy*l2.dx;if(Math.abs(det)<1e-6)return null;
  var tt=((l2.x-l1.x)*l2.dy-(l2.y-l1.y)*l2.dx)/det;return [l1.x+l1.dx*tt,l1.y+l1.dy*tt];
}
/* lungo la normale n, il passaggio carta → sfondo più vicino a «base» entro ±R (carta verso «inside»).
   Restituisce lo scostamento con segno (positivo = verso l'esterno) o null. */
function edgeAlong(m,base,n,R){
  var best=null;
  for(var s=-R;s<=R;s++){
    var a=pmAt(m,base[0]+n[0]*(s-2),base[1]+n[1]*(s-2)),b=pmAt(m,base[0]+n[0]*(s+2),base[1]+n[1]*(s+2));
    var a2=pmAt(m,base[0]+n[0]*(s-5),base[1]+n[1]*(s-5));
    if(a<0||b<0||a2<0)continue;
    if(a>m.thr&&a2>m.thr&&b<m.thr&&a-b>m.contrast*.35&&(best===null||Math.abs(s)<Math.abs(best)))best=s;
  }
  return best;
}
/* controllo dopo l'impostazione: dove lungo un lato si vede lo sfondo, il lato rientra fino al bordo vero,
   dritto o con la sua curvatura. Solo verso l'interno: un ritaglio voluto non si allarga. */
function refineQuad(work,q,mids){
  var m=paperMap(work),k=m.k,R=Math.round(Math.min(m.w,m.h)*.09),map=pageMap(q,mids,1,1);
  var S=[[0,0,1,0],[1,0,1,1],[0,1,1,1],[0,0,0,1]];/* alto, destra, basso, sinistra in coordinate 0…1 */
  var res=S.map(function(sd,j){
    var pts=[],offs=[],cnt=0;
    for(var a=1;a<=9;a++){
      var t=.05+a*.09,x=sd[0]+(sd[2]-sd[0])*t,y=sd[1]+(sd[3]-sd[1])*t,P=map(x,y),Q=map(x+(j===1?-.02:j===3?.02:0),y+(j===0?.02:j===2?-.02:0));
      var bx=P[0]*k,by=P[1]*k,nx=bx-Q[0]*k,ny=by-Q[1]*k,L=Math.hypot(nx,ny)||1;nx/=L;ny/=L;
      var off=edgeAlong(m,[bx,by],[nx,ny],R);
      if(off===null)continue;cnt++;
      off=Math.min(0,off);offs.push(off);pts.push([bx+nx*off,by+ny*off,t]);
    }
    if(cnt<5)return null;
    var inside=offs.filter(function(o){return o<-1.5}).length;
    if(inside<3)return null;
    var l=lineFit(pts.map(function(p){return [p[0],p[1]]}));
    if(!l||l.n<pts.length*.7)return null;
    /* curvatura: scostamento dei punti centrali dalla retta */
    var nx2=-l.dy,ny2=l.dx,mid=pts.filter(function(p){return p[2]>.35&&p[2]<.65}).map(function(p){return (p[0]-l.x)*nx2+(p[1]-l.y)*ny2}).sort(function(a,b){return a-b});
    return {l:l,sag:mid.length?mid[mid.length>>1]:0,nx:nx2,ny:ny2};
  });
  if(!res.some(Boolean))return null;
  /* un lato non corretto resta la retta tra i suoi due angoli: l'angolo è l'incrocio con il lato corretto */
  var ends=[[0,1],[1,2],[3,2],[0,3]];
  function sideLine(j){
    if(res[j])return res[j].l;
    var a=q[ends[j][0]],b=q[ends[j][1]],L=dist(a,b)||1;return {x:a[0]*k,y:a[1]*k,dx:(b[0]-a[0])/L,dy:(b[1]-a[1])/L};
  }
  var adj=[[0,3],[0,1],[2,1],[2,3]],nq=q.map(function(p0,i){
    if(!res[adj[i][0]]&&!res[adj[i][1]])return p0;
    var c=lineCross(sideLine(adj[i][0]),sideLine(adj[i][1]));if(!c)return p0;
    c=[c[0]/k,c[1]/k];return dist(c,p0)<Math.min(work.width,work.height)*.2?c:p0;
  });
  var pm=projMids(nq),om=projMids(q);
  var nm=pm.map(function(M,j){
    var r=res[j];
    if(!r)return [M[0]+mids[j][0]-om[j][0],M[1]+mids[j][1]-om[j][1]];
    return Math.abs(r.sag)>1?[M[0]+r.nx*r.sag/k,M[1]+r.ny*r.sag/k]:M;
  });
  return {q:nq,mids:nm};
}
/* ---------- orientamento (Tesseract) e raddrizzamento fine del testo (R-SCN-20…22) ---------- */
var ocrP=null,ocrBad=false;
function ocrWorker(){
  if(ocrP)return ocrP;
  ocrP=new Promise(function(res,rej){
    var base=url("vendor/tesseract/");
    function go(){
      window.Tesseract.createWorker("osd",0,{workerPath:base+"worker.min.js",corePath:base+"tesseract-core-simd.wasm.js",langPath:base.replace(/\/$/,""),
        legacyCore:true,legacyLang:true,cacheMethod:"none",workerBlobURL:false}).then(res,rej);
    }
    loadScript("vendor/tesseract/tesseract.min.js").then(go,rej);
  }).catch(function(e){ocrBad=true;ocrP=null;throw e});
  return ocrP;
}
function scaledGray(cv,max){
  var k=Math.min(1,max/Math.max(cv.width,cv.height)),c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(cv.width*k));c.height=Math.max(1,Math.round(cv.height*k));
  var g=c.getContext("2d",{willReadFrequently:true});g.filter="grayscale(1)";g.drawImage(cv,0,0,c.width,c.height);
  return c;
}
/* rotazione oraria di quarti di giro più un'inclinazione in gradi; gli angoli scoperti restano bianchi */
function turnCanvas(src,quarter,skew){
  quarter=((quarter%360)+360)%360;if(!quarter&&!skew)return src;
  var sw=quarter%180!==0,c=document.createElement("canvas");c.width=sw?src.height:src.width;c.height=sw?src.width:src.height;
  var g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);
  g.translate(c.width/2,c.height/2);g.rotate((quarter+(skew||0))*Math.PI/180);g.imageSmoothingQuality="high";
  g.drawImage(src,-src.width/2,-src.height/2);
  return c;
}
/* inclinazione delle righe: l'angolo che rende più nitido il profilo orizzontale dei pixel scuri */
function findSkew(cv){
  var c=scaledGray(cv,1000),w=c.width,h=c.height,d=c.getContext("2d").getImageData(0,0,w,h).data,xs=[],ys=[],sum=0,i;
  for(i=0;i<w*h;i++)sum+=d[i*4];
  var lim=Math.min(150,sum/(w*h)-45);
  for(var y=0;y<h;y+=1)for(var x=0;x<w;x+=2)if(d[(y*w+x)*4]<lim){xs.push(x-w/2);ys.push(y-h/2)}
  c.width=c.height=0;
  if(xs.length<400)return 0;
  var diag=Math.ceil(Math.hypot(w,h)),bins=new Float64Array(diag+2);
  function score(a){
    var r=a*Math.PI/180,sn=Math.sin(r),cs=Math.cos(r),j;bins.fill(0);
    for(j=0;j<xs.length;j++){var b=Math.round(ys[j]*cs-xs[j]*sn+diag/2);if(b>=0&&b<=diag)bins[b]++}
    var s2=0;for(j=1;j<=diag;j++){var df=bins[j]-bins[j-1];s2+=df*df}return s2;
  }
  var best=0,bs=score(0),s0=bs,a;
  for(a=-10;a<=10;a+=.5)if(a){var sc=score(a);if(sc>bs){bs=sc;best=a}}
  var b2=best;for(a=best-.5;a<=best+.5;a+=.1){var sc2=score(a);if(sc2>bs){bs=sc2;b2=a}}
  return Math.abs(b2)>=.2&&bs>s0*1.05?Math.round(b2*10)/10:0;
}
/* orientamento del testo (quarti di giro, solo se Tesseract è sicuro) e inclinazione da correggere */
async function autoOrient(cv){
  var deg=0,script=null;
  if(!ocrBad){
    try{
      var w=await ocrWorker();ocrTouch();var small=scaledGray(cv,1600),r=(await w.detect(small)).data;small.width=small.height=0;ocrTouch();
      if(r&&r.orientation_degrees!=null&&r.orientation_confidence>=2)deg=r.orientation_degrees;
      else if(r&&r.orientation_degrees!=null){
        /* Tesseract incerto (scrittura a mano, poche righe): le righe della pagina dicono se il testo corre in verticale;
           allora la pagina va girata di un quarto, e da che parte lo dice Tesseract (anche con poca fiducia) o una seconda
           domanda sulla pagina già girata */
        var ld=lineDir(cv),vert=ld.v>=2*ld.h+2,od=r.orientation_degrees;
        if(vert&&(od===90||od===270)&&r.orientation_confidence>=.5)deg=od;
        else if(vert){
          var q=turnCanvas(cv,90,0),s2=scaledGray(q,1600),r2=(await w.detect(s2)).data;s2.width=s2.height=0;if(q!==cv)q.width=q.height=0;
          deg=r2&&r2.orientation_degrees===180&&r2.orientation_confidence>=.5?270:90;
        }
      }
      if(r&&r.script_confidence>=1)script=r.script;
    }catch(e){}
  }
  var turned=turnCanvas(cv,deg,0),skew=-findSkew(turned);
  if(turned!==cv)turned.width=turned.height=0;
  return {deg:deg,skew:skew,script:script};
}
var recP=null,recLang="",recSeen={};
async function ocrRecWorker(code,onNew){
  var base=url("vendor/tesseract/");
  if(!recSeen[code]&&onNew)onNew();
  if(!recP){
    await loadScript("vendor/tesseract/tesseract.min.js");
    recP=window.Tesseract.createWorker(code,1,{workerPath:base+"worker.min.js",corePath:base+"tesseract-core-simd.wasm.js",langPath:base+"lang",cacheMethod:"none",workerBlobURL:false});
    recLang=code;
    recP.catch(function(){recP=null});
  }
  var w=await recP;
  if(recLang!==code){await w.reinitialize(code,1);recLang=code}
  recSeen[code]=1;ocrTouch();
  return w;
}
/* i motori di Tesseract occupano decine di MB: si spengono un minuto dopo l'ultimo uso o uscendo da Cattura,
   e si riaccendono da soli alla prossima pagina (R-APP-17) */
var ocrIdle=0;
function ocrTouch(){clearTimeout(ocrIdle);ocrIdle=setTimeout(ocrFree,CFG.scan.ocrIdleMs||60000)}
function ocrFree(){
  clearTimeout(ocrIdle);
  if(ocrP){var p=ocrP;ocrP=null;p.then(function(w){w.terminate()}).catch(function(){})}
  if(recP){var q=recP;recP=null;recLang="";q.then(function(w){w.terminate()}).catch(function(){})}
}
function percentile(hist,total,p){var acc=0,lim=total*p;for(var i=0;i<256;i++){acc+=hist[i];if(acc>=lim)return i}return 255}
/* pulizia: «doc» stima la luce sul foglio e la toglie (fondo bianco uniforme), poi tende il contrasto;
   «bw» parte da lì e porta a bianco e nero; «photo» tende solo livelli e bilanciamento del bianco */
async function enhance(img,style){
  var d=img.data,w=img.width,h=img.height,n=w*h,i,c;
  if(style==="photo"){
    var hs=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];
    for(i=0;i<n*4;i+=4){hs[0][d[i]]++;hs[1][d[i+1]]++;hs[2][d[i+2]]++}
    var lut=[];
    for(c=0;c<3;c++){
      var lo=percentile(hs[c],n,.005),hi=Math.max(lo+1,percentile(hs[c],n,.995)),l=new Uint8ClampedArray(256);
      for(i=0;i<256;i++)l[i]=(i-lo)*255/(hi-lo)*.6+i*.4;
      lut.push(l);
    }
    for(i=0;i<n*4;i+=4){d[i]=lut[0][d[i]];d[i+1]=lut[1][d[i+1]];d[i+2]=lut[2][d[i+2]]}
    return img;
  }
  /* luce del foglio, canale per canale: il punto più chiaro di ogni riquadro 16×16, allargato e sfumato.
     Dividendo per questa luce il fondo diventa bianco uniforme e sparisce anche la dominante della lampada. */
  var S=16,bw=Math.ceil(w/S),bh=Math.ceil(h/S),bgs=[0,1,2].map(function(){return new Float32Array(bw*bh)}),tmp=new Float32Array(bw*bh);
  for(var by=0;by<bh;by++)for(var bx=0;bx<bw;bx++){
    var mr=0,mg=0,mb=0,ml=-1;
    for(var yy=by*S;yy<Math.min(h,by*S+S);yy+=2)for(var xx=bx*S;xx<Math.min(w,bx*S+S);xx+=2){
      var k=(yy*w+xx)*4,v=d[k]*.3+d[k+1]*.59+d[k+2]*.11;if(v>ml){ml=v;mr=d[k];mg=d[k+1];mb=d[k+2]}
    }
    var j0=by*bw+bx;bgs[0][j0]=mr;bgs[1][j0]=mg;bgs[2][j0]=mb;
  }
  function pass(src,dst,dx,dy,r,useMax){
    for(var y=0;y<bh;y++)for(var x=0;x<bw;x++){
      var acc=0,cnt=0;
      for(var s=-r;s<=r;s++){
        var X=x+dx*s,Y=y+dy*s;if(X<0||Y<0||X>=bw||Y>=bh)continue;
        var v=src[Y*bw+X];if(useMax){if(v>acc)acc=v}else{acc+=v;cnt++}
      }
      dst[y*bw+x]=useMax?acc:acc/cnt;
    }
  }
  bgs.forEach(function(bg){
    pass(bg,tmp,1,0,2,true);pass(tmp,bg,0,1,2,true);
    for(var it=0;it<2;it++){pass(bg,tmp,1,0,3,false);pass(tmp,bg,0,1,3,false)}
  });
  await new Promise(function(r){setTimeout(r,0)});
  var hist=new Uint32Array(256),t0=Date.now();
  for(var y=0;y<h;y++){
    var gy=Math.min(bh-1.001,Math.max(0,y/S-.5)),y0=gy|0,fy=gy-y0;
    for(var x=0;x<w;x++){
      var gx=Math.min(bw-1.001,Math.max(0,x/S-.5)),x0=gx|0,fx=gx-x0,j=y0*bw+x0,o=(y*w+x)*4;
      for(c=0;c<3;c++){
        var bg=bgs[c],bb=(bg[j]*(1-fx)+bg[j+1]*fx)*(1-fy)+(bg[j+bw]*(1-fx)+bg[j+bw+1]*fx)*fy;
        d[o+c]=d[o+c]*248/Math.max(bb,40);
      }
      hist[(d[o]*.3+d[o+1]*.59+d[o+2]*.11)|0]++;
    }
    if(Date.now()-t0>40){await new Promise(function(r){setTimeout(r,0)});t0=Date.now()}
  }
  var low=Math.min(120,percentile(hist,n,.015)),L=new Uint8ClampedArray(256);
  for(i=0;i<256;i++){var z=Math.max(0,(i-low)/(250-low));L[i]=255*Math.pow(Math.min(1,z),1.25)}
  for(i=0;i<n*4;i+=4){
    if(style==="bw"){
      var g=L[(d[i]*.3+d[i+1]*.59+d[i+2]*.11)|0],bwv=Math.max(0,Math.min(255,(g-150)*255/70));
      d[i]=d[i+1]=d[i+2]=bwv;
    }else{d[i]=L[d[i]];d[i+1]=L[d[i+1]];d[i+2]=L[d[i+2]]}
  }
  return img;
}
/* dagli angoli alla pagina raddrizzata e pulita, su canvas */
async function pageCanvas(r){
  var q=r.q,W=Math.max(dist(q[0],q[1]),dist(q[3],q[2])),H=Math.max(dist(q[0],q[3]),dist(q[1],q[2]));
  /* proporzioni vicine ad A4 (un foglio fotografato di sbieco si accorcia): riportate ad A4 */
  var ratio=Math.max(W,H)/Math.min(W,H);
  var A4=CFG.scan.a4||[1.36,1.47];if(ratio>A4[0]&&ratio<A4[1]){if(H>=W)H=W*Math.SQRT2;else W=H*Math.SQRT2}
  var k=Math.min(1,(r.max||2400)/Math.max(W,H));W=Math.max(1,Math.round(W*k));H=Math.max(1,Math.round(H*k));
  /* angoli o lati fuori dalla foto (foglio che esce dall'inquadratura): lì la pagina è bianca, non la riga del bordo ripetuta */
  var pts=q.concat(r.mids||[]),x0=Math.min.apply(0,pts.map(function(p){return p[0]})),y0=Math.min.apply(0,pts.map(function(p){return p[1]}));
  var x1=Math.max.apply(0,pts.map(function(p){return p[0]})),y1=Math.max.apply(0,pts.map(function(p){return p[1]})),ww=r.work.width,wh=r.work.height;
  if(x0<-1||y0<-1||x1>ww+1||y1>wh+1){
    var L=Math.ceil(Math.max(0,-x0))+2,T=Math.ceil(Math.max(0,-y0))+2,R=Math.ceil(Math.max(0,x1-ww))+2,B=Math.ceil(Math.max(0,y1-wh))+2;
    var pad=document.createElement("canvas");pad.width=ww+L+R;pad.height=wh+T+B;var pg=pad.getContext("2d");pg.fillStyle="#fff";pg.fillRect(0,0,pad.width,pad.height);pg.drawImage(r.work,L,T);
    var sh=function(p){return [p[0]+L,p[1]+T]};r={work:pad,q:q.map(sh),mids:(r.mids||projMids(q)).map(sh),style:r.style};q=r.q;
  }
  var t0=performance.now(),gcv=await glPage(r.work,q,r.mids,W,H,r.style);
  if(gcv){perf("gl",t0);return gcv}
  t0=performance.now();
  var img=await warp(r.work,q,r.mids,W,H);perf("warp",t0);t0=performance.now();
  img=await enhance(img,r.style);perf("enhance",t0);
  var cv=document.createElement("canvas");cv.width=W;cv.height=H;cv.getContext("2d").putImageData(img,0,0);
  return cv;
}
/* ---------- pieghe (R-SCN-27): righe di testo e linee delle tabelle devono essere dritte; da quanto non lo sono, la mappa per ridistendere ---------- */
/* operazioni su una riga di una maschera 0/1 con finestra di raggio r: dilata (qualcuno acceso) o erode (tutti accesi) */
function ufRows(src,W,H,r,erode){
  var out=new Uint8Array(W*H),pre=new Int32Array(W+1);
  for(var y=0;y<H;y++){
    var o=y*W;pre[0]=0;for(var x=0;x<W;x++)pre[x+1]=pre[x]+src[o+x];
    for(x=0;x<W;x++){var a=Math.max(0,x-r),b=Math.min(W,x+r+1),c=pre[b]-pre[a];out[o+x]=erode?(c===b-a?1:0):(c>0?1:0)}
  }
  return out;
}
function ufT(m,W,H){var o=new Uint8Array(W*H);for(var y=0;y<H;y++)for(var x=0;x<W;x++)o[x*H+y]=m[y*W+x];return o}
/* linee lunghe e piatte in orizzontale: per ognuna, la mediana della riga e gli scarti punto per punto [x, y0, y−y0] */
function ufLines(bw,W,H,U){
  var r=Math.max(9,W/40|0)>>1;
  /* via prima le linee lunghe di traverso: in una tabella fitta, chiudendo i vuoti, unirebbero tutte le righe in un blocco solo */
  var ry=Math.max(9,H/30|0)>>1,T=ufT(bw,W,H),ort=ufT(ufRows(ufRows(T,H,W,ry,true),H,W,ry,false),H,W);
  ort=ufRows(ufT(ufRows(ufT(ort,W,H),H,W,1,false),H,W),W,H,1,false);
  var clean=new Uint8Array(W*H);for(var ii=0;ii<W*H;ii++)clean[ii]=bw[ii]&&!ort[ii]?1:0;bw=clean;
  var blob=ufRows(ufRows(bw,W,H,r,false),W,H,r,true);
  blob=ufRows(ufRows(blob,W,H,r,true),W,H,r,false);
  /* componenti connesse (8 vicini) con unione e ricerca */
  var lab=new Int32Array(W*H),par=[0],n=0;
  function find(a){while(par[a]!==a){par[a]=par[par[a]];a=par[a]}return a}
  for(var y=0;y<H;y++)for(var x=0;x<W;x++){
    var i=y*W+x;if(!blob[i])continue;
    var ls=[];if(x>0&&lab[i-1])ls.push(lab[i-1]);
    if(y>0){if(lab[i-W])ls.push(lab[i-W]);if(x>0&&lab[i-W-1])ls.push(lab[i-W-1]);if(x<W-1&&lab[i-W+1])ls.push(lab[i-W+1])}
    if(!ls.length){n++;par.push(n);lab[i]=n;continue}
    var m=find(ls[0]);for(var k=1;k<ls.length;k++){var q=find(ls[k]);if(q!==m){if(q<m){par[m]=q;m=q}else par[q]=m}}
    lab[i]=m;
  }
  var st={};
  for(i=0;i<W*H;i++){if(!lab[i])continue;var l=lab[i]=find(lab[i]),xx=i%W,yy=(i/W)|0,s=st[l];
    if(!s)st[l]={x0:xx,x1:xx,y0:yy,y1:yy};else{if(xx<s.x0)s.x0=xx;if(xx>s.x1)s.x1=xx;if(yy<s.y0)s.y0=yy;if(yy>s.y1)s.y1=yy}}
  var keep={};
  Object.keys(st).forEach(function(l){var s=st[l],w=s.x1-s.x0+1,h=s.y1-s.y0+1;
    if(w>=W*U.minLen/2&&h<=H*U.maxH&&w>=4*h){s.w=w;s.si=new Float64Array(w);s.ci=new Float64Array(w);s.sm=new Float64Array(w);s.cm=new Float64Array(w);keep[l]=s}});
  for(i=0;i<W*H;i++){var s2=lab[i]&&keep[lab[i]];if(!s2)continue;var cx=i%W-s2.x0,cy=(i/W)|0;
    s2.sm[cx]+=cy;s2.cm[cx]++;if(bw[i]){s2.si[cx]+=cy;s2.ci[cx]++}}
  var segs=[],k2=Math.max(5,W*.01|0)|1,hk=k2>>1;
  Object.keys(keep).forEach(function(l){
    var s=keep[l],xs=[],ys=[];
    var inked=0;
    for(var c=0;c<s.w;c++){if(s.ci[c]){inked++;xs.push(c+s.x0);ys.push(s.si[c]/s.ci[c])}else if(s.cm[c]){xs.push(c+s.x0);ys.push(s.sm[c]/s.cm[c])}}
    /* una linea vera ha inchiostro quasi lungo tutta la sua lunghezza; lettere impilate di righe diverse no */
    if(inked<s.w*U.cover||xs.length<=k2)return;
    segs.push({xs:xs,ys:ys});
  });
  /* una piega netta spezza la linea in due pezzi sfalsati: i pezzi che si toccano quasi e stanno alla stessa altezza si riuniscono */
  segs.sort(function(a,b){return a.xs[0]-b.xs[0]});
  var used=[],chains=[];
  for(var a=0;a<segs.length;a++){
    if(used[a])continue;used[a]=1;var ch=[segs[a]];
    for(;;){
      var e=ch[ch.length-1],ex=e.xs[e.xs.length-1],ey=e.ys[e.ys.length-1],best=-1,bd=1e9;
      for(var b=a+1;b<segs.length;b++){
        if(used[b])continue;var gx=segs[b].xs[0]-ex,gy=Math.abs(segs[b].ys[0]-ey);
        if(gx>-W*.01&&gx<W*.04&&gy<H*.012&&gy+gx*.1<bd){bd=gy+gx*.1;best=b}
      }
      if(best<0)break;used[best]=1;ch.push(segs[best]);
    }
    var xs2=[],ys2=[];ch.forEach(function(g){for(var j=0;j<g.xs.length;j++)if(!xs2.length||g.xs[j]>xs2[xs2.length-1]){xs2.push(g.xs[j]);ys2.push(g.ys[j])}});
    if(xs2[xs2.length-1]-xs2[0]>=W*U.minLen)chains.push({xs:xs2,ys:ys2});
  }
  var out=[];
  chains.forEach(function(c){
    var xs=c.xs,ys=c.ys;
    var sm=ys.map(function(_,j){var a=0;for(var d=-hk;d<=hk;d++)a+=ys[Math.min(ys.length-1,Math.max(0,j+d))];return a/k2});
    var srt=sm.slice().sort(function(a,b){return a-b}),y0=srt[srt.length>>1],pts=[];
    for(var j=0;j<xs.length;j+=3)pts.push([xs[j],y0,sm[j]-y0]);
    out.push(pts);
  });
  return out;
}
/* mappa sulla griglia: media pesata gaussiana dei campioni, che sfuma a zero dove non ci sono linee */
function ufGrid(lines,W,H,G,sx,sy,lim){
  var pts=[];lines.forEach(function(l){pts=pts.concat(l)});
  var step=Math.max(1,Math.ceil(pts.length/1500)),f=new Float32Array(G*G);
  for(var gy=0;gy<G;gy++)for(var gx=0;gx<G;gx++){
    var X=gx*(W-1)/(G-1),Y=gy*(H-1)/(G-1),num=0,den=0;
    for(var i=0;i<pts.length;i+=step){var a=(X-pts[i][0])/sx,b=(Y-pts[i][1])/sy,e=a*a+b*b;if(e>18)continue;var w=Math.exp(-e/2);num+=w*pts[i][2];den+=w}
    var v=den>1e-3?num/den*Math.min(1,den/.1):0;f[gy*G+gx]=Math.max(-lim,Math.min(lim,v));
  }
  return f;
}
/* dalla pagina raddrizzata: {w, h, G, dx, dy} oppure null se non c'è niente di affidabile da correggere */
/* inchiostro della pagina su una copia con il lato lungo di «size» px: {bw, W, H} */
function ufBin(cv,size){
  var k=Math.min(1,size/Math.max(cv.width,cv.height)),W=Math.max(1,Math.round(cv.width*k)),H=Math.max(1,Math.round(cv.height*k));
  var c=document.createElement("canvas");c.width=W;c.height=H;var g=c.getContext("2d",{willReadFrequently:true});g.drawImage(cv,0,0,W,H);
  var d=g.getImageData(0,0,W,H).data;c.width=c.height=0;
  var gr=new Float32Array(W*H),ii=new Float64Array((W+1)*(H+1)),i,x,y;
  for(i=0;i<W*H;i++)gr[i]=d[i*4]*.299+d[i*4+1]*.587+d[i*4+2]*.114;
  for(y=0;y<H;y++){var row=0;for(x=0;x<W;x++){row+=gr[y*W+x];ii[(y+1)*(W+1)+x+1]=ii[y*(W+1)+x+1]+row}}
  /* inchiostro: più scuro della media locale (finestra di 1/60 della pagina) */
  var r=Math.max(7,(W/60|0)>>1),bw=new Uint8Array(W*H);
  for(y=0;y<H;y++)for(x=0;x<W;x++){
    var x0=Math.max(0,x-r),x1=Math.min(W,x+r+1),y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
    var m=(ii[y1*(W+1)+x1]-ii[y0*(W+1)+x1]-ii[y1*(W+1)+x0]+ii[y0*(W+1)+x0])/((x1-x0)*(y1-y0));
    bw[y*W+x]=gr[y*W+x]<m-12?1:0;
  }
  return {bw:bw,W:W,H:H};
}
/* righe di testo e linee: quante orizzontali e quante verticali (R-SCN-20: aiuta l'orientamento quando Tesseract è incerto) */
function lineDir(cv){
  var U=CFG.scan.unfold,B=ufBin(cv,600);
  return {h:ufLines(B.bw,B.W,B.H,U).length,v:ufLines(ufT(B.bw,B.W,B.H),B.H,B.W,U).length};
}
/* tremolio delle linee: per ogni linea, lo scarto dalla parabola che la segue meglio (la carta piega piano, la mano trema) */
function ufWobble(lines,vert){
  return lines.filter(function(l){return l.length>=10}).map(function(l){
    var n=l.length,S=[0,0,0,0,0],T=[0,0,0],x0=vert?l[0][1]:l[0][0],x1=vert?l[n-1][1]:l[n-1][0],sc=Math.max(1,(x1-x0)/2),mid=(x0+x1)/2;
    var X=l.map(function(p){return ((vert?p[1]:p[0])-mid)/sc});
    for(var i=0;i<n;i++){var x=X[i],z=l[i][2],xx=1;for(var k=0;k<5;k++){S[k]+=xx;if(k<3)T[k]+=xx*z;xx*=x}}
    var A=[[S[0],S[1],S[2]],[S[1],S[2],S[3]],[S[2],S[3],S[4]]],B=T.slice();
    for(var c=0;c<3;c++){var pv=A[c][c]||1e-9;for(var r=0;r<3;r++){if(r===c)continue;var f=A[r][c]/pv;for(var q=c;q<3;q++)A[r][q]-=f*A[c][q];B[r]-=f*B[c]}}
    var co=[B[0]/(A[0][0]||1e-9),B[1]/(A[1][1]||1e-9),B[2]/(A[2][2]||1e-9)],e=0;
    for(i=0;i<n;i++){var d=l[i][2]-(co[0]+co[1]*X[i]+co[2]*X[i]*X[i]);e+=d*d}
    return Math.sqrt(e/n);
  });
}
function unfoldField(cv,pass){
  var U=CFG.scan.unfold,B=ufBin(cv,U.size),bw=B.bw,W=B.W,H=B.H,i;
  var hl=ufLines(bw,W,H,U),vl=ufLines(ufT(bw,W,H),H,W,U).map(function(l){return l.map(function(p){return [p[1],p[0],p[2]]})});
  if(hl.length+vl.length<U.minLines)return null;
  /* scrittura a mano: le righe tremano attorno alla loro curva molto più di quanto la carta possa piegarsi; non si distende */
  if(!pass){var wb=ufWobble(hl,false).concat(ufWobble(vl,true)).sort(function(x,y){return x-y}),wob=wb.length?wb[wb.length>>1]:0;
    if(PERF)(window.__unf=window.__unf||[]).push({h:hl.length,v:vl.length,wob:+wob.toFixed(2)});
    if(wob>U.maxWobble)return false}
  var G=U.grid,dy=ufGrid(hl,W,H,G,U.along*W,U.across*H,U.maxShift*H),dx=ufGrid(vl,W,H,G,U.across*W,U.along*H,U.maxShift*W),mx=0;
  for(i=0;i<G*G;i++)mx=Math.max(mx,Math.abs(dx[i]),Math.abs(dy[i]));
  return mx<.6?null:{w:W,h:H,G:G,dx:dx,dy:dy};
}
/* ridistende la pagina intera: ogni punto prende il colore da dove la mappa dice che è finito */
async function unfoldApply(cv,F){
  var W=cv.width,H=cv.height,G=F.G,sx=W/F.w,sy=H/F.h;
  var src=cv.getContext("2d",{willReadFrequently:true}).getImageData(0,0,W,H).data;
  var out=document.createElement("canvas");out.width=W;out.height=H;
  var og=out.getContext("2d"),img=og.createImageData(W,H),o=img.data;
  var gxI=new Int32Array(W),gxF=new Float32Array(W);
  for(var x=0;x<W;x++){var u=x/sx/(F.w-1)*(G-1);u=Math.min(G-1.0001,Math.max(0,u));gxI[x]=u|0;gxF[x]=u-(u|0)}
  for(var y=0;y<H;y++){
    var v=y/sy/(F.h-1)*(G-1);v=Math.min(G-1.0001,Math.max(0,v));var gy=v|0,fy=v-gy,r0=gy*G,r1=r0+G;
    for(x=0;x<W;x++){
      var a=gxI[x],fx=gxF[x];
      var ddx=((F.dx[r0+a]*(1-fx)+F.dx[r0+a+1]*fx)*(1-fy)+(F.dx[r1+a]*(1-fx)+F.dx[r1+a+1]*fx)*fy)*sx;
      var ddy=((F.dy[r0+a]*(1-fx)+F.dy[r0+a+1]*fx)*(1-fy)+(F.dy[r1+a]*(1-fx)+F.dy[r1+a+1]*fx)*fy)*sy;
      var px=Math.min(W-1.001,Math.max(0,x+ddx)),py=Math.min(H-1.001,Math.max(0,y+ddy)),ix=px|0,iy=py|0,tx=px-ix,ty=py-iy;
      var p00=(iy*W+ix)*4,p10=p00+4,p01=p00+W*4,p11=p01+4,q=(y*W+x)*4;
      for(var ch=0;ch<3;ch++)o[q+ch]=(src[p00+ch]*(1-tx)+src[p10+ch]*tx)*(1-ty)+(src[p01+ch]*(1-tx)+src[p11+ch]*tx)*ty;
      o[q+3]=255;
    }
    if(y%256===255)await new Promise(function(res){setTimeout(res,0)});
  }
  og.putImageData(img,0,0);
  return out;
}
/* ---------- ombre delle pieghe (R-SCN-29): mappa della luce fine, che segue le ombre morbide e lascia stare le zone stampate ---------- */
/* massimo su una finestra di raggio r, prima per righe poi per colonne (coda monotona) */
function shMax(a,W,H,r){
  var t=new Float32Array(W*H),o=new Float32Array(W*H),q=new Int32Array(Math.max(W,H)),x,y,h,e;
  for(y=0;y<H;y++){var b=y*W;h=0;e=0;
    for(x=0;x<W+r;x++){
      if(x<W){while(e>h&&a[b+q[e-1]]<=a[b+x])e--;q[e++]=x}
      var c=x-r;if(c<0)continue;while(q[h]<c-r)h++;t[b+c]=a[b+q[h]];
    }}
  for(x=0;x<W;x++){h=0;e=0;
    for(y=0;y<H+r;y++){
      if(y<H){while(e>h&&t[q[e-1]*W+x]<=t[y*W+x])e--;q[e++]=y}
      var c2=y-r;if(c2<0)continue;while(q[h]<c2-r)h++;o[c2*W+x]=t[q[h]*W+x];
    }}
  return o;
}
/* sfocatura quasi gaussiana: tre passate di media su finestre (somme cumulate), per righe e per colonne */
function shBlur(a,W,H,sig){
  var r=Math.max(1,Math.round(Math.sqrt(12*sig*sig/3+1)/2)),src=a,dst,pre=new Float64Array(Math.max(W,H)+1);
  for(var k=0;k<3;k++){
    dst=new Float32Array(W*H);
    for(var y=0;y<H;y++){var b=y*W;pre[0]=0;for(var x=0;x<W;x++)pre[x+1]=pre[x]+src[b+x];
      for(x=0;x<W;x++){var x0=Math.max(0,x-r),x1=Math.min(W,x+r+1);dst[b+x]=(pre[x1]-pre[x0])/(x1-x0)}}
    src=dst;dst=new Float32Array(W*H);
    for(x=0;x<W;x++){pre[0]=0;for(y=0;y<H;y++)pre[y+1]=pre[y]+src[y*W+x];
      for(y=0;y<H;y++){var y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);dst[y*W+x]=(pre[y1]-pre[y0])/(y1-y0)}}
    src=dst;
  }
  return src;
}
/* guadagno per schiarire le ombre morbide (le pieghe), {w, h, g} oppure null. Le zone stampate (caselle grigie, colonne colorate)
   hanno bordi netti: la luce fine si propaga dal foglio pulito solo cambiando piano (in su e in giù), e i bordi netti la fermano */
function shadeMap(cv){
  var C=CFG.scan.shade,k=Math.min(1,C.size/Math.max(cv.width,cv.height)),W=Math.max(8,Math.round(cv.width*k)),H=Math.max(8,Math.round(cv.height*k)),n=W*H,i,x,y;
  var c=document.createElement("canvas");c.width=W;c.height=H;var g=c.getContext("2d",{willReadFrequently:true});g.drawImage(cv,0,0,W,H);
  var d=g.getImageData(0,0,W,H).data;c.width=c.height=0;
  var lum=new Float32Array(n);for(i=0;i<n;i++)lum[i]=Math.max(d[i*4],d[i*4+1],d[i*4+2]);
  var r=Math.max(3,Math.round(Math.max(W,H)*C.fine)),R=Math.max(8,Math.round(Math.max(W,H)*C.coarse));
  var F0=shMax(lum,W,H,r),F=shBlur(F0,W,H,r),B=shBlur(shMax(lum,W,H,R),W,H,R),F1=shBlur(F0,W,H,1),F2=shBlur(F0,W,H,2);
  /* bordi netti: pendenza della luce fine oltre «sharp» per pixel, ingrossati di 3 pixel per chiudere i varchi */
  var sh=new Uint8Array(n);
  for(y=1;y<H-1;y++)for(x=1;x<W-1;x++){i=y*W+x;
    var gx=(F1[i-W+1]+2*F1[i+1]+F1[i+W+1]-F1[i-W-1]-2*F1[i-1]-F1[i+W-1])/8,gy=(F1[i+W-1]+2*F1[i+W]+F1[i+W+1]-F1[i-W-1]-2*F1[i-W]-F1[i-W+1])/8;
    if(Math.sqrt(gx*gx+gy*gy)>C.sharp*Math.max(B[i],1))sh[i]=1}
  var shf=new Float32Array(n);for(i=0;i<n;i++)shf[i]=sh[i];shf=shMax(shf,W,H,3);
  var S2=new Float32Array(n);for(i=0;i<n;i++)S2[i]=F2[i]/Math.max(B[i],1);
  var reach=new Uint8Array(n),q=new Int32Array(n),qh=0,qt=0;
  for(i=0;i<n;i++)if(S2[i]>=C.seed&&!shf[i]){reach[i]=1;q[qt++]=i}
  while(qh<qt){var p=q[qh++],px=p%W,lim=S2[p]-C.step,top=S2[p]+C.step;
    var nb=[px>0?p-1:-1,px<W-1?p+1:-1,p>=W?p-W:-1,p<n-W?p+W:-1];
    for(var j=0;j<4;j++){var t=nb[j];if(t>=0&&!reach[t]&&!shf[t]&&S2[t]>=lim&&S2[t]<=top){reach[t]=1;q[qt++]=t}}}
  var L=new Float32Array(n),any=false;
  for(i=0;i<n;i++)L[i]=reach[i]?Math.min(F[i],B[i]):B[i];
  /* attorno ai tratti (fermati dai loro bordi netti) la luce si prende dal foglio vicino: senza, resta un alone grigio intorno alle
     scritte; le zone stampate grandi restano lontane dal foglio raggiunto e tengono la luce del foglio intero */
  if(C.fill){var rf=new Float32Array(n),rl=new Float32Array(n);for(i=0;i<n;i++)if(reach[i]){rf[i]=1;rl[i]=L[i]}
    var bf=shBlur(rf,W,H,C.fill),bl=shBlur(rl,W,H,C.fill);
    for(i=0;i<n;i++)if(!reach[i]&&bf[i]>.02){var wv=Math.min(1,bf[i]/.25);L[i]=wv*bl[i]/bf[i]+(1-wv)*B[i]}}
  L=shBlur(L,W,H,2);
  var G=new Float32Array(n);
  for(i=0;i<n;i++){var v=Math.min(C.maxGain,Math.max(1,B[i]/Math.max(L[i],1)));G[i]=v;if(v>1.02)any=true}
  return any?{w:W,h:H,g:G}:null;
}
/* applica il guadagno alla pagina intera (interpolato), a blocchi di righe */
async function shadeApply(cv,M){
  var W=cv.width,H=cv.height,ctx=cv.getContext("2d",{willReadFrequently:true}),img=ctx.getImageData(0,0,W,H),o=img.data,sx=(M.w-1)/Math.max(1,W-1),sy=(M.h-1)/Math.max(1,H-1);
  for(var y=0;y<H;y++){
    var v=y*sy,b=Math.min(M.h-2,v|0),fy=v-b;
    for(var x=0;x<W;x++){
      var u=x*sx,a=Math.min(M.w-2,u|0),fx=u-a,r0=b*M.w+a;
      var gn=(M.g[r0]*(1-fx)+M.g[r0+1]*fx)*(1-fy)+(M.g[r0+M.w]*(1-fx)+M.g[r0+M.w+1]*fx)*fy;
      if(gn<=1.001)continue;var q=(y*W+x)*4;
      o[q]=Math.min(255,o[q]*gn);o[q+1]=Math.min(255,o[q+1]*gn);o[q+2]=Math.min(255,o[q+2]*gn);
    }
    if(y%256===255)await new Promise(function(res){setTimeout(res,0)});
  }
  ctx.putImageData(img,0,0);
}
/* valore della mappa nel punto (X, Y) della copia di analisi */
function ufAt(F,f,X,Y){
  var G=F.G,u=Math.min(G-1.0001,Math.max(0,X/(F.w-1)*(G-1))),v=Math.min(G-1.0001,Math.max(0,Y/(F.h-1)*(G-1))),a=u|0,b=v|0,fx=u-a,fy=v-b,r0=b*G+a;
  return (f[r0]*(1-fx)+f[r0+1]*fx)*(1-fy)+(f[r0+G]*(1-fx)+f[r0+G+1]*fx)*fy;
}
/* la mappa in più passate sulla copia piccola (ogni passata corregge quello che resta), composte in una sola: la pagina si ricampiona una volta */
/* la mappa in più passate sulla copia piccola (ogni passata corregge quello che resta), composte in una sola: la pagina si ricampiona una volta */
async function unfoldMap(cv){
  var U=CFG.scan.unfold,k=Math.min(1,U.size/Math.max(cv.width,cv.height));
  var sm=document.createElement("canvas");sm.width=Math.max(1,Math.round(cv.width*k));sm.height=Math.max(1,Math.round(cv.height*k));
  sm.getContext("2d").drawImage(cv,0,0,sm.width,sm.height);
  var F=null,cur=sm;
  for(var pass=0;pass<U.passes;pass++){
    var N=unfoldField(cur,pass);if(!N)break;
    if(F){
      /* totale = nuova + vecchia presa dove la nuova manda */
      for(var gy=0;gy<N.G;gy++)for(var gx=0;gx<N.G;gx++){
        var i=gy*N.G+gx,X=gx*(N.w-1)/(N.G-1)+N.dx[i],Y=gy*(N.h-1)/(N.G-1)+N.dy[i];
        N.dx[i]+=ufAt(F,F.dx,X,Y);N.dy[i]+=ufAt(F,F.dy,X,Y);
      }
    }
    F=N;
    if(pass<U.passes-1){var nx=await unfoldApply(sm,F);if(cur!==sm)cur.width=cur.height=0;cur=nx}
  }
  /* linee già dritte (righe di una tabella, bordi di un riquadro): se la mappa le piegherebbe, la pagina era piatta e le «righe storte»
     erano altro (una stampa fuori registro, una scritta a mano di traverso): niente distensione (R-SCN-27) */
  if(F&&U.straight){
    var B0=ufBin(sm,U.size),hl0=ufLines(B0.bw,B0.W,B0.H,U),vl0=ufLines(ufT(B0.bw,B0.W,B0.H),B0.H,B0.W,U).map(function(l){return l.map(function(p){return [p[1],p[0],p[2]]})});
    var bent=ufBends(hl0,F,false,B0.W,U)||ufBends(vl0,F,true,B0.H,U);
    if(PERF)(window.__unfGate=window.__unfGate||[]).push(bent);
    if(bent)F=null;
  }
  if(cur!==sm)cur.width=cur.height=0;sm.width=sm.height=0;
  return F;
}
/* una linea lunga e dritta (scarto dalla retta sotto straightRms px, lunga almeno straightLen della pagina) che la mappa piegherebbe
   di più di straight px: restituisce quanto la piega, altrimenti 0 */
function ufBends(lines,F,vert,len,U){
  var worst=0;
  lines.forEach(function(l){
    if(l.length<10)return;
    var t=l.map(function(p){return vert?p[1]:p[0]}),v=l.map(function(p){return (vert?p[0]:p[1])+p[2]});
    if(t[t.length-1]-t[0]<U.straightLen*len)return;
    function lin(ys){var n=ys.length,st=0,sy=0,stt=0,sty=0;for(var i=0;i<n;i++){st+=t[i];sy+=ys[i];stt+=t[i]*t[i];sty+=t[i]*ys[i]}var d=n*stt-st*st||1e-9,b=(n*sty-st*sy)/d,a=(sy-b*st)/n,m=0,r=0;for(i=0;i<n;i++){var e=ys[i]-(a+b*t[i]);m=Math.max(m,Math.abs(e));r+=e*e}return {max:m,rms:Math.sqrt(r/n)}}
    if(lin(v).rms>U.straightRms)return;
    var d=l.map(function(p,i){var X=vert?v[i]:t[i],Y=vert?t[i]:v[i];return ufAt(F,vert?F.dx:F.dy,X,Y)});
    worst=Math.max(worst,lin(d).max);
  });
  return worst>U.straight?Math.round(worst*10)/10:0;
}
/* quota della pagina con colori decisi (differenza tra il canale più forte e il più debole oltre 60) */
function colorFrac(cv){
  var k=Math.min(1,200/Math.max(cv.width,cv.height)),w=Math.max(1,Math.round(cv.width*k)),h=Math.max(1,Math.round(cv.height*k));
  var c=document.createElement("canvas");c.width=w;c.height=h;var g=c.getContext("2d",{willReadFrequently:true});g.drawImage(cv,0,0,w,h);
  var d=g.getImageData(0,0,w,h).data,n=0;c.width=c.height=0;
  for(var i=0;i<d.length;i+=4)if(Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>60)n++;
  return n/(w*h);
}
/* dai bordi della pagina, i pixel scuri e senza colore collegati al bordo, entro una fascia di band della pagina, diventano bianchi */
function edgeClean(cv){
  var C=CFG.scan.edges,W=cv.width,H=cv.height,g=cv.getContext("2d",{willReadFrequently:true}),img=g.getImageData(0,0,W,H),d=img.data,n=W*H;
  var bx=Math.max(2,Math.round(W*C.cleanBand)),by=Math.max(2,Math.round(H*C.cleanBand)),seen=new Uint8Array(n),st=new Int32Array(n),sp=0,ch=0;
  /* luce della carta: mediana del canale più forte nella parte centrale */
  var sm=[];for(var yy=Math.round(H*.2);yy<H*.8;yy+=Math.max(1,H/60|0))for(var xx=Math.round(W*.2);xx<W*.8;xx+=Math.max(1,W/60|0)){var j=(yy*W+xx)*4;sm.push(Math.max(d[j],d[j+1],d[j+2]))}
  sm.sort(function(a,b){return a-b});var paper=sm.length?sm[sm.length>>1]:255;
  function dark(i){var r=d[i*4],gg=d[i*4+1],b=d[i*4+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);
    return mx<C.cleanDark&&mx-mn<40}
  function push(x,y){if(x<0||y<0||x>=W||y>=H)return;if(x>=bx&&x<W-bx&&y>=by&&y<H-by)return;var i=y*W+x;if(seen[i]||!dark(i))return;seen[i]=1;st[sp++]=i}
  for(var x=0;x<W;x++){push(x,0);push(x,H-1)}for(var y=0;y<H;y++){push(0,y);push(W-1,y)}
  while(sp){var i=st[--sp],px=i%W,py=(i/W)|0;d[i*4]=d[i*4+1]=d[i*4+2]=255;ch++;push(px-1,py);push(px+1,py);push(px,py-1);push(px,py+1)}
  /* margini dritti (R-SCN-35): da ogni lato, le righe (o colonne) di bordo che non sono ancora carta pulita (oltre cleanRow di pixel fuori
     dalla carta: legno, ombra del bordo arricciato) diventano carta, fino alla prima pulita; così i lati della pagina escono dritti */
  if(paper>=C.cleanPaper){
    function off(i){var r=d[i*4],gg=d[i*4+1],b=d[i*4+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);return mx<paper*C.cleanShade||mx-mn>C.cleanSat&&mx<paper*.95}
    var sides=[[W,by,function(k,t){return t*W+k}],[W,by,function(k,t){return (H-1-t)*W+k}],[H,bx,function(k,t){return k*W+t}],[H,bx,function(k,t){return k*W+W-1-t}]];
    sides.forEach(function(sd){
      var len=sd[0],band=sd[1],at=sd[2],depth=0;
      for(var t=0;t<band;t++){var o=0;for(var k=0;k<len;k++)if(off(at(k,t)))o++;if(o<=len*C.cleanRow)break;depth=t+1}
      if(depth>=band)return;
      for(t=0;t<depth;t++)for(var k=0;k<len;k++){var i=at(k,t);d[i*4]=d[i*4+1]=d[i*4+2]=Math.min(255,paper);ch++}
    });
  }
  if(ch)g.putImageData(img,0,0);
}
async function workFrom(file,max){
  var bmp;
  try{bmp=await createImageBitmap(file,{imageOrientation:"from-image"})}catch(e){try{bmp=await createImageBitmap(file)}catch(e2){bmp=null}}
  if(!bmp)return null;
  var k=Math.min(1,(max||3000)/Math.max(bmp.width,bmp.height)),work=document.createElement("canvas");
  work.width=Math.round(bmp.width*k);work.height=Math.round(bmp.height*k);
  work.getContext("2d").drawImage(bmp,0,0,work.width,work.height);if(bmp.close)bmp.close();
  return work;
}
/* immagine che è già una scansione (R-SCN-33): tutto il contorno è carta chiara e senza colore, niente sfondo intorno.
   Allora la pagina è l'immagine intera: cercare i bordi taglierebbe un riquadro stampato dentro il foglio */
function flatScan(w){
  var W=w.width,H=w.height,k=Math.min(1,400/Math.max(W,H)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(W*k));c.height=Math.max(1,Math.round(H*k));
  var g=c.getContext("2d",{willReadFrequently:true});g.drawImage(w,0,0,c.width,c.height);
  var d=g.getImageData(0,0,c.width,c.height).data,cw=c.width,ch=c.height,b=Math.max(2,Math.round(Math.min(cw,ch)*.02)),n=0,ok=0;c.width=c.height=0;
  for(var y=0;y<ch;y++)for(var x=0;x<cw;x++){
    if(x>=b&&x<cw-b&&y>=b&&y<ch-b)continue;
    var i=(y*cw+x)*4,mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);n++;if(mn>=CFG.scan.flat.white&&mx-mn<=CFG.scan.flat.sat)ok++;
  }
  if(n&&ok/n>=CFG.scan.flat.share){var q=[[0,0],[W,0],[W,H],[0,H]];return {q:q,mids:projMids(q),edge:true,flat:true}}
  return null;
}
function insetQuad(w){var W=w.width,H=w.height,m=.06,q=[[W*m,H*m],[W*(1-m),H*m],[W*(1-m),H*(1-m)],[W*m,H*(1-m)]];return {q:q,mids:projMids(q)}}

async function costruisci(p,style,hooks){
  hooks=hooks||{};
  /* correzione automatica dei lati (R-SCN-24), tenuta solo se sotto i lati c'è almeno tanto contorno quanto prima (R-SCN-31) */
  /* angoli a mano (R-SCN-32): solo la prospettiva degli angoli scelti */
  if(p.manual)p.refined=true;
  if(!p.refined){var rf=null;try{rf=refineQuad(p.work,p.q,p.mids);if(rf&&quadScore(p.work,rf.q)<quadScore(p.work,p.q))rf=null}catch(e){rf=null}if(rf){p.q=rf.q;p.mids=rf.mids}p.refined=true}
  var cv=await pageCanvas({work:p.work,q:p.q,mids:p.mids,style:style,max:p.max});
  /* orientamento sulla pagina com'è uscita dai bordi (la distensione non lo cambia e il riconoscimento ci si trova meglio) */
  if(!p.auto){
    if(!ocrP&&!ocrBad&&hooks.ocrLoad)hooks.ocrLoad();
    p.auto=await autoOrient(cv);
  }
  /* pieghe (R-SCN-27): la mappa si calcola una volta per pagina (finché non cambiano i bordi); distesa, le righe sono già dritte
     e l'inclinazione fine (R-SCN-21) non serve più */
  var tu=performance.now(),skew=p.auto.skew;
  /* una pagina piena di colore (copertina, foto) ha forme ondulate disegnate apposta: non si distende */
  if(p.manual||p.flat)p.unf=null;
  if(p.unf===undefined){var cf=colorFrac(cv);
    if(cf>CFG.scan.unfold.maxColor)p.unf=null;else try{p.unf=await unfoldMap(cv)}catch(e){p.unf=null}}
  if(p.unf){try{var uc=await unfoldApply(cv,p.unf);cv.width=cv.height=0;cv=uc;skew=0}catch(e){}}
  perf("unfold",tu);
  /* ombre delle pieghe (R-SCN-29): solo Documento e Bianco e nero; Colore resta naturale */
  if(style!=="photo"&&CFG.scan.shade.on&&!p.manual){var ts=performance.now();try{var sm=shadeMap(cv);if(sm)await shadeApply(cv,sm)}catch(e){}perf("shade",ts)}
  /* spicchi di sfondo scuro rimasti lungo i bordi (un lato un po' curvo): diventano bianchi (R-SCN-31) */
  if(style!=="photo"&&!p.manual){try{edgeClean(cv)}catch(e){}}
  var out=turnCanvas(cv,p.auto.deg+p.rot,skew);
  if(out!==cv)cv.width=cv.height=0;
  return out;
}

/* tutto il giro di una foto (R-APP-21): file → foglio trovato → pagina raddrizzata e pulita, su canvas.
   opts.stile: "doc" (predefinito), "bw" o "photo"; opts.max: lato lungo della pagina (2400); opts.lavoro: lato lungo della foto di lavoro (3000) */
async function pagina(file,opts){
  opts=opts||{};
  var work=await workFrom(file,opts.lavoro);if(!work)throw new Error("foto");
  var f=null;try{f=flatScan(work)||detectPage(work)}catch(e){}
  if(!f)f=insetQuad(work);
  var p={work:work,q:f.q,mids:f.mids,rot:0,style:null,refined:!!f.edge,flat:!!f.flat,max:opts.max};
  var cv=await costruisci(p,opts.stile||"doc",opts.hooks);
  work.width=work.height=0;
  return {canvas:cv,deg:p.auto?p.auto.deg:0,script:p.auto?p.auto.script:null,trovato:!!(f.edge||f.flat||f.q)};
}
/* riconoscimento del testo con lo stesso motore (dati delle lingue in vendor/tesseract/lang) */
async function testo(img,code,params){
  var w=await ocrRecWorker(code);
  if(params)await w.setParameters(params);
  var r=await w.recognize(img);ocrTouch();
  return r.data;
}
var S={
  version:"dev",
  setPerf:function(on){PERF=!!on},
  ocrState:function(){return {started:!!ocrP,bad:ocrBad}},
  pagina:pagina,testo:testo,costruisci:costruisci,
  dist:dist,
  homography:homography,
  applyH:applyH,
  projMids:projMids,
  pageMap:pageMap,
  glSetup:glSetup,
  glTex:glTex,
  glDraw:glDraw,
  glPage:glPage,
  warp:warp,
  edgeGrad:edgeGrad,
  edgeLines:edgeLines,
  quadScoreG:quadScoreG,
  edgeQuad:edgeQuad,
  paperBand:paperBand,
  inkBand:inkBand,
  quadSides:quadSides,
  quadArea:quadArea,
  quadOrder:quadOrder,
  edgeMids:edgeMids,
  quadPolish:quadPolish,
  quadTrim:quadTrim,
  quadInset:quadInset,
  quadOuter:quadOuter,
  inQuad:inQuad,
  detectPage:detectPage,
  sideFit:sideFit,
  quadFit:quadFit,
  detectPage0:detectPage0,
  quadScore:quadScore,
  vividWins:vividWins,
  detectPageSeg:detectPageSeg,
  detectPageAt:detectPageAt,
  paperMap:paperMap,
  pmAt:pmAt,
  lineFit:lineFit,
  lineCross:lineCross,
  edgeAlong:edgeAlong,
  refineQuad:refineQuad,
  ocrWorker:ocrWorker,
  scaledGray:scaledGray,
  turnCanvas:turnCanvas,
  findSkew:findSkew,
  autoOrient:autoOrient,
  ocrRecWorker:ocrRecWorker,
  ocrTouch:ocrTouch,
  ocrFree:ocrFree,
  percentile:percentile,
  enhance:enhance,
  pageCanvas:pageCanvas,
  ufRows:ufRows,
  ufT:ufT,
  ufLines:ufLines,
  ufGrid:ufGrid,
  ufBin:ufBin,
  lineDir:lineDir,
  ufWobble:ufWobble,
  unfoldField:unfoldField,
  unfoldApply:unfoldApply,
  shMax:shMax,
  shBlur:shBlur,
  shadeMap:shadeMap,
  shadeApply:shadeApply,
  ufAt:ufAt,
  unfoldMap:unfoldMap,
  ufBends:ufBends,
  colorFrac:colorFrac,
  edgeClean:edgeClean,
  workFrom:workFrom,
  flatScan:flatScan,
  insetQuad:insetQuad
};
G.Scansione=S;
})(typeof window!=="undefined"?window:self);

/* Motore delle immagini (R-CMP, R-JPG, R-APP-09): ricompressione di un'immagine di PDF e di una foto JPG.
   Gira in un worker (più worker in parallelo, vedi «worker» in index.html) oppure, dove i worker non possono
   disegnare, nella pagina: in tutti e due i casi espone self.Engine. Nessuna dipendenza, nessuna chiamata di rete. */
(function (G) {
  "use strict";
  function canvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    var c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  }
  function jpeg(c, q) {
    if (c.convertToBlob) return c.convertToBlob({ type: "image/jpeg", quality: q });
    return new Promise(function (r) { c.toBlob(r, "image/jpeg", q); });
  }
  async function inflate(bytes) {
    var s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function unPng(data, cols, colors) {
    var bpp = colors, rl = cols * colors, rows = Math.floor(data.length / (rl + 1)), out = new Uint8Array(rows * rl), p = 0;
    for (var y = 0; y < rows; y++) {
      var ft = data[p++], o = y * rl, up = o - rl;
      for (var x = 0; x < rl; x++) {
        var raw = data[p++], a = x >= bpp ? out[o + x - bpp] : 0, b = y ? out[up + x] : 0, c = (y && x >= bpp) ? out[up + x - bpp] : 0, v;
        if (ft === 0) v = raw; else if (ft === 1) v = raw + a; else if (ft === 2) v = raw + b; else if (ft === 3) v = raw + ((a + b) >> 1);
        else { var pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = raw + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)); }
        out[o + x] = v & 255;
      }
    }
    return out;
  }
  /* un'immagine di PDF: {contents, dct, w, h, n, pred, cols, colors, max, q} → {bytes, w, h} oppure null */
  async function recompress(t) {
    var w = t.w, h = t.h, src;
    if (t.dct) src = await createImageBitmap(new Blob([t.contents], { type: "image/jpeg" }));
    else {
      var raw = await inflate(t.contents);
      if (t.pred >= 10) raw = unPng(raw, t.cols || w, t.colors || t.n);
      else if (t.pred !== 1) return null;
      if (raw.length < w * h * t.n) return null;
      var img = new ImageData(w, h), px = img.data, i = 0, j = 0, tot = w * h;
      if (t.n === 3) { for (; i < tot; i++) { px[j++] = raw[i * 3]; px[j++] = raw[i * 3 + 1]; px[j++] = raw[i * 3 + 2]; px[j++] = 255; } }
      else { for (; i < tot; i++) { var g = raw[i]; px[j++] = g; px[j++] = g; px[j++] = g; px[j++] = 255; } }
      src = canvas(w, h); src.getContext("2d").putImageData(img, 0, 0);
    }
    var k = Math.min(1, t.max / Math.max(w, h)), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
    var cv = canvas(nw, nh), g2 = cv.getContext("2d");
    g2.fillStyle = "#fff"; g2.fillRect(0, 0, nw, nh); g2.imageSmoothingQuality = "high"; g2.drawImage(src, 0, 0, nw, nh);
    if (src.close) src.close();
    var blob = await jpeg(cv, t.q); cv.width = cv.height = 0;
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: nw, h: nh };
  }
  /* Dall'inizio del file originale: il blocco con data, luogo e fotocamera (APP1 Exif) e quelli del profilo colore
     (APP2 ICC_PROFILE, anche più d'uno). La foto viene raddrizzata mentre la ridisegniamo, quindi nel blocco Exif
     l'orientamento va riportato a «normale». Si conservano sempre (R-JPG-02). */
  function jpgMeta(bytes) {
    var out = { exif: null, icc: [] };
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return out;
    var p = 2;
    while (p + 4 < bytes.length && bytes[p] === 0xFF) {
      var m = bytes[p + 1]; if (m === 0xDA || m === 0xD9) break;
      var len = (bytes[p + 2] << 8) | bytes[p + 3];
      if (p + 2 + len > bytes.length) break;
      if (!out.exif && m === 0xE1 && bytes[p + 4] === 0x45 && bytes[p + 5] === 0x78 && bytes[p + 6] === 0x69 && bytes[p + 7] === 0x66 && bytes[p + 8] === 0 && bytes[p + 9] === 0) {
        var seg = bytes.slice(p, p + 2 + len), t0 = 10, le = seg[t0] === 0x49;
        var u16 = function (o) { return le ? seg[o] | (seg[o + 1] << 8) : (seg[o] << 8) | seg[o + 1]; };
        var u32 = function (o) { return (le ? seg[o] | (seg[o + 1] << 8) | (seg[o + 2] << 16) | (seg[o + 3] << 24) : (seg[o] << 24) | (seg[o + 1] << 16) | (seg[o + 2] << 8) | seg[o + 3]) >>> 0; };
        var ifd = t0 + u32(t0 + 4);
        if (ifd + 2 <= seg.length) {
          var n = u16(ifd);
          for (var i = 0; i < n; i++) {
            var e = ifd + 2 + i * 12; if (e + 12 > seg.length) break;
            if (u16(e) === 0x0112) { seg[e + 8] = le ? 1 : 0; seg[e + 9] = le ? 0 : 1; break; }
          }
        }
        out.exif = seg;
      } else if (m === 0xE2 && len > 16 && String.fromCharCode.apply(null, bytes.subarray(p + 4, p + 16)) === "ICC_PROFILE\0") {
        out.icc.push(bytes.slice(p, p + 2 + len));
      }
      p += 2 + len;
    }
    return out;
  }
  function exifSegment(bytes) { return jpgMeta(bytes).exif; }
  /* una foto: {file, side, q, ios} → {bytes}. Ridisegna entro il lato lungo del livello (0 = misure originali)
     e ricodifica con la qualità del livello (R-JPG-01). */
  async function squeezeJpgFile(o, onPct) {
    var meta = { exif: null, icc: [] };
    try { meta = jpgMeta(new Uint8Array(await o.file.slice(0, 262144).arrayBuffer())); } catch (e) {}
    /* con un profilo colore i valori restano nel loro spazio: il profilo ricopiato li descrive (gamma ampia preservata) */
    var opt = { imageOrientation: "from-image" }; if (meta.icc.length) opt.colorSpaceConversion = "none";
    var bmp;
    try { bmp = await createImageBitmap(o.file, opt); } catch (e) { meta.icc = []; bmp = await createImageBitmap(o.file); }
    var w = bmp.width, h = bmp.height, k = o.side ? Math.min(1, o.side / Math.max(w, h)) : 1;
    var cap = (o.ios ? 16e6 : 120e6) / (w * h); if (k * k > cap) k = Math.sqrt(cap);
    var cv = canvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
    var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, cv.width, cv.height);
    if (bmp.close) bmp.close();
    if (onPct) onPct(50);
    var blob = await jpeg(cv, o.q || 0.82); cv.width = cv.height = 0;
    if (!blob) throw new Error("unreadable");
    var bytes = new Uint8Array(await blob.arrayBuffer());
    var extra = (meta.exif ? [meta.exif] : []).concat(meta.icc);
    if (extra.length) {
      var add = extra.reduce(function (s, x) { return s + x.length; }, 0), out = new Uint8Array(bytes.length + add), at = 2;
      out.set(bytes.subarray(0, 2), 0);
      extra.forEach(function (x) { out.set(x, at); at += x.length; });
      out.set(bytes.subarray(2), at); bytes = out;
    }
    return { bytes: bytes };
  }
  /* il worker sa disegnare? (canvas fuori schermo con 2D e JPEG) */
  function canWork() {
    try { var c = new OffscreenCanvas(2, 2); return !!(c.getContext("2d") && c.convertToBlob && typeof createImageBitmap === "function"); } catch (e) { return false; }
  }
  G.Engine = { recompress: recompress, squeezeJpgFile: squeezeJpgFile, exifSegment: exifSegment, jpgMeta: jpgMeta, canWork: canWork };

  if (typeof document === "undefined" && typeof G.postMessage === "function") {
    G.onmessage = async function (e) {
      var m = e.data;
      if (m.kind === "ping") { G.postMessage({ id: m.id, ok: canWork() }); return; }
      try {
        var r = m.kind === "img" ? await recompress(m) : await squeezeJpgFile(m, function (p) { G.postMessage({ id: m.id, pct: p }); });
        G.postMessage({ id: m.id, ok: true, r: r }, r && r.bytes ? [r.bytes.buffer] : []);
      } catch (err) { G.postMessage({ id: m.id, ok: false, err: String((err && err.message) || err) }); }
    };
  }
})(self);

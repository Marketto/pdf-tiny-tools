#!/usr/bin/env node
// Prova di fumo nel browser: avvia un server locale, apre l'app in più lingue,
// crea un PDF di prova con un'immagine, lo comprime e controlla che pesi meno; poi JPG, video e scansione.
// Richiede Playwright (npm install in tools/). Uso: node tools/smoke-test.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "") || "index.html";
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failed = 0;
const check = (ok, what) => { console.log((ok ? "✓ " : "✗ ") + what); if (!ok) failed++; };

for (const [locale, lang, dir] of [["it-IT", "it", "ltr"], ["en-US", "en", "ltr"], ["ar-EG", "ar", "rtl"], ["zh-CN", "zh", "ltr"], ["ja-JP", "en", "ltr"]]) {
  const ctx = await browser.newContext({ locale, viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url);
  const info = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, w: document.documentElement.scrollWidth }));
  check(info.lang === lang && info.dir === dir, `${locale}: lingua ${info.lang}, direzione ${info.dir}`);
  check(info.w <= 400, `${locale}: nessuno scorrimento orizzontale a 400 px`);

  if (lang === "it") {
    // PDF di prova creato nella pagina: un'immagine piena di rumore, poco comprimibile senza perdita.
    const size = await page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 1800; c.height = 1200;
      const g = c.getContext("2d"), d = g.createImageData(1800, 1200);
      for (let i = 0; i < d.data.length; i += 4) { const v = (i / 4 % 1800) / 7 + Math.random() * 90; d.data[i] = v; d.data[i + 1] = v * .8; d.data[i + 2] = 255 - v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
      const png = await new Promise((r) => c.toBlob(async (b) => r(new Uint8Array(await b.arrayBuffer())), "image/png"));
      const doc = await PDFLib.PDFDocument.create(), img = await doc.embedPng(png);
      doc.addPage([600, 400]).drawImage(img, { x: 0, y: 0, width: 600, height: 400 });
      const bytes = await doc.save();
      const dt = new DataTransfer(); dt.items.add(new File([bytes], "prova.pdf", { type: "application/pdf" }));
      const input = document.getElementById("pickFiles"); input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return bytes.length;
    });
    await page.click("#go");
    await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && document.querySelector("#rows .badge:not(.wait):not(.work)"), null, { timeout: 60000 });
    const done = await page.locator("#saveAs:visible").count();
    check(done === 1, `compressione: PDF di prova da ${Math.round(size / 1024)} KB alleggerito (${(await page.innerText("#rows")).replace(/\n/g, " / ")})`);
  }
  check(errors.length === 0, `${locale}: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- titolo: stessa grandezza nelle tre modalità, versione sulla stessa riga anche a 360 px (R-UI-04/06)
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 360, height: 760 } });
  const page = await ctx.newPage();
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url);
  const sizes = [], rows = [];
  for (let k = 0; k < 3; k++) {
    await page.waitForTimeout(700);
    sizes.push(await page.evaluate(() => getComputedStyle(document.getElementById("title")).fontSize));
    rows.push(await page.evaluate(() => { const a = document.getElementById("title").getBoundingClientRect(), v = document.getElementById("ver").getBoundingClientRect(); return v.top < a.bottom && v.bottom > a.top && a.height < parseFloat(getComputedStyle(document.getElementById("title")).fontSize) * 1.5; }));
    await page.click("#modeBtn");
  }
  check(new Set(sizes).size === 1, `Titolo: stessa grandezza in PDF, JPG e VIDEO (${sizes.join(", ")})`);
  check(rows.every(Boolean), "Titolo: titolo, modalità e versione su una riga a 360 px");
  await ctx.close();
}
// --- modalità JPG: rullo nel titolo, soglie di lato e di peso, dati dello scatto conservati
{
  const { readFile: read } = await import("node:fs/promises");
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url);
  await page.click("#modeBtn");
  check(await page.evaluate(() => document.body.classList.contains("mode-jpg") && !document.getElementById("optsJpg").hidden && document.getElementById("optsPdf").hidden), "JPG: il rullo cambia modalità e opzioni");
  check((await page.title()).includes("JPG") && (await page.innerText('label[for="pickFiles"]')).includes("JPG"), "JPG: i testi parlano di JPG");
  // foto di prova 3000x2000 con un blocco EXIF minimo (orientamento 6)
  const before = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const g = c.getContext("2d"), d = g.createImageData(3000, 2000);
    for (let i = 0; i < d.data.length; i += 4) { const v = (i / 4 % 3000) / 12 + Math.random() * 120; d.data[i] = v; d.data[i + 1] = 255 - v; d.data[i + 2] = v / 2; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    const jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", .95))).arrayBuffer());
    const exif = [0xFF, 0xE1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2A, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
    const all = new Uint8Array(jpg.length + exif.length); all.set(jpg.subarray(0, 2)); all.set(exif, 2); all.set(jpg.subarray(2), 2 + exif.length);
    const dt = new DataTransfer(); dt.items.add(new File([all], "foto.jpg", { type: "image/jpeg" }));
    const input = document.getElementById("pickFiles"); input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return all.length;
  });
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && document.querySelector("#rows .badge:not(.wait):not(.work)"), null, { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#saveAs")]);
  const out = await read(await dl.path());
  let w = 0, h = 0;
  for (let p = 2; p + 9 < out.length && out[p] === 0xFF;) { const m = out[p + 1], len = out.readUInt16BE(p + 2); if (m >= 0xC0 && m <= 0xC2) { h = out.readUInt16BE(p + 5); w = out.readUInt16BE(p + 7); break; } p += 2 + len; }
  check(dl.suggestedFilename() === "foto-compresso.jpg", `JPG: nome del file salvato (${dl.suggestedFilename()})`);
  check(out.length <= 512000, `JPG: da ${Math.round(before / 1024)} KB a ${Math.round(out.length / 1024)} KB, entro il limite di 500 KB`);
  check(Math.max(w, h) > 0 && Math.max(w, h) <= 1920, `JPG: lato lungo ${Math.max(w, h)} px, entro 1920`);
  check(out[2] === 0xFF && out[3] === 0xE1 && out.toString("latin1", 6, 10) === "Exif" && out[30] === 1, "JPG: dati dello scatto conservati, orientamento riportato a normale");
  check(await page.locator("#rows .row").count() === 0, "JPG: elenco svuotato dopo il salvataggio");
  check(errors.length === 0, `JPG: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- modalità video: rullo a tre facce, analisi, stima, codifica. Il Chromium di prova non ha H.264/HEVC:
// `?vcodec=vp9` forza VP9 (vedi docs/ARCHITETTURA.md). Il video di prova nasce nella pagina con Mediabunny.
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "?vcodec=vp9");
  await page.click("#modeBtn"); await page.waitForTimeout(300); await page.click("#modeBtn");
  check(await page.evaluate(() => document.body.classList.contains("mode-video") && !document.getElementById("optsVid").hidden && location.hash === "#video"), "Video: il rullo arriva alla terza modalità");
  check(await page.evaluate(() => getComputedStyle(document.getElementById("camBtn")).display === "none"), "Video: pulsante della fotocamera nascosto");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= 400), "Video: nessuno scorrimento orizzontale a 400 px");
  const made = await page.evaluate(async () => {
    const M = await import("./vendor/mediabunny.min.mjs");
    const c = document.createElement("canvas"); c.width = 640; c.height = 360;
    const g = c.getContext("2d"), tgt = new M.BufferTarget(), out = new M.Output({ format: new M.Mp4OutputFormat(), target: tgt });
    const src = new M.CanvasSource(c, { codec: "vp9", bitrate: 6e6 }); out.addVideoTrack(src, { frameRate: 30 });
    await out.start();
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `hsl(${i * 3},70%,55%)`; g.fillRect(0, 0, 640, 360);
      for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .4})`; g.fillRect(Math.random() * 640, Math.random() * 360, 6, 6); }
      g.fillStyle = "#fff"; g.font = "48px Arial"; g.fillText("Fotogramma " + i, 40 + i, 180);
      await src.add(i / 30, 1 / 30);
    }
    await out.finalize();
    const dt = new DataTransfer(); dt.items.add(new File([tgt.buffer], "clip.mov", { type: "video/quicktime" }));
    const input = document.getElementById("pickFiles"); input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return tgt.buffer.byteLength;
  });
  await page.waitForFunction(() => !document.getElementById("go").disabled || document.querySelector("#rows .badge.same, #rows .badge.err"), null, { timeout: 240000 });
  const est = await page.innerText("#rows .meta");
  check(/≈/.test(est) && /qualità 97/.test(est), `Video: analisi con stima e qualità (${est})`);
  await page.click("#vlvlMin");
  const est95 = await page.innerText("#rows .meta");
  check(/qualità 95/.test(est95) && est95 !== est, `Video: cambiando livello la stima si aggiorna (${est95})`);
  await page.click("#vlvlMid");
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && document.querySelector("#rows .badge:not(.wait):not(.work)"), null, { timeout: 240000 });
  await page.click("#modeBtn");
  await page.waitForSelector("#modal:not([hidden])");
  check(/Cambi modalità/.test(await page.innerText("#modalTitle")), "Video: con un file pronto, cambiare modalità chiede conferma");
  await page.click("#modalBtns button >> nth=1");
  check(await page.evaluate(() => document.body.classList.contains("mode-video") && document.querySelectorAll("#rows .row:not(.demo)").length === 1), "Video: annullando si resta in modalità video con il file pronto");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#saveAs")]);
  const { readFile: read } = await import("node:fs/promises");
  const vid = await read(await dl.path());
  const info = await page.evaluate(async (b) => {
    const M = await import("./vendor/mediabunny.min.mjs");
    const inp = new M.Input({ source: new M.BufferSource(new Uint8Array(b).buffer), formats: M.ALL_FORMATS });
    const t = await inp.getPrimaryVideoTrack(), st = await t.computePacketStats();
    return { w: t.displayWidth, h: t.displayHeight, n: st.packetCount, codec: t.codec, fmt: (await inp.getFormat()).name };
  }, [...vid]);
  check(dl.suggestedFilename() === "clip-compresso.mov" && /QuickTime|MOV/i.test(info.fmt), `Video: nome ed estensione conservati (${dl.suggestedFilename()}, ${info.fmt})`);
  check(vid.length < made * .9, `Video: da ${Math.round(made / 1024)} KB a ${Math.round(vid.length / 1024)} KB`);
  check(info.w === 640 && info.h === 360 && info.n === 120, `Video: risoluzione e fotogrammi conservati (${info.w}×${info.h}, ${info.n} fotogrammi, ${info.codec})`);
  check(errors.length === 0, `Video: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- video grandi: con ?safe=1 ogni video è «grande» e va su disco (cartella privata), download uno alla volta, pulizia all'avvio
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "?vcodec=vp9&safe=1#video");
  await page.evaluate(async () => {
    const M = await import("./vendor/mediabunny.min.mjs"), dt = new DataTransfer();
    for (const name of ["uno.mp4", "due.mp4"]) {
      const c = document.createElement("canvas"); c.width = 320; c.height = 240;
      const g = c.getContext("2d"), tgt = new M.BufferTarget(), out = new M.Output({ format: new M.Mp4OutputFormat(), target: tgt });
      const src = new M.CanvasSource(c, { codec: "vp9", bitrate: 4e6 }); out.addVideoTrack(src, { frameRate: 25 });
      await out.start();
      for (let i = 0; i < 50; i++) { g.fillStyle = `hsl(${i * 7},60%,50%)`; g.fillRect(0, 0, 320, 240); for (let k = 0; k < 200; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .4})`; g.fillRect(Math.random() * 320, Math.random() * 240, 5, 5); } await src.add(i / 25, 1 / 25); }
      await out.finalize(); dt.items.add(new File([tgt.buffer], name, { type: "video/mp4" }));
    }
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => !document.getElementById("go").disabled, null, { timeout: 240000 });
  check(/si perde/.test(await page.innerText("#rows")), "Video grandi: la scheda avvisa che senza salvare il risultato si perde");
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && !document.getElementById("total").hidden, null, { timeout: 240000 });
  const tmp = await page.evaluate(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle("schiaccia-tmp"); const n = []; for await (const k of d.keys()) n.push(k); return n.length; });
  check(tmp === 2, `Video grandi: risultati scritti su disco nella cartella privata (${tmp} file)`);
  check(/uno alla volta/.test(await page.innerText("#saveElse")), `Video grandi: niente ZIP, «${await page.innerText("#saveElse")}»`);
  const names = [], dls = [];
  page.on("download", (d) => { names.push(d.suggestedFilename()); dls.push(d); });
  await page.click("#saveElse");
  await page.waitForFunction(() => document.querySelectorAll("#rows .row:not(.demo)").length === 0, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  check(names.length === 2 && names.every((n) => /\.mp4$/.test(n)), `Video grandi: scaricati uno alla volta (${names.join(", ")})`);
  const { readFile: readV } = await import("node:fs/promises");
  const big = await readV(await dls[0].path());
  const n = await page.evaluate(async (b) => { const M = await import("./vendor/mediabunny.min.mjs"); const t = await new M.Input({ source: new M.BufferSource(new Uint8Array(b).buffer), formats: M.ALL_FORMATS }).getPrimaryVideoTrack(); return (await t.computePacketStats()).packetCount; }, [...big]);
  check(n === 50, `Video grandi: il file scritto su disco è completo (${n} fotogrammi su 50)`);
  await page.reload(); await page.waitForTimeout(1500);
  const left = await page.evaluate(async () => { try { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle("schiaccia-tmp"); const n = []; for await (const k of d.keys()) n.push(k); return n.length; } catch { return 0; } });
  check(left === 0, `Video grandi: cartella privata svuotata alla riapertura (${left} file rimasti)`);
  check(errors.length === 0, `Video grandi: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- Cattura: verbo nel titolo, schermata propria (A al telefono, B al computer), due pagine in un PDF, foto in JPG
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url);
  const photo = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 1600; c.height = 1200;
    const g = c.getContext("2d"); g.fillStyle = "#544030"; g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = "#efe9dc"; g.fillRect(200, 100, 1200, 1000); g.fillStyle = "#222"; g.font = "40px Arial";
    for (let i = 0; i < 12; i++) g.fillText("Riga " + (i + 1), 260, 200 + i * 70);
    return [...new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", .9))).arrayBuffer())];
  }));
  const shot = async (trigger) => { const [fc] = await Promise.all([page.waitForEvent("filechooser"), trigger()]); await fc.setFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: photo }); };
  const icons = () => page.evaluate(() => [...document.querySelectorAll("#camBtn svg")].filter((x) => getComputedStyle(x).display !== "none").map((x) => x.getAttribute("class")).join(","));
  check(await icons() === "i-cam", `Cattura: in Schiaccia il pulsante mostra solo la fotocamera (${await icons()})`);
  await page.click("#camBtn");
  check(await icons() === "i-squash", `Cattura: in Cattura mostra solo l'icona della compressione (${await icons()})`);
  check(await page.evaluate(() => document.body.classList.contains("act-cap") && getComputedStyle(document.getElementById("go")).display === "none" && !!document.querySelector("#capture .capBig")), "Cattura: la fotocamera apre la schermata Cattura (passi 1-2-3 al telefono)");
  check(/Cattura/.test(await page.innerText("#title")), `Cattura: il verbo del titolo cambia (${(await page.innerText("#title")).replace(/\s+/g, " ")})`);
  await shot(() => page.click("#capture .capBig .btn.go"));
  await page.waitForSelector("#scanner:not([hidden])");
  check(await page.locator("#scanSvg .hit").count() === 8 && await page.locator("#scanSvg .mesh").count() === 1, "Cattura: editor con angoli, maniglie dei lati e reticolato");
  await page.click("#scanOk");
  await page.waitForSelector("#capture .thumb", { timeout: 30000 });
  await shot(() => page.click("#capture .add"));
  await page.waitForSelector("#scanner:not([hidden])"); await page.click("#scanOk");
  await page.waitForFunction(() => document.querySelectorAll("#capture .thumb").length === 2 && document.getElementById("loader").hidden, null, { timeout: 30000 });
  check(await page.locator("#capture .tools button").count() === 6, "Cattura: strumenti della pagina selezionata (ruota, bordi, rifai, sposta, elimina)");
  await page.click("#capture .tools button >> nth=0");
  await page.waitForFunction(() => document.getElementById("loader").hidden && document.querySelectorAll("#capture .thumb").length === 2, null, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("#capture .thumb img")].every((i) => i.complete && i.naturalWidth));
  const dims = await page.evaluate(() => [...document.querySelectorAll("#capture .thumb img")].map((i) => i.naturalWidth > i.naturalHeight));
  check(dims.length === 2 && dims[0] !== dims[1], `Cattura: «Ruota» gira solo la pagina selezionata (${dims})`);
  await page.click("#capture .seg.sm button >> nth=2");
  await page.waitForFunction(() => document.getElementById("loader").hidden && !!document.querySelector("#capture .thumb .chip"), null, { timeout: 30000 });
  check(true, "Cattura: stile proprio della pagina (B/N) segnato sulla miniatura");
  await page.click("#modeBtn");
  check(await page.evaluate(() => document.body.classList.contains("mode-jpg") && document.querySelectorAll("#capture .thumb").length === 2), "Cattura: passando a JPG le pagine restano");
  await page.click("#modeBtn");
  check(await page.evaluate(() => !document.body.classList.contains("mode-jpg") && !document.body.classList.contains("mode-video")), "Cattura: il rullo alterna solo PDF e JPG");
  await page.setViewportSize({ width: 1000, height: 900 }); await page.waitForTimeout(300);
  check(await page.locator("#capture .grid .card").count() === 2 && await page.locator("#capture .dock").count() === 1, "Cattura: al computer griglia di schede e barra in basso");
  await page.setViewportSize({ width: 400, height: 860 }); await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#capture .btn.ok")]);
  const { readFile: read } = await import("node:fs/promises");
  const pdf = await read(await dl.path());
  const pages = await page.evaluate(async (b) => (await PDFLib.PDFDocument.load(new Uint8Array(b))).getPageCount(), [...pdf]);
  check(/\.pdf$/.test(dl.suggestedFilename()) && pages === 2, `Cattura: PDF di ${pages} pagine salvato (${dl.suggestedFilename()})`);
  check(await page.locator("#capture .thumb").count() === 0, "Cattura: dopo il salvataggio la schermata si svuota");
  await shot(() => page.click("#capture .capBig .btn.go"));
  await page.waitForSelector("#scanner:not([hidden])"); await page.click("#scanOk");
  await page.waitForSelector("#capture .thumb", { timeout: 30000 });
  await page.click("#actBtn");
  await page.waitForSelector("#modal:not([hidden])");
  check(true, "Cattura: tornare a Schiaccia con pagine non salvate chiede conferma");
  await page.click("#modalBtns button >> nth=0");
  check(await page.evaluate(() => !document.body.classList.contains("act-cap") && getComputedStyle(document.getElementById("go")).display !== "none"), "Cattura: confermando si torna a Schiaccia");
  await page.click("#modeBtn"); await page.click("#modeBtn");
  await page.click("#actBtn", { force: true });
  check(await page.evaluate(() => document.body.classList.contains("mode-video") && !document.body.classList.contains("act-cap")), "Cattura: in modalità video il verbo non cambia");
  check(errors.length === 0, `Cattura: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- Cattura: orientamento (Tesseract), raddrizzamento del testo, calamita e controllo dei bordi (R-SCN-20…24)
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 500, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  const reqs = [];
  ctx.on("request", (r) => reqs.push(r.url()));
  await page.goto(url);
  await page.waitForTimeout(500);
  const heavy = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /jszip|mediabunny|tesseract/.test(n)).concat(window.JSZip ? ["JSZip"] : []));
  check(heavy.length === 0, `Caricamento pigro: all'avvio niente JSZip, Mediabunny né Tesseract${heavy.length ? " → " + heavy.join(", ") : ""}`);
  // foto: foglio con il testo capovolto e stampato storto di 3°, in prospettiva su un tavolo scuro
  const photo = Buffer.from(await page.evaluate(async () => {
    const d = I18N.it, PW = 840, PH = 1188, pg = document.createElement("canvas"); pg.width = PW; pg.height = PH; const g = pg.getContext("2d");
    g.fillStyle = "#f4f0e6"; g.fillRect(0, 0, PW, PH);
    const tx = document.createElement("canvas"); tx.width = PW; tx.height = PH; const t = tx.getContext("2d"); t.fillStyle = "#1a1a1a"; t.font = "24px serif";
    const words = [d.whatBody, d.whatBodyJ, d.whatBodyV, d.whatBody].join(" ").replace(/<[^>]+>/g, "").split(/\s+/); let line = "", y = 90;
    for (const w of words) { const s = line ? line + " " + w : w; if (t.measureText(s).width > PW - 160) { t.fillText(line, 80, y); y += 38; line = w; if (y > PH - 90) break } else line = s }
    g.save(); g.translate(PW / 2, PH / 2); g.rotate(183 * Math.PI / 180); g.drawImage(tx, -PW / 2, -PH / 2); g.restore();
    const c = document.createElement("canvas"); c.width = 1500; c.height = 2000; const G = c.getContext("2d"); G.fillStyle = "#4b3a2a"; G.fillRect(0, 0, 1500, 2000);
    const Q = [[230, 260], [1270, 300], [1310, 1760], [170, 1720]];
    for (let r = 0; r < PH; r++) { const v = r / PH, L = [Q[0][0] + (Q[3][0] - Q[0][0]) * v, Q[0][1] + (Q[3][1] - Q[0][1]) * v], R = [Q[1][0] + (Q[2][0] - Q[1][0]) * v, Q[1][1] + (Q[2][1] - Q[1][1]) * v]; G.save(); G.translate(L[0], L[1]); G.rotate(Math.atan2(R[1] - L[1], R[0] - L[0])); G.drawImage(pg, 0, r, PW, 1, 0, 0, Math.hypot(R[0] - L[0], R[1] - L[1]), 2.2); G.restore(); }
    return [...new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", .9))).arrayBuffer())];
  }));
  await page.click("#camBtn");
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#capture .capBig .btn.go")]);
  await fc.setFiles({ name: "foglio.jpg", mimeType: "image/jpeg", buffer: photo });
  await page.waitForSelector("#scanner:not([hidden])");
  const W = 1500, H = 2000;
  const corner = (i) => page.evaluate((i) => { const c = document.querySelectorAll("#scanSvg circle.handle")[i]; return [+c.getAttribute("cx"), +c.getAttribute("cy")]; }, i);
  async function drag(i, x, y) {
    const r = await page.evaluate(() => { const b = document.getElementById("scanSvg").getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    const [cx, cy] = await corner(i), sx = (v) => r[0] + v / W * r[2], sy = (v) => r[1] + v / H * r[3];
    await page.mouse.move(sx(cx), sy(cy)); await page.mouse.down(); await page.mouse.move(sx(x), sy(y), { steps: 8 }); await page.mouse.up();
    return corner(i);
  }
  const snapped = await drag(0, 262, 238);
  check(Math.hypot(snapped[0] - 230, snapped[1] - 260) < 15, `Bordi: calamita, angolo lasciato a 39 px dal vero e agganciato a ${snapped.map((v) => v.toFixed(0))} (vero 230,260)`);
  await drag(1, 1420, 190);
  await page.click("#scanOk");
  await page.waitForFunction(() => document.querySelectorAll("#capture .thumb").length === 1 && document.getElementById("loader").hidden, null, { timeout: 120000 });
  const out = await page.evaluate(async () => {
    const im = document.querySelector("#capture .thumb img"); await new Promise((r) => (im.complete && im.naturalWidth ? r() : (im.onload = r)));
    const bmp = await createImageBitmap(await (await fetch(im.src)).blob()), c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext("2d"); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, dark = 0;
    const bw = Math.round(c.width * .03), bh = Math.round(c.height * .03);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (x < bw || y < bh || x >= c.width - bw || y >= c.height - bh) { n++; if (d[(y * c.width + x) * 4] < 110) dark++; }
    const base = new URL("vendor/tesseract/", location.href).href;
    const w = await Tesseract.createWorker("osd", 0, { workerPath: base + "worker.min.js", corePath: base + "tesseract-core-simd.wasm.js", langPath: base.replace(/\/$/, ""), legacyCore: true, legacyLang: true, cacheMethod: "none", workerBlobURL: false });
    const r = (await w.detect(c)).data; await w.terminate();
    return { dark: dark / n * 100, deg: r.orientation_degrees, conf: r.orientation_confidence };
  });
  check(out.dark < 10, `Bordi: angolo lasciato nello sfondo corretto dal controllo (sfondo nel bordo della pagina: ${out.dark.toFixed(1)}%)`);
  check(out.deg === 0 && out.conf > 2, `Orientamento: foglio capovolto girato dritto (residuo ${out.deg}°, fiducia ${out.conf && out.conf.toFixed(1)})`);
  check(!reqs.some((u) => /lang\/\w+\.traineddata/.test(u)), "Caricamento pigro: prima del salvataggio nessun dato di lingua scaricato");
  check(await page.locator("#ocrText").isChecked(), "PDF ricercabile: casella accesa all'inizio");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("#capture .btn.ok")]);
  const { readFile: readP } = await import("node:fs/promises");
  const pdfB = await readP(await dl.path());
  const font = await page.evaluate(async (b) => {
    const P = PDFLib, doc = await P.PDFDocument.load(new Uint8Array(b)), res = doc.getPage(0).node.Resources(), xo = res.lookup(P.PDFName.of("XObject")), names = [];
    for (const [, ref] of xo.entries()) { const st = doc.context.lookup(ref), r2 = st.dict.lookup(P.PDFName.of("Resources")), f = r2 && r2.lookup(P.PDFName.of("Font")); if (f) for (const [, fr] of f.entries()) names.push(String(doc.context.lookup(fr).lookup(P.PDFName.of("BaseFont")))); }
    return names.join(",");
  }, [...pdfB]);
  check(/GlyphLess/.test(font), `PDF ricercabile: livello di testo invisibile sopra la pagina (carattere ${font || "assente"})`);
  const langs = reqs.filter((u) => /lang\/\w+\.traineddata/.test(u)).map((u) => u.split("/").pop());
  check(langs.length === 1 && /^ita\./.test(langs[0]), `Caricamento pigro: al salvataggio scaricata solo la lingua che serve (${langs.join(", ")})`);
  check(errors.length === 0, `Orientamento e bordi: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} controlli falliti` : "\nTutto a posto");
process.exit(failed ? 1 : 0);

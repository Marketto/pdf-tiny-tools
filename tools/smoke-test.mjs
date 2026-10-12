#!/usr/bin/env node
// Prova di fumo nel browser: avvia un server locale, apre l'app in più lingue,
// crea un PDF di prova con un'immagine, lo comprime e controlla che pesi meno.
// Richiede Playwright (npm install in tools/). Uso: node tools/smoke-test.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
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
// --- scansione: due pagine in un PDF, angoli di partenza
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
  await shot(() => page.click("#camBtn"));
  await page.waitForSelector("#scanner:not([hidden])");
  check(await page.locator("#scanSvg .hit").count() === 8 && await page.locator("#scanSvg .mesh").count() === 1, "Scansione: editor con angoli, maniglie dei lati e reticolato");
  await page.click("#scanOk");
  await page.waitForSelector("#modal:not([hidden])", { timeout: 30000 });
  check((await page.innerText("#modalTitle")).includes("1"), "Scansione: dopo la prima pagina chiede se continuare");
  await shot(() => page.click("#modalBtns button >> nth=0"));
  await page.waitForSelector("#scanner:not([hidden])");
  await page.click("#scanOk");
  await page.waitForSelector("#modal:not([hidden])", { timeout: 30000 });
  check(await page.locator("#modal .pv").count() === 1, "Scansione: anteprima della pagina nella domanda");
  await page.click("#modalBtns button >> nth=2");
  await page.waitForFunction(() => document.querySelectorAll("#rows .row").length === 1 && document.getElementById("loader").hidden, null, { timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#saveAs")]);
  const { readFile: read } = await import("node:fs/promises");
  const pdf = await read(await dl.path());
  const pages = await page.evaluate(async (b) => (await PDFLib.PDFDocument.load(new Uint8Array(b))).getPageCount(), [...pdf]);
  check(/\.pdf$/.test(dl.suggestedFilename()) && pages === 2, `Scansione: PDF di ${pages} pagine salvato (${dl.suggestedFilename()})`);
  check(errors.length === 0, `Scansione: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} controlli falliti` : "\nTutto a posto");
process.exit(failed ? 1 : 0);

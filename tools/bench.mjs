#!/usr/bin/env node
// Misura i tempi delle operazioni pesanti, per confrontare prima e dopo un'ottimizzazione.
// Stessi file di prova a ogni giro (creati nella pagina con un seme fisso). Uso: node tools/bench.mjs [etichetta]
// Le misure interne vengono da ?perf=1 (window.__perf in index.html).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "") || "index.html";
  try { res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" }).end(await readFile(join(root, path))); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const label = process.argv[2] || "misura";
const out = {};

async function open(hash) {
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 } });
  await ctx.addInitScript(() => { let s = 12345; window.rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; try { localStorage.setItem("bg", "0"); } catch {} for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  const page = await ctx.newPage();
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "?perf=1&vcodec=vp9" + hash);
  await page.waitForTimeout(400);
  return { ctx, page };
}
// rumore con seme fisso, così i file di prova sono identici a ogni giro
const NOISE = "";
const sum = (page, l) => page.evaluate((l) => window.__perf.filter((x) => x[0] === l).reduce((a, x) => a + x[1], 0), l);

// --- PDF: 2 file con 6 immagini JPEG 2000×1500 ciascuno
{
  const { ctx, page } = await open("");
  await page.evaluate(async (NOISE) => {
    const dt = new DataTransfer();
    for (let f = 0; f < 2; f++) {
      const doc = await PDFLib.PDFDocument.create();
      for (let k = 0; k < 6; k++) {
        const c = document.createElement("canvas"); c.width = 2000; c.height = 1500; const g = c.getContext("2d"), d = g.createImageData(2000, 1500);
        for (let i = 0; i < d.data.length; i += 4) { const v = (i / 4 % 2000) / 9 + rnd() * 80; d.data[i] = v; d.data[i + 1] = 200 - v / 2; d.data[i + 2] = v / 3; d.data[i + 3] = 255; }
        g.putImageData(d, 0, 0);
        const img = await doc.embedJpg(new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", .95))).arrayBuffer()));
        doc.addPage([600, 450]).drawImage(img, { x: 0, y: 0, width: 600, height: 450 });
      }
      dt.items.add(new File([await doc.save()], `prova${f}.pdf`, { type: "application/pdf" }));
    }
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  }, NOISE);
  const t0 = Date.now(); await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && !document.getElementById("total").hidden, null, { timeout: 300000 });
  out["PDF: 2 file × 6 immagini (s)"] = (Date.now() - t0) / 1000;
  await ctx.close();
}
// --- JPG: 6 foto 4000×3000, lato 1920, peso 500 KB
{
  const { ctx, page } = await open("#jpg");
  await page.evaluate(async (NOISE) => {
    const dt = new DataTransfer();
    for (let f = 0; f < 6; f++) {
      const c = document.createElement("canvas"); c.width = 4000; c.height = 3000; const g = c.getContext("2d"), d = g.createImageData(4000, 3000);
      for (let i = 0; i < d.data.length; i += 4) { const v = (i / 4 % 4000) / 18 + rnd() * 90; d.data[i] = v; d.data[i + 1] = 255 - v; d.data[i + 2] = v / 2; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
      dt.items.add(new File([await new Promise((r) => c.toBlob(r, "image/jpeg", .92))], `foto${f}.jpg`, { type: "image/jpeg" }));
    }
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  }, NOISE);
  const t0 = Date.now(); await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && !document.getElementById("total").hidden, null, { timeout: 300000 });
  out["JPG: 6 foto 4000×3000 (s)"] = (Date.now() - t0) / 1000;
  await ctx.close();
}
// --- Scansione: 3 foto dalla galleria; si misurano raddrizzamento e pulizia (senza Tesseract)
{
  const { ctx, page } = await open("");
  const photo = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 1500; c.height = 2000; const g = c.getContext("2d");
    g.fillStyle = "#4b3a2a"; g.fillRect(0, 0, 1500, 2000); g.fillStyle = "#efe9dc"; g.beginPath(); g.moveTo(230, 260); g.lineTo(1270, 300); g.lineTo(1310, 1760); g.lineTo(170, 1720); g.fill();
    g.fillStyle = "#222"; g.font = "36px serif"; for (let i = 0; i < 30; i++) g.fillText("Riga di testo numero " + i + " della pagina di prova", 280, 380 + i * 44);
    return [...new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", .9))).arrayBuffer())];
  }));
  await page.click("#camBtn");
  await page.setInputFiles("#galInput", [1, 2, 3].map((i) => ({ name: `f${i}.jpg`, mimeType: "image/jpeg", buffer: photo })));
  await page.waitForFunction(() => document.querySelectorAll("#capture .thumb").length === 3 && document.getElementById("loader").hidden, null, { timeout: 300000 });
  out["Scansione: raddrizzamento, 3 pagine (s)"] = (await sum(page, "warp")) / 1000;
  out["Scansione: pulizia, 3 pagine (s)"] = (await sum(page, "enhance")) / 1000;
  await ctx.close();
}
// --- Video: analisi di un video VP9 640×360 di 4 s (codifica di prova con VP9 software)
{
  const { ctx, page } = await open("#video");
  await page.evaluate(async (NOISE) => {
    const M = await import("./vendor/mediabunny.min.mjs");
    const c = document.createElement("canvas"); c.width = 640; c.height = 360;
    const g = c.getContext("2d"), tgt = new M.BufferTarget(), o = new M.Output({ format: new M.Mp4OutputFormat(), target: tgt });
    const src = new M.CanvasSource(c, { codec: "vp9", bitrate: 6e6 }); o.addVideoTrack(src, { frameRate: 30 });
    await o.start();
    for (let i = 0; i < 120; i++) { g.fillStyle = `hsl(${i * 3},70%,55%)`; g.fillRect(0, 0, 640, 360); for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * .4})`; g.fillRect(rnd() * 640, rnd() * 360, 6, 6); } await src.add(i / 30, 1 / 30); }
    await o.finalize();
    const dt = new DataTransfer(); dt.items.add(new File([tgt.buffer], "clip.mp4", { type: "video/mp4" }));
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  }, NOISE);
  await page.waitForFunction(() => window.__perf.some((x) => x[0] === "probe"), null, { timeout: 300000 });
  out["Video: analisi di 4 s di video (s)"] = (await sum(page, "probe")) / 1000;
  out["Video: stima"] = await page.innerText("#rows .meta");
  await ctx.close();
}
await browser.close(); server.close();
console.log(`\n${label}`);
for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${typeof v === "number" ? v.toFixed(2) : v}`);

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
    const done = await page.locator("#rows .btn.sm").count();
    check(done === 1, `compressione: PDF di prova da ${Math.round(size / 1024)} KB alleggerito (${(await page.innerText("#rows")).replace(/\n/g, " / ")})`);
  }
  check(errors.length === 0, `${locale}: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failed ? `\n${failed} controlli falliti` : "\nTutto a posto");
process.exit(failed ? 1 : 0);

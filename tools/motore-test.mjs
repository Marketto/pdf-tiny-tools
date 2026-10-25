#!/usr/bin/env node
// Prova di motore.js da solo (R-APP-20): una pagina che carica solo config.js e motore.js comprime
// una foto, un PDF e un video con Motore.squeeze. Uso: node tools/motore-test.mjs (Playwright in tools/).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try { res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" }).end(await readFile(join(root, path))); }
  catch { res.writeHead(404).end(); }
}).listen(0);
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const errors = [], reqs = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => reqs.push(new URL(r.url()).pathname));
await page.goto(`http://localhost:${server.address().port}/tools/motore-test.html?vcodec=vp9`);
const r = await page.evaluate(() => window.runTest());
let failed = 0;
const check = (ok, what) => { console.log((ok ? "✓ " : "✗ ") + what); if (!ok) failed++; };
const num = (s, i) => +s.split(" ")[i];
check(r.api === "canVideo,internal,kindOf,levels,onPerf,setBase,squeeze,version", `API: ${r.api}`);
check(r.kinds === "pdf,jpg,video,", `kindOf: ${r.kinds}`);
check(r.jpg.startsWith("done") && num(r.jpg, 2) < num(r.jpg, 1) && num(r.jpg, 3) === 100, `Foto alleggerita, avanzamento fino a 100: ${r.jpg}`);
check(r.pdf.startsWith("done") && num(r.pdf, 2) < num(r.pdf, 1) && /application\/pdf/.test(r.pdf), `PDF alleggerito: ${r.pdf}`);
check(r.canVideo && /^(done|same) /.test(r.video), `Video misurato e ricodificato: ${r.video}`);
check(r.abort === "err aborted", `Annullato con signal: ${r.abort}`);
check(r.bad === "err", `File rotto: ${r.bad}`);
check(reqs.every((p) => /^\/(tools\/motore-test\.html|config\.js|motore\.js|engine\.js|vendor\/)/.test(p)), `Carica solo i propri file: ${[...new Set(reqs)].join(" ")}`);
check(!errors.length, `Nessun errore JavaScript ${errors.join(" | ")}`);
await browser.close(); server.close();
console.log(failed ? `\n${failed} problemi` : "\nTutto a posto");
process.exit(failed ? 1 : 0);

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
// la domanda sul lavoro in secondo piano (R-APP-06) è già risposta «no» in tutte le prove, tranne quella che la prova
const newContext = browser.newContext.bind(browser);
browser.newContext = async (o = {}) => { const c = await newContext(o); if (!o.askBg) await c.addInitScript(() => { try { if (localStorage.getItem("bg") === null) localStorage.setItem("bg", "0"); } catch {} }); return c; };
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
// --- secondo piano: domanda la prima volta, audio e riquadro del lettore con l'avanzamento durante il lavoro (R-APP-05…07)
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 }, askBg: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "#jpg");
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    for (let k = 0; k < 4; k++) {
      const c = document.createElement("canvas"); c.width = 3000; c.height = 2000; const g = c.getContext("2d"), d = g.createImageData(3000, 2000);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = v; d.data[i + 1] = 255 - v; d.data[i + 2] = v / 2; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0); dt.items.add(new File([await new Promise((r) => c.toBlob(r, "image/jpeg", .95))], `f${k}.jpg`, { type: "image/jpeg" }));
    }
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.click("#go");
  await page.waitForSelector("#modal:not([hidden])");
  check(/fuori dall'app/.test(await page.innerText("#modalTitle")), "Secondo piano: la prima volta chiede se continuare fuori dall'app");
  await page.click("#modalBtns button >> nth=0");
  const seen = await page.waitForFunction(() => navigator.mediaSession && navigator.mediaSession.playbackState === "playing" && navigator.mediaSession.metadata && /Schiaccio \d+ di 4/.test(navigator.mediaSession.metadata.title) && navigator.mediaSession.metadata.title, null, { timeout: 60000, polling: 50 }).then((h) => h.jsonValue()).catch(() => "");
  check(!!seen, `Secondo piano: durante il lavoro il riquadro del lettore mostra l'avanzamento (${seen || "assente"})`);
  // schermata di lavoro (R-APP-10): pressa, Caramella e pulsanti; niente più «Schiaccia subito»
  const wk = await page.evaluate(() => { const w = document.getElementById("work"); return !w.hidden && !document.getElementById("opSq").hidden && document.getElementById("opAn").hidden && !document.getElementById("workNow") && document.getElementById("pillSq").innerText.replace(/\n/g, " "); });
  check(/\d+%.*di 4/.test(wk || ""), `Lavoro: schermata con la pressa e la Caramella durante la compressione (${wk || "assente"})`);
  check(await page.evaluate(() => { const b = [...document.querySelectorAll("#workActs .btn")].filter((x) => !x.hidden); return b.length === 2 && Math.abs(b[0].offsetWidth - b[1].offsetWidth) < 2 && b[1].classList.contains("danger"); }), "Lavoro: «Metti in pausa» e «Annulla» (rosso) larghi uguale");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy"), null, { timeout: 120000 });
  check(await page.evaluate(() => localStorage.getItem("bg") === "1" && navigator.mediaSession.playbackState === "none"), "Secondo piano: risposta ricordata, audio spento a lavoro finito");
  check(await page.evaluate(() => document.getElementById("work").hidden && !document.getElementById("app").inert), "Lavoro: a lavoro finito la schermata sparisce");
  check(await page.evaluate(() => !document.getElementById("bgRow").hidden && /continuo/.test(document.getElementById("bgState").textContent)), "Secondo piano: la riga in fondo dice cosa succede fuori dall'app");
  await page.evaluate(() => document.getElementById("bgChange").click());
  check(await page.waitForSelector("#modal:not([hidden])", { timeout: 3000 }).then(() => true, () => false), "Secondo piano: «Cambia» ripropone la domanda");
  await page.click("#modalBtns button >> nth=1");
  check(await page.waitForFunction(() => /mi fermo/.test(document.getElementById("bgState").textContent), null, { timeout: 4000 }).then(() => true, () => false), "Secondo piano: rispondendo «No» la riga si aggiorna");
  check(errors.length === 0, `Secondo piano: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- pausa e ripresa (R-APP-10…13): pausa durante la compressione, lavoro ritrovato all'avvio, ripresa con gli stessi file, annulla
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "?workers=1#jpg");
  const b64 = await page.evaluate(async () => {
    const out = [];
    for (let k = 0; k < 6; k++) {
      const c = document.createElement("canvas"); c.width = 3000; c.height = 2000; const g = c.getContext("2d"), d = g.createImageData(3000, 2000);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = v; d.data[i + 1] = 255 - v; d.data[i + 2] = v / 2; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
      const bl = await new Promise((r) => c.toBlob(r, "image/jpeg", .95));
      out.push(await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); }));
    }
    return out;
  });
  const load = () => page.evaluate(async (b64) => {
    const dt = new DataTransfer();
    for (let k = 0; k < b64.length; k++) { const bl = await (await fetch(b64[k])).blob(); dt.items.add(new File([bl], `p${k}.jpg`, { type: "image/jpeg", lastModified: 1700000000000 + k })); }
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  }, b64);
  await load(); await page.waitForTimeout(300);
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("work").hidden && document.querySelector("#rows .badge:not(.wait):not(.work)"), null, { timeout: 120000 }).catch(() => {});
  const doneBefore = await page.evaluate(() => [...document.querySelectorAll("#rows .row")].filter((r) => /−\d/.test(r.innerText)).length);
  await page.click("#workPause");
  await page.waitForFunction(() => document.getElementById("work").hidden && !document.querySelector("#rows .row:not(.demo)"), null, { timeout: 60000 });
  check(/In pausa/.test(await page.innerText("#msg")), `Pausa: «Metti in pausa» ferma e svuota (${await page.innerText("#msg")})`);
  await page.reload(); await page.waitForTimeout(1500);
  const jt = await page.isVisible("#modal") && await page.innerText("#modalTitle");
  check(/lavori in pausa/.test(jt || ""), "Pausa: all'avvio la finestra elenca i lavori in pausa");
  const paused = +(((await page.innerText("#modalBody")).match(/(\d+) di 6 schiacciati/) || [])[1] || -1);
  check(paused >= doneBefore, `Pausa: il lavoro dice a che punto era (${(await page.innerText("#modalBody")).split("\n").slice(-3).join(" ")})`);
  await page.click("#modalBody .jgo");
  check(/scegli di nuovo/.test(await page.innerText("#msg")) && await page.evaluate(() => document.body.classList.contains("mode-jpg")), "Pausa: «Riprendi» riporta la modalità e chiede di riscegliere i file");
  await load(); await page.waitForTimeout(800);
  const msg = await page.innerText("#msg");
  const restored = await page.evaluate(() => [...document.querySelectorAll("#rows .row")].filter((r) => /−\d/.test(r.innerText)).length);
  check(/Ripreso/.test(msg) && /ritrovati 6/.test(msg) && restored === paused, `Pausa: ripresa con i file già schiacciati (${msg} · pronti ${restored} come nel lavoro in pausa)`);
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && !document.getElementById("total").hidden, null, { timeout: 180000 });
  check(/6 su 6/.test(await page.innerText("#msg")), `Pausa: dopo la ripresa il lavoro si completa senza rifare i pronti (${await page.innerText("#msg")})`);
  // annulla con file pronti: chiede conferma e svuota
  await page.evaluate(() => document.getElementById("jlvlHard").click());
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("work").hidden, null, { timeout: 30000 });
  await page.click("#workCancel");
  const asked = await page.waitForSelector("#modal:not([hidden])", { timeout: 3000 }).then(() => true, () => false);
  if (asked) await page.click("#modalBtns .danger");
  await page.waitForFunction(() => document.getElementById("work").hidden && !document.querySelector("#rows .row:not(.demo)"), null, { timeout: 60000 });
  check(/annullato/.test(await page.innerText("#msg")), `Annulla: ferma e svuota${asked ? " dopo la conferma" : ""} (${await page.innerText("#msg")})`);
  await page.reload(); await page.waitForTimeout(1500);
  check(!(await page.isVisible("#modal")), "Pausa: dopo il salvataggio o l'annullamento il lavoro non resta tra quelli in pausa");
  check(errors.length === 0, `Pausa e ripresa: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- pulizia all'avvio (R-APP-15): analisi di un formato vecchio e file privati senza lavoro vengono proposti e cancellati
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url); await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    await new Promise((res) => { const r = indexedDB.open("schiaccia", 2); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("vprobe")) d.createObjectStore("vprobe"); if (!d.objectStoreNames.contains("jobs")) d.createObjectStore("jobs"); };
      r.onsuccess = () => { const tx = r.result.transaction(["vprobe", "jobs"], "readwrite"); tx.objectStore("vprobe").put({ ver: "1", v: {} }, "vecchia"); tx.objectStore("vprobe").put({ ver: "2", v: {} }, "buona"); tx.objectStore("jobs").put({ id: "jok", t: Date.now(), mode: "pdf", name: "ok", files: [], set: {} }, "jok"); tx.oncomplete = () => { r.result.close(); res(); }; }; });
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle("vecchia-cartella", { create: true }); const w = await (await d.getFileHandle("x.bin", { create: true })).createWritable(); await w.write(new Uint8Array(200000)); await w.close();
  });
  await page.reload(); await page.waitForTimeout(1600);
  const tt = await page.isVisible("#modal") && await page.innerText("#modalTitle");
  const tb = tt ? await page.innerText("#modalBody") : "";
  check(tt === "Pulizia" && /analisi video: 1/.test(tb) && /file temporanei: 1/.test(tb) && !/lavori in pausa/.test(tb), `Pulizia: all'avvio propone solo i dati non più utilizzabili (${tb.replace(/\n/g, " ")})`);
  if (tt === "Pulizia") await page.click("#modalBtns .danger");
  await page.waitForTimeout(800);
  check(/lavori in pausa/.test(await page.isVisible("#modal") && await page.innerText("#modalTitle") || ""), "Pulizia: dopo, il lavoro in pausa ancora valido viene proposto come sempre");
  const left = await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const n = []; for await (const e of root.values()) n.push(e.name); return n.join(); });
  check(!/vecchia-cartella/.test(left), "Pulizia: i file privati senza lavoro sono stati cancellati");
  check(errors.length === 0, `Pulizia: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- niente da risparmiare (R-LST-05): con «Carezza» un PDF già leggero non cambia, l'app propone «Stretta» e la rifà
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url); await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById("lvlSoft").click());
  await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 1600; c.height = 1200; const g = c.getContext("2d");
    for (let y = 0; y < 1200; y += 40) for (let x = 0; x < 1600; x += 40) { g.fillStyle = `hsl(${(x + y) % 360},60%,${40 + (x * y) % 30}%)`; g.fillRect(x, y, 40, 40); }
    const jb = await new Promise((r) => c.toBlob(r, "image/jpeg", .55));
    const doc = await PDFLib.PDFDocument.create(); const img = await doc.embedJpg(new Uint8Array(await jb.arrayBuffer())); doc.addPage([800, 600]).drawImage(img, { x: 0, y: 0, width: 800, height: 600 });
    const dt = new DataTransfer(); dt.items.add(new File([await doc.save()], "leggero.pdf", { type: "application/pdf" }));
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.click("#go");
  const shown = await page.waitForFunction(() => !document.getElementById("modal").hidden && /non si risparmia/.test(document.getElementById("modalTitle").textContent), null, { timeout: 60000 }).then(() => true, () => false);
  const txt = shown ? await page.innerText("#modalBody") : "";
  check(shown && /Stretta/.test(txt), `Suggerimento: niente da risparmiare con «Carezza», propone «Stretta» (${txt || (await page.innerText("#rows")).replace(/\n/g, " / ")})`);
  if (shown) {
    await page.click("#modalBtns .ok");
    await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && document.querySelector('input[name="lvl"]:checked').value === "mid" && document.querySelector("#rows .badge:not(.wait):not(.work)"), null, { timeout: 60000 }).catch(() => {});
    check(await page.evaluate(() => document.querySelector('input[name="lvl"]:checked').value === "mid"), `Suggerimento: «Passa a» cambia livello e rifà la compressione (${(await page.innerText("#rows")).replace(/\n/g, " / ")})`);
  }
  check(errors.length === 0, `Suggerimento: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- titolo: stessa grandezza nelle tre modalità, versione sulla stessa riga anche a 360 px (R-UI-04/06)
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 360, height: 760 } });
  const page = await ctx.newPage();
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url);
  const sizes = [], rows = [];
  for (let k = 0; k < 4; k++) {
    await page.waitForTimeout(700);
    sizes.push(await page.evaluate(() => getComputedStyle(document.getElementById("title")).fontSize));
    rows.push(await page.evaluate(() => { const a = document.getElementById("title").getBoundingClientRect(), v = document.getElementById("ver").getBoundingClientRect(); return v.top < a.bottom && v.bottom > a.top && a.height < parseFloat(getComputedStyle(document.getElementById("title")).fontSize) * 1.5; }));
    await page.click("#modeBtn");
  }
  check(new Set(sizes).size === 1, `Titolo: stessa grandezza in PDF, JPG, VIDEO e TUTTO (${sizes.join(", ")})`);
  check(rows.every(Boolean), "Titolo: titolo, modalità e versione su una riga a 360 px");
  await ctx.close();
}
// --- motore senza worker (?workers=0): lo stesso engine.js gira nella pagina (R-APP-09)
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { window.__workers = 0; const W = window.Worker; window.Worker = function (u, o) { window.__workers++; return new W(u, o); }; });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "?workers=0#jpg");
  await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 2400; c.height = 1600; const g = c.getContext("2d"), d = g.createImageData(2400, 1600);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    const dt = new DataTransfer(); dt.items.add(new File([await new Promise((r) => c.toBlob(r, "image/jpeg", .95))], "a.jpg", { type: "image/jpeg" }));
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && !document.getElementById("total").hidden, null, { timeout: 60000 });
  check(await page.evaluate(() => window.__workers === 0 && !!window.Engine), "Motore: senza worker gira nella pagina e alleggerisce lo stesso");
  check(errors.length === 0, `Motore senza worker: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
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
  // foto di prova 3000x2000 con un blocco EXIF minimo (orientamento 6) e un blocco del profilo colore (R-JPG-02)
  const before = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const g = c.getContext("2d"), d = g.createImageData(3000, 2000);
    for (let i = 0; i < d.data.length; i += 4) { const v = (i / 4 % 3000) / 12 + Math.random() * 120; d.data[i] = v; d.data[i + 1] = 255 - v; d.data[i + 2] = v / 2; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    const jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", .95))).arrayBuffer());
    const exif = [0xFF, 0xE1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2A, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
    const icc = [0xFF, 0xE2, 0, 22, ..."ICC_PROFILE".split("").map((x) => x.charCodeAt(0)), 0, 1, 1, 1, 2, 3, 4];
    const all = new Uint8Array(jpg.length + exif.length + icc.length); all.set(jpg.subarray(0, 2)); all.set(exif, 2); all.set(icc, 2 + exif.length); all.set(jpg.subarray(2), 2 + exif.length + icc.length);
    window.__foto = all;
    return all.length;
  });
  const squashFoto = async () => {
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File([window.__foto], "foto.jpg", { type: "image/jpeg" })); const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.click("#go");
    await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && document.querySelector("#rows .badge:not(.wait):not(.work)"), null, { timeout: 60000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#saveAs")]);
    const out = await read(await dl.path());
    let w = 0, h = 0;
    for (let p = 2; p + 9 < out.length && out[p] === 0xFF;) { const m = out[p + 1], len = out.readUInt16BE(p + 2); if (m >= 0xC0 && m <= 0xC2) { h = out.readUInt16BE(p + 5); w = out.readUInt16BE(p + 7); break; } p += 2 + len; }
    return { dl, out, w, h };
  };
  const { dl, out, w, h } = await squashFoto();
  check(dl.suggestedFilename() === "foto-compresso.jpg", `JPG: nome del file salvato (${dl.suggestedFilename()})`);
  check(out.length < before, `JPG: Carezza alleggerisce (da ${Math.round(before / 1024)} KB a ${Math.round(out.length / 1024)} KB)`);
  check(w === 2000 && h === 3000, `JPG: Carezza lascia le misure originali, raddrizzate (${w}×${h})`);
  check(out[2] === 0xFF && out[3] === 0xE1 && out.toString("latin1", 6, 10) === "Exif" && out[30] === 1, "JPG: dati dello scatto conservati, orientamento riportato a normale");
  check(out.includes(Buffer.from("ICC_PROFILE\0", "latin1")), "JPG: profilo colore conservato");
  await page.evaluate(() => document.getElementById("jlvlHard").click());
  const hard = await squashFoto();
  check(Math.max(hard.w, hard.h) === 2048 && hard.out.length < out.length, `JPG: Martellata riduce a 2048 px (${hard.w}×${hard.h}, ${Math.round(hard.out.length / 1024)} KB)`);
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
  check(await page.evaluate(() => getComputedStyle(document.querySelector("#press .s-vid")).display !== "none" && getComputedStyle(document.querySelector("#press .s-pdf")).display === "none"), "Video: sotto la pressa c'è un ciak");
  check(await page.evaluate(() => [...document.querySelectorAll("#loader .fileScene .fly")].filter((g) => getComputedStyle(g).display !== "none").every((g) => g.classList.contains("k-vid"))), "Video: nella lettura delle cartelle volano ciak");
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
  const sumTxt = await page.evaluate(() => !document.getElementById("sum").hidden && document.getElementById("sum").innerText.replace(/\n/g, " "));
  check(/Da schiacciare: 1 di 1/.test(sumTxt || ""), `Riepilogo: sopra l'elenco quanti file verranno schiacciati e il risparmio stimato (${sumTxt || "assente"})`);
  check(/≈/.test(est) && /qualità 97/.test(est), `Video: analisi con stima e qualità (${est})`);
  await page.click("#vlvlMid");
  await page.waitForFunction(() => !document.getElementById("go").disabled, null, { timeout: 240000 });
  const est95 = await page.innerText("#rows .meta");
  check(/qualità 95/.test(est95) && est95 !== est, `Video: cambiando livello la stima si aggiorna (${est95})`);
  await page.click("#vlvlSoft");
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && document.querySelector("#rows .badge:not(.wait):not(.work)"), null, { timeout: 240000 });
  await page.click("#modeBtn");
  await page.waitForSelector("#modal:not([hidden])");
  check(/Cambi modalità/.test(await page.innerText("#modalTitle")), "Video: con un file pronto, cambiare modalità chiede conferma");
  await page.click("#modalBtns button.alt");
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
// --- modalità TUTTO (R-TUT): PDF, foto e video insieme, file di altri tipi saltati, livello unico, Cattura spenta
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem("bg", "0") } catch {} for (const k of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) Object.defineProperty(window, k, { value: undefined }); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "?vcodec=vp9");
  for (let k = 0; k < 3; k++) { await page.click("#modeBtn"); await page.waitForTimeout(250); }
  check(await page.evaluate(() => document.body.classList.contains("mode-all") && location.hash === "#all" && !document.getElementById("optsAll").hidden && document.getElementById("optsVid").parentNode.id === "perType"), "Tutto: il rullo arriva alla quarta modalità, opzioni dei tre tipi in «Regola per tipo»");
  check(await page.evaluate(() => getComputedStyle(document.getElementById("camBtn")).display === "none" && document.getElementById("actBtn").getAttribute("aria-disabled") === "true"), "Tutto: Cattura spenta (fotocamera nascosta, verbo fermo)");
  check(await page.evaluate(() => getComputedStyle(document.querySelector("#press .m-horn")).display !== "none" && getComputedStyle(document.querySelector("#press .m-gas")).display !== "none"), "Tutto: mascotte olografica con il corno");
  await page.click('input[name="alvl"][value="hard"]', { force: true });
  check(await page.evaluate(() => ["lvl", "jlvl", "vlvl"].map((n) => document.querySelector(`input[name="${n}"]:checked`).value).join() === "hard,hard,hard"), "Tutto: il livello unico vale per PDF, foto e video");
  await page.click('input[name="alvl"][value="mid"]', { force: true });
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    const c = document.createElement("canvas"); c.width = 2000; c.height = 1500; const g = c.getContext("2d"), d = g.createImageData(2000, 1500);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = v; d.data[i + 1] = 200 - v / 2; d.data[i + 2] = v / 3; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); const jb = await new Promise((r) => c.toBlob(r, "image/jpeg", .95));
    const M = await import("./vendor/mediabunny.min.mjs");
    const cv = document.createElement("canvas"); cv.width = 640; cv.height = 360; const gg = cv.getContext("2d"), tgt = new M.BufferTarget(), o = new M.Output({ format: new M.Mp4OutputFormat(), target: tgt });
    const src = new M.CanvasSource(cv, { codec: "vp9", bitrate: 6e6 }); o.addVideoTrack(src, { frameRate: 30 }); await o.start();
    for (let i = 0; i < 90; i++) { gg.fillStyle = `hsl(${i * 3},70%,55%)`; gg.fillRect(0, 0, 640, 360); for (let k = 0; k < 300; k++) { gg.fillStyle = `rgba(0,0,0,${Math.random() * .4})`; gg.fillRect(Math.random() * 640, Math.random() * 360, 6, 6); } await src.add(i / 30, 1 / 30); }
    await o.finalize();
    const doc = await PDFLib.PDFDocument.create(); const img = await doc.embedJpg(new Uint8Array(await jb.arrayBuffer())); doc.addPage([600, 450]).drawImage(img, { x: 0, y: 0, width: 600, height: 450 });
    dt.items.add(new File([tgt.buffer], "clip.mp4", { type: "video/mp4" }));
    dt.items.add(new File([jb], "foto.jpg", { type: "image/jpeg" }));
    dt.items.add(new File(["x"], "nota.txt", { type: "text/plain" }));
    dt.items.add(new File([await doc.save()], "doc.pdf", { type: "application/pdf" }));
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const types = await page.evaluate(() => [...document.querySelectorAll("#rows .row .ty")].map((x) => x.textContent).join());
  check(types === "JPG,PDF,VIDEO", `Tutto: etichette del tipo, video in fondo (${types})`);
  const msg = await page.innerText("#msg");
  check(/ignorati.*PDF, JPG o video: 1/.test(msg), `Tutto: file di altri tipi saltati e contati (${msg})`);
  await page.waitForFunction(() => !document.getElementById("go").disabled, null, { timeout: 120000 });
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && !document.getElementById("total").hidden, null, { timeout: 300000 }).catch(() => {});
  const done = await page.evaluate(() => document.querySelectorAll("#rows .row").length === 3 && /3 su 3/.test(document.getElementById("msg").textContent));
  check(done, `Tutto: PDF, foto e video alleggeriti in un giro (${(await page.innerText("#rows")).replace(/\n/g, " / ")})`);
  check(errors.length === 0, `Tutto: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- memoria delle analisi (R-VID-19): riaprendo lo stesso video la stima arriva senza rianalizzare; salva man mano (R-VID-22)
{
  const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.goto(url + "?vcodec=vp9&perf=1#video");
  const bytes = await page.evaluate(async () => {
    const M = await import("./vendor/mediabunny.min.mjs");
    const c = document.createElement("canvas"); c.width = 320; c.height = 240;
    const g = c.getContext("2d"), tgt = new M.BufferTarget(), out = new M.Output({ format: new M.Mp4OutputFormat(), target: tgt });
    const src = new M.CanvasSource(c, { codec: "vp9", bitrate: 3e6 }); out.addVideoTrack(src, { frameRate: 25 });
    await out.start();
    for (let i = 0; i < 50; i++) { g.fillStyle = `hsl(${i * 7},60%,50%)`; g.fillRect(0, 0, 320, 240); for (let k = 0; k < 200; k++) { g.fillStyle = `rgba(0,0,0,${(k % 7) / 18})`; g.fillRect((k * 37 + i * 5) % 320, (k * 53) % 240, 5, 5); } await src.add(i / 25, 1 / 25); }
    await out.finalize();
    return [...new Uint8Array(tgt.buffer)];
  });
  const load = () => page.evaluate((b) => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(b)], "memoria.mp4", { type: "video/mp4", lastModified: 1700000000000 }));
    const input = document.getElementById("pickFiles"); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  }, bytes);
  await load();
  await page.waitForFunction(() => !document.getElementById("go").disabled, null, { timeout: 240000 });
  const first = await page.innerText("#rows .meta");
  await page.reload(); await page.waitForTimeout(800);
  await load();
  await page.waitForFunction(() => !document.getElementById("go").disabled, null, { timeout: 60000 });
  const again = await page.innerText("#rows .meta");
  const probes = await page.evaluate(() => window.__perf.filter((x) => x[0] === "probe").length);
  check(probes === 0 && again === first, `Video: riaprendo lo stesso video la stima arriva dalla memoria, senza rianalizzare (${again})`);
  check(/: 1/.test(await page.innerText("#vMem")), `Video: si vede quante analisi sono salvate (${await page.innerText("#vMem")})`);
  // a fine compressione i video si salvano con i pulsanti del passo 3 (R-VID-22 tolto)
  check(await page.evaluate(() => !document.getElementById("saveNow")), "Video: niente più casella «Salva ogni video appena è pronto»");
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && document.getElementById("work").hidden, null, { timeout: 120000 });
  check(await page.evaluate(() => !document.getElementById("total").hidden && !document.querySelector("#total .saveBtns").hidden), "Video: a fine compressione compaiono i pulsanti per salvare");
  await page.click("#vForget");
  check(await page.waitForFunction(() => document.getElementById("vForget").hidden, null, { timeout: 5000 }).then(() => true, () => false), "Video: «Dimentica le analisi salvate» le cancella");
  check(errors.length === 0, `Memoria delle analisi: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
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
  check(/da parte/.test(await page.innerText("#rows")), "Video grandi: la scheda dice che il risultato resta da parte finché non lo salvi");
  await page.click("#go");
  await page.waitForFunction(() => !document.getElementById("press").classList.contains("busy") && !document.getElementById("total").hidden, null, { timeout: 240000 });
  const tmp = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); let n = 0; for (const name of ["schiaccia-tmp", "schiaccia-jobs"]) { try { const walk = async (d) => { for await (const e of d.values()) { if (e.kind === "file") n++; else await walk(e); } }; await walk(await r.getDirectoryHandle(name)); } catch {} } return n; });
  check(tmp === 2, `Video grandi: risultati scritti su disco nella cartella privata, poi passati al lavoro salvato in automatico (${tmp} file)`);
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
  await page.waitForTimeout(700);
  check(await page.evaluate(() => [".m-glasses", ".m-camera", ".m-flash"].every((c) => getComputedStyle(document.querySelector("#press " + c)).opacity === "1") && getComputedStyle(document.querySelector("#press .p-spark")).visibility === "hidden"), "Cattura: la mascotte mette occhiali, fotocamera e flash");
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
  for (let k = 0; k < 4 && !(await page.evaluate(() => document.body.classList.contains("mode-video"))); k++) { await page.click("#modeBtn"); await page.waitForTimeout(150); }
  await page.click("#actBtn", { force: true });
  check(await page.evaluate(() => document.body.classList.contains("mode-video") && !document.body.classList.contains("act-cap")), "Cattura: in modalità video il verbo non cambia");
  check(errors.length === 0, `Cattura: nessun errore JavaScript${errors.length ? " → " + errors.join("; ") : ""}`);
  await ctx.close();
}
// --- scansione sulla scheda grafica (WebGL2) e nel calcolo in JavaScript (?gl=0): stesso risultato (R-APP-09)
{
  const outs = [];
  for (const q of ["?perf=1&gl=1", "?perf=1&gl=0"]) {
    const ctx = await browser.newContext({ locale: "it-IT", viewport: { width: 400, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
    await page.goto(url + q);
    const photo = Buffer.from(await page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 1200; c.height = 1600; const g = c.getContext("2d");
      g.fillStyle = "#4b3a2a"; g.fillRect(0, 0, 1200, 1600); g.fillStyle = "#e9e2d2"; g.beginPath(); g.moveTo(180, 200); g.lineTo(1020, 240); g.lineTo(1050, 1420); g.lineTo(140, 1380); g.fill();
      const gr = g.createLinearGradient(0, 0, 1200, 0); gr.addColorStop(0, "rgba(0,0,0,.25)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 1200, 1600);
      g.fillStyle = "#222"; g.font = "30px serif"; for (let i = 0; i < 24; i++) g.fillText("Riga di prova " + i, 240, 320 + i * 42);
      return [...new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", .92))).arrayBuffer())];
    }));
    await page.click("#camBtn");
    await page.setInputFiles("#galInput", { name: "f.jpg", mimeType: "image/jpeg", buffer: photo });
    await page.waitForFunction(() => document.querySelectorAll("#capture .thumb").length === 1 && document.getElementById("loader").hidden, null, { timeout: 120000 });
    outs.push(await page.evaluate(async () => {
      const im = document.querySelector("#capture .thumb img"); await new Promise((r) => (im.complete && im.naturalWidth ? r() : (im.onload = r)));
      const bmp = await createImageBitmap(await (await fetch(im.src)).blob()), c = document.createElement("canvas"); c.width = 200; c.height = Math.round(200 * bmp.height / bmp.width);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return { px: [...c.getContext("2d").getImageData(0, 0, c.width, c.height).data], gl: window.__perf.some((x) => x[0] === "gl"), err: [] };
    }));
    outs[outs.length - 1].err = errors;
    await ctx.close();
  }
  let diff = 0; const n = Math.min(outs[0].px.length, outs[1].px.length);
  for (let i = 0; i < n; i += 4) diff += Math.abs(outs[0].px[i] - outs[1].px[i]);
  diff /= n / 4;
  check(outs[0].gl && !outs[1].gl, "Scansione: con ?gl=1 usa la scheda grafica, con ?gl=0 il calcolo in JavaScript");
  check(outs[0].px.length === outs[1].px.length && diff < 6, `Scansione: stesso risultato sulla scheda grafica e in JavaScript (differenza media ${diff.toFixed(1)} su 255)`);
  check(!outs[0].err.length && !outs[1].err.length, "Scansione su scheda grafica: nessun errore JavaScript");
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

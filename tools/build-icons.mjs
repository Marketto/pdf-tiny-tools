#!/usr/bin/env node
// Rigenera dalla mascotte (tools/mascot.mjs): le icone in icons/, favicon.ico
// e i due disegni incorporati in index.html (tra i commenti mascot:page e mascot:loader).
// Uso: node tools/build-icons.mjs [--no-png]   (i PNG richiedono Playwright: vedi tools/package.json)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { iconSvg, pageSvg, loaderSvg } from "./mascot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const at = (p) => join(root, p);

function inject(html, tag, svg) {
  const re = new RegExp(`(<!-- mascot:${tag} -->)[\\s\\S]*?(<!-- /mascot:${tag} -->)`);
  if (!re.test(html)) throw new Error(`Segnaposto mascot:${tag} non trovato in index.html`);
  return html.replace(re, `$1${svg}$2`);
}
let html = readFileSync(at("index.html"), "utf8");
html = inject(inject(html, "page", pageSvg()), "loader", loaderSvg());
writeFileSync(at("index.html"), html);
writeFileSync(at("icons/icon.svg"), iconSvg(1.3, true));
console.log("Aggiornati index.html e icons/icon.svg");

if (process.argv.includes("--no-png")) process.exit(0);

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("playwright-core")); } catch {
  console.error("Playwright non installato: esegui `npm install` in tools/ oppure usa --no-png."); process.exit(1); } }

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function png(svg, size, transparent = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  const buf = await page.screenshot({ omitBackground: transparent });
  await page.close();
  return buf;
}
// 0.98 = la mascotte più grande che sta nella zona sicura delle icone adattive (cerchio all'80%).
const full = iconSvg(0.98);
writeFileSync(at("icons/icon-192.png"), await png(full, 192));
writeFileSync(at("icons/icon-512.png"), await png(full, 512));
writeFileSync(at("icons/apple-touch-icon.png"), await png(iconSvg(1.3), 180));

// favicon.ico con dentro due PNG (32 e 48 px)
const fav = [32, 48], imgs = [];
for (const s of fav) imgs.push(await png(iconSvg(1.3, true), s, true));
const head = Buffer.alloc(6 + 16 * fav.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(fav.length, 4);
let offset = head.length;
fav.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
  offset += imgs[i].length;
});
writeFileSync(at("favicon.ico"), Buffer.concat([head, ...imgs]));
await browser.close();
console.log("Aggiornati icons/*.png e favicon.ico");

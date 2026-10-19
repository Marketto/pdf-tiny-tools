#!/usr/bin/env node
// Controlla i testi in i18n/<sigla>.js: stesse chiavi in tutte le lingue, stessi segnaposto {…},
// elenco i18n/index.js allineato ai file, nessuna chiave usata in index.html ma non definita. Nessuna dipendenza.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
const dir = join(root, "i18n"), files = readdirSync(dir).filter((f) => /^[a-z]{2}\.js$/.test(f));
for (const f of files) new Function("window", readFileSync(join(dir, f), "utf8"))(window);
new Function("window", readFileSync(join(dir, "index.js"), "utf8"))(window);
const I = window.I18N, base = Object.keys(I.it).sort();
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
let bad = 0;
const fail = (m) => { bad++; console.log("✗ " + m); };

for (const [lang, dict] of Object.entries(I)) {
  const keys = Object.keys(dict);
  for (const k of base) if (!(k in dict)) fail(`${lang}: manca «${k}»`);
  for (const k of keys) if (!base.includes(k)) fail(`${lang}: chiave in più «${k}»`);
  for (const k of base) {
    if (!(k in dict)) continue;
    if (!String(dict[k]).trim()) fail(`${lang}.${k}: vuota`);
    if (ph(dict[k]) !== ph(I.it[k])) fail(`${lang}.${k}: segnaposto diversi dall'italiano (${ph(I.it[k]) || "nessuno"})`);
  }
  if (!["ltr", "rtl"].includes(dict.dir)) fail(`${lang}.dir deve essere ltr o rtl`);
}
for (const f of files) { const c = f.slice(0, 2); if (!window.I18N[c]) fail(`i18n/${f}: non definisce I18N.${c}`); }
for (const [c, v] of Object.entries(window.LANGS)) {
  const d = I[c];
  if (!d) { fail(`i18n/index.js elenca «${c}» ma manca i18n/${c}.js`); continue; }
  if (d.name !== v.name || d.dir !== v.dir) fail(`i18n/index.js: nome o direzione di «${c}» diversi da i18n/${c}.js`);
}
for (const c of Object.keys(I)) if (!window.LANGS[c]) fail(`«${c}» manca in i18n/index.js`);
const html = readFileSync(join(root, "index.html"), "utf8");
const used = new Set([
  ...[...html.matchAll(/data-i18n(?:-html|-aria)?="(\w+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/\bt\("(\w+)"/g)].map((m) => m[1]),
]);
for (const k of used) if (!base.includes(k)) fail(`index.html usa «${k}» che non esiste nei testi`);

console.log(`${Object.keys(I).length} lingue, ${base.length} chiavi, problemi: ${bad}`);
process.exit(bad ? 1 : 0);

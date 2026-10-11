#!/usr/bin/env node
// Controlla i18n.js: stesse chiavi in tutte le lingue, stessi segnaposto {…},
// nessuna chiave usata in index.html ma non definita. Nessuna dipendenza.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const window = {};
new Function("window", readFileSync(join(root, "i18n.js"), "utf8"))(window);
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
const html = readFileSync(join(root, "index.html"), "utf8");
const used = new Set([
  ...[...html.matchAll(/data-i18n(?:-html|-aria)?="(\w+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/\bt\("(\w+)"/g)].map((m) => m[1]),
]);
for (const k of used) if (!base.includes(k)) fail(`index.html usa «${k}» che non esiste in i18n.js`);

console.log(`${Object.keys(I).length} lingue, ${base.length} chiavi, problemi: ${bad}`);
process.exit(bad ? 1 : 0);

#!/usr/bin/env node
// Scrive <cartella>/moduli.json: per ogni modulo scaricato quando serve (vendor/, i18n/<sigla>.js, compila.js e compila/) l'impronta
// del contenuto. Il service worker la usa per tenere i moduli tra una versione e l'altra e riscaricare
// solo quelli cambiati (R-APP-16). Lo esegue la pubblicazione (pages.yml) sulla cartella del sito.
// Uso: node tools/moduli.mjs _site
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const site = process.argv[2] || ".";
const out = {};
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else out[relative(site, p).split("\\").join("/")] = createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
  }
}
walk(join(site, "vendor"));
walk(join(site, "compila"));
out["compila.js"] = createHash("sha256").update(readFileSync(join(site, "compila.js"))).digest("hex").slice(0, 12);
for (const f of readdirSync(join(site, "i18n"))) if (/^[a-z]{2}\.js$/.test(f)) out["i18n/" + f] = createHash("sha256").update(readFileSync(join(site, "i18n", f))).digest("hex").slice(0, 12);
writeFileSync(join(site, "moduli.json"), JSON.stringify(out, null, 0));
console.log(`moduli.json: ${Object.keys(out).length} moduli`);

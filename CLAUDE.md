# Schiaccia PDF (pdf-tiny-tools)

Web app statica che alleggerisce nel browser i PDF (ricomprimendo le immagini che contengono), le foto JPG e i video (ricodifica in HEVC o H.264 con qualità misurata). Le modalità si scambiano dal rullo nel titolo; la quarta, TUTTO, prende insieme PDF, foto e video di una cartella. Il verbo del titolo è un secondo rullo, Schiaccia ⇄ Cattura: in Cattura (o dal pulsante della fotocamera), solo per PDF e JPG, fa da scanner con una schermata propria: scatto, angoli e lati proposti, raddrizzamento e pulizia della luce, pagine da sistemare, salvataggio. Nessun server, nessuna build, nessun framework: quello che c'è nel repository è quello che viene pubblicato su GitHub Pages.

## Mappa

| File | Cosa contiene |
|---|---|
| `index.html` | Tutta l'app: markup, CSS e JavaScript in un file solo |
| `config.js` | Tutte le soglie e i parametri numerici (`window.CONFIG`), commentati con il requisito |
| `i18n.js` | Tutti i testi, 13 lingue (`window.I18N`) |
| `engine.js` | Motore delle immagini di PDF e JPG, eseguito nei worker in parallelo (o nella pagina) |
| `sw.js` | Cache offline (service worker) |
| `manifest.webmanifest`, `icons/`, `favicon.ico` | Installazione come app |
| `vendor/` | pdf-lib, JSZip, Mediabunny (video) e Tesseract (orientamento delle scansioni), copiati così come sono: non modificarli |
| `tools/` | Strumenti di sviluppo (controlli, prova nel browser, icone) |
| `.claude/` | Skill e agenti descritti sotto |
| `docs/` | Requisiti, architettura e guida al lavoro con gli agenti |

Cosa deve fare l'app: `docs/REQUISITI.md` (voci con codice `R-AREA-nn`). Come è fatta: `docs/ARCHITETTURA.md` (mappa sezione → funzioni → requisiti).

## Come cercare, spendendo poco

1. Requisito: `grep -n "R-SCN" docs/REQUISITI.md` (aree: PRI MOD CAR CMP JPG VID TUT SCN LST SAV UI AUD I18N APP REL DOC).
2. Dove sta nel codice: tabella «Mappa del codice» in `docs/ARCHITETTURA.md`, poi `grep -n -- "---------- scansione" index.html` e leggi solo quella sezione.
3. Testi: `grep -n "chiave:" i18n.js | head -13` (una riga per lingua).
4. Non leggere `vendor/` né le parti SVG generate tra `<!-- mascot:… -->`.

## Smistamento: a chi tocca cosa

Prima di lavorare, guarda in quale riga cade la richiesta e usa la skill o l'agente indicato.

| La richiesta riguarda… | Usa |
|---|---|
| Testi, traduzioni, una lingua nuova | skill `traduzioni`; per rileggere una lingua, agente `traduttore` |
| Mascotte, icone, favicon, animazione di caricamento | skill `mascotte-e-icone` |
| Qualità o peso dei PDF, delle foto JPG o dei video, immagini non compresse, file che si rompono | agente `motore-pdf` |
| «Funziona ancora?», controllo prima di pubblicare | skill `verifica`; per un giro completo e un rapporto, agente `collaudo` |
| Nuova versione, tag, pubblicazione | skill `rilascio` |
| Layout, stile, suoni, installazione, cartelle | lavora direttamente su `index.html`, poi skill `verifica` |

Se una richiesta tocca più righe, fai una cosa alla volta e chiudi sempre con `verifica`.

## Regole che valgono sempre

- **Niente build e niente dipendenze nel sito.** Non introdurre npm, bundler o CDN nell'app: le librerie stanno in `vendor/`. Le uniche dipendenze ammesse sono quelle di sviluppo in `tools/`.
- **Ogni testo visibile passa da `i18n.js`**, in tutte le 13 lingue, con gli stessi segnaposto `{…}`. Mai stringhe scritte direttamente in `index.html` (fanno eccezione i testi italiani di riserva già presenti nel markup).
- **I file dell'utente non lasciano il dispositivo.** Nessuna chiamata di rete con contenuti o nomi dei file. L'unica telemetria ammessa sono le statistiche anonime di R-PRI-05 (GoatCounter, senza cookie, disattivabili): non aggiungerne altre senza una voce nei requisiti.
- **Gli originali non si toccano** se non dopo la conferma esplicita già prevista (pulsante «Sovrascrivi gli originali»).
- **La mascotte ha una sola fonte**, `tools/mascot.mjs`. Non ritoccare a mano gli SVG dentro `index.html` o in `icons/`: si rigenerano.
- **Prima la documentazione, poi il codice.** Ogni richiesta del proprietario diventa prima una voce in `docs/REQUISITI.md` (nuovo codice o voce modificata) e, se cambia la struttura, il piano in `docs/ARCHITETTURA.md`; solo dopo si implementa, e alla fine si riallinea `ARCHITETTURA.md` a ciò che è stato fatto, con README e skill toccati. Una sola fonte per ogni informazione: rimanda invece di ripetere.
- **Scelte estetiche: prima le proposte.** Per colori, stile, mascotte, animazioni o musica nuove mostra al proprietario 2–4 proposte (schermate a larghezza telefono, PDF e JPG affiancate) e implementa solo quella scelta.
- **Versionamento semantico**, sempre a tre cifre (`MAGGIORE.MINORE.CORREZIONE`); le regole sono nella skill `rilascio`.
- **I tag non si creano a mano**: basta cambiare `VERSION` (vedi skill `rilascio`).
- I percorsi nel sito sono relativi (l'app vive sotto `/pdf-tiny-tools/`).
- Commit e documentazione in italiano.

## Comandi

```bash
node tools/check-i18n.mjs      # controllo traduzioni, nessuna dipendenza
cd tools && npm install        # una volta sola, per i due comandi sotto
node tools/smoke-test.mjs      # prova nel browser: lingue, layout, compressione reale
node tools/build-icons.mjs     # rigenera icone e disegni della mascotte
node tools/bench.mjs [nome]    # misura i tempi delle operazioni pesanti (prima/dopo)
python3 -m http.server 8000    # per provare l'app a mano
```

Se Playwright non trova il browser, indica l'eseguibile con `CHROMIUM_PATH=/percorso/di/chromium`.

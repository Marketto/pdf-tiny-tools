# Schiaccia PDF (pdf-tiny-tools)

Web app statica che alleggerisce nel browser i PDF (ricomprimendo le immagini che contengono) e le foto JPG (entro un lato lungo e un peso massimi). Le due modalità si scambiano dal rullo nel titolo. Nessun server, nessuna build, nessun framework: quello che c'è nel repository è quello che viene pubblicato su GitHub Pages.

## Mappa

| File | Cosa contiene |
|---|---|
| `index.html` | Tutta l'app: markup, CSS e JavaScript in un file solo |
| `i18n.js` | Tutti i testi, 13 lingue (`window.I18N`) |
| `sw.js` | Cache offline (service worker) |
| `manifest.webmanifest`, `icons/`, `favicon.ico` | Installazione come app |
| `vendor/` | pdf-lib e JSZip, copiati così come sono: non modificarli |
| `tools/` | Strumenti di sviluppo (controlli, prova nel browser, icone) |
| `.claude/` | Skill e agenti descritti sotto |
| `docs/` | Requisiti, architettura e guida al lavoro con gli agenti |

Cosa deve fare l'app: `docs/REQUISITI.md`. Come è fatta: `docs/ARCHITETTURA.md`.

## Smistamento: a chi tocca cosa

Prima di lavorare, guarda in quale riga cade la richiesta e usa la skill o l'agente indicato.

| La richiesta riguarda… | Usa |
|---|---|
| Testi, traduzioni, una lingua nuova | skill `traduzioni`; per rileggere una lingua, agente `traduttore` |
| Mascotte, icone, favicon, animazione di caricamento | skill `mascotte-e-icone` |
| Qualità o peso dei PDF e delle foto JPG, immagini non compresse, file che si rompono | agente `motore-pdf` |
| «Funziona ancora?», controllo prima di pubblicare | skill `verifica`; per un giro completo e un rapporto, agente `collaudo` |
| Nuova versione, tag, pubblicazione | skill `rilascio` |
| Layout, stile, suoni, installazione, cartelle | lavora direttamente su `index.html`, poi skill `verifica` |

Se una richiesta tocca più righe, fai una cosa alla volta e chiudi sempre con `verifica`.

## Regole che valgono sempre

- **Niente build e niente dipendenze nel sito.** Non introdurre npm, bundler o CDN nell'app: le librerie stanno in `vendor/`. Le uniche dipendenze ammesse sono quelle di sviluppo in `tools/`.
- **Ogni testo visibile passa da `i18n.js`**, in tutte le 13 lingue, con gli stessi segnaposto `{…}`. Mai stringhe scritte direttamente in `index.html` (fanno eccezione i testi italiani di riserva già presenti nel markup).
- **I file dell'utente non lasciano il dispositivo.** Nessuna chiamata di rete con contenuti o nomi dei file, nessuna telemetria.
- **Gli originali non si toccano** se non dopo la conferma esplicita già prevista (pulsante «Sovrascrivi gli originali»).
- **La mascotte ha una sola fonte**, `tools/mascot.mjs`. Non ritoccare a mano gli SVG dentro `index.html` o in `icons/`: si rigenerano.
- **La documentazione si aggiorna insieme al codice.** Ogni requisito, correzione o miglioria chiesta dal proprietario va riportata in `docs/REQUISITI.md` nello stesso commit, e con lei `docs/ARCHITETTURA.md`, il README e le skill toccate dal cambiamento. Prima di cambiare un comportamento, leggi cosa dice `docs/REQUISITI.md`.
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
python3 -m http.server 8000    # per provare l'app a mano
```

Se Playwright non trova il browser, indica l'eseguibile con `CHROMIUM_PATH=/percorso/di/chromium`.

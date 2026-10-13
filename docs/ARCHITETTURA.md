# Architettura

Come è fatta l'app. Il *cosa* sta in `REQUISITI.md` (codici `R-…`); qui il *come*, con i nomi da cercare nel codice.

## Mappa del codice

Tutto il JavaScript è in `index.html`, dentro un'unica funzione, diviso da commenti `/* ---------- nome ---------- */`. Per arrivare a una sezione: `grep -n -- "---------- scansione" index.html`.

| Sezione (marcatore) | Funzioni principali | Requisiti |
|---|---|---|
| `lingue` | `pickLang`, `t`, `applyLang`, `showTitle`, `setMode`, `isPdf` | I18N, MOD |
| `carico` | `addFile`, `walkHandle`, `walkEntry`, `loaderOn`, `loaderOff` | CAR |
| `vista` | `render` | LST, SAV-08 |
| `motore` | `squeezePdf`, `squeezeImage`, `squeezeJpg`, `exifSegment`, `jpgOpts` | CMP, JPG |
| `salvataggio` | `saveBlob`, `ask`, `writeJobs`, `finish`, gestori di `saveAs`/`saveElse`/`saveBeside`/`overBtn` | SAV |
| `scansione con la fotocamera` | `scanFile`, `detectPage`, `editCorners`, `makePage`, `warp`, `enhance`, `morePages`, `finishPdf`, `showPreview` | SCN |
| `avvio` | menu lingue, modalità iniziale | I18N, MOD-04 |
| `suoni` | `tone`, `hiss`, `sfx`, `playJingle`, `playSquash` | AUD-06 |
| `musica` | oggetto `music` (`start`, `stop`, `setMood`, `festa`), `MOOD`, `playStep` | AUD |
| `occhi` | `wink` | UI-01 |
| `condivisione` | `toast`, gestore di `shareBtn` | APP-02 |
| `installazione` | `beforeinstallprompt`, istruzioni iPhone | APP-01 |

Fuori dallo script principale: registrazione del service worker in fondo a `index.html` (APP-03).

| Altro file | Ruolo |
|---|---|
| `i18n.js` | `window.I18N`: un oggetto per lingua, stesse chiavi. Regole nella skill `traduzioni`. |
| `sw.js` | Cache offline: rete prima per pagina e testi, cache prima per `vendor/`, `icons/`, font. |
| `tools/mascot.mjs` | Unica fonte dei disegni della mascotte; `build-icons.mjs` li inietta in `index.html` tra `<!-- mascot:page|loader|scan -->`. |
| `.github/workflows/pages.yml` | Controlla le traduzioni, copia in `_site/` i soli file dell'app, scrive versione e nome cache, pubblica. |
| `.github/workflows/tag.yml` | Crea `v<VERSION>` quando cambia `VERSION`. |

## Stato globale

`items` (elenco: `{name, rel, file, size, status, out, note, handle, dir, scan, pages, pageBlobs}`), `mode` (`"pdf"`/`"jpg"`), `rootDir` (cartella scelta), `busy` (compressione in corso), `loading` (schermata a tutto schermo aperta), `scanPages` (pagine del PDF in corso di scansione).

`status`: `wait` → `work` → `done` | `same` (non alleggerito) | `err` | `over` (sovrascritto).

## Testi e modalità
- `t(k)`: in modalità JPG usa la chiave `kJ` se esiste, altrimenti sostituisce «PDF» con «JPG».
- Il rullo è un `<button id="modeBtn">` costruito da `showTitle()` al posto di `<span>PDF</span>` della chiave `h1`; due facce 3D, ruotate dalla classe `mode-jpg` su `<body>`, che cambia anche il colore `.m-skin` della mascotte e i tre toni d'accento (UI-05): `--acc-l` (chiaro: badge), `--acc` (pelle: pulsanti, etichette, conferme), `--acc-s` (intenso: «Schiaccia!», livello scelto, barra, contorni di fuoco). Definiti su `:root` per il PDF e ridefiniti in `.mode-jpg`; `--tomato` solo per errori e sovrascrittura.

## PDF (CMP)
`squeezePdf` apre con pdf-lib, prende i flussi `/Subtype /Image` (escluse le `SMask`), `squeezeImage` decodifica (JPEG col browser, Flate con `DecompressionStream` + filtro PNG), riduce, ricodifica JPEG, sostituisce solo se < 90%. Intoccati: CMYK, Indexed, `Decode`, `Mask`, JBIG2, JPX, CCITT. Forze in `PRESETS`: qualità 0,82/0,68/0,50, lato 2400/1700/1200.

## JPG (JPG)
`squeezeJpg`: decodifica raddrizzando l'orientamento, ridisegna entro il lato scelto; con peso massimo bisezione della qualità tra 0,30 e 0,92, poi riduzione delle dimensioni fino a 5 giri; senza peso qualità 0,80. EXIF ricopiato in testa con orientamento riportato a 1 (`exifSegment`); profilo colore non ricopiato. Su iPhone massimo 16 Mpx.

## Scansione (SCN)
1. 📷 apre `<input id="camInput" capture="environment">`: fotocamera di sistema, nessun permesso.
2. `scanFile` riduce la foto a 3000 px (`work`).
3. `detectPage(work)` (SCN-09/10), su una copia da ~360 px:
   - maschera: punteggio = luminosità − 0,8 × saturazione; soglia di Otsu abbassata verso la media dello sfondo (così le zone del foglio in ombra restano dentro); apertura e chiusura 3×3; componente connessa più grande (≥ 12% dell'immagine, che non tocchi più del 45% del contorno);
   - quadrilatero iniziale: estremi lungo le diagonali o lungo gli assi, il più ampio;
   - bordo esterno (riempimento dall'esterno, così le scritte non contano); per ogni lato retta robusta (minimi quadrati totali, scartando i punti oltre 2,5 × la mediana) sui punti tra il 12% e l'88% del lato;
   - curvatura: un lato è curvo se il centro e le due estremità stanno da parti opposte della retta e le estremità concordano (un'ombra su un solo angolo non conta); lo scarto diventa lo spostamento della maniglia di quel lato;
   - angoli: intersezione delle rette se i due lati vicini sono dritti, altrimenti l'estremo iniziale;
   - se qualcosa non torna restituisce `null` e l'editor parte da un rettangolo rientrato del 6%.
4. `editCorners` (SCN-02/10): SVG sopra la foto; 4 angoli + 4 maniglie a metà lato; reticolato 8×10 calcolato con la stessa funzione di `warp`; la lente è un canvas che ingrandisce 3×. Spostando un angolo, le maniglie dei lati conservano lo scarto dal punto medio del lato.
5. `makePage` → `warp`: omografia `H` (rettangolo d'uscita → angoli, `homography()`, sistema 8×8). Le maniglie dei lati, riportate nello spazio d'uscita con `H⁻¹`, definiscono quattro curve di Bézier quadratiche; una superficie di Coons dà lo spostamento per ogni punto, poi `H` lo porta sulla foto. Lati dritti = pura prospettiva. Campionamento bilineare a blocchi di righe (l'animazione resta fluida).
6. `enhance`: Documento = luce del foglio stimata per canale (massimo in riquadri 16×16, allargato e sfumato), divisione, livelli; Bianco e nero = idem + soglia morbida; Foto = livelli per canale.
7. Anteprima (SCN-12): `showPreview` usa `ask()` con un'immagine nel corpo. PDF: `morePages()` mostra l'ultima pagina con «Un'altra pagina», «Rifai questa pagina», «Finisci». JPG: «Tienila» / «Rifai».
8. PDF: `finishPdf` impagina le pagine (lato lungo 842 pt) con pdf-lib. L'elemento in elenco ha `scan: true`, `pages`, `pageBlobs` (per l'anteprima, SCN-13); «Schiaccia!» lo salta, i salvataggi non offrono sovrascrittura né «accanto».
9. La fotocamera si riapre dentro il tocco (`now` nei pulsanti di `ask()`), perché i browser lo permettono solo in risposta a un gesto; l'evento `cancel` dell'input riporta alla domanda.

## Cartelle (CAR, SAV)
Tre ingressi: `showDirectoryPicker` (lettura e scrittura: unico che consente «accanto» e «sovrascrivi»), `<input webkitdirectory>` e trascinamento (sola lettura). File scelti con `showOpenFilePicker` portano `handle` (sovrascrivibili). Ogni elemento tiene `handle` e `dir`. `writeJobs` scrive con la schermata `back`; prima si contano i file già presenti (`okToReplace`).

| Salvataggio | Serve | Come |
|---|---|---|
| Salva con nome | — | `showSaveFilePicker`, altrimenti download |
| Altra cartella | `showDirectoryPicker` | ricrea i percorsi relativi; senza: ZIP |
| Accanto | `dir` su ogni file | stesso nome con prefisso/suffisso |
| Sovrascrivi | `handle` su ogni file | `createWritable` sull'originale |

## Schermata a tutto schermo
`loaderOn(mode, titolo)` / `loaderOff()`; rende inerte `#app`, resta almeno 0,9 s. Classi su `#loader`: nessuna = lettura cartella (schedario), `back` = scrittura (fogli che tornano), `scan` = scansione (scena `mascot:scan`, senza «Annulla»). Ogni classe sceglie anche l'umore della musica.

## Suoni e musica (AUD)
Tutto Web Audio, niente file. `music` mette in coda le note ~0,35 s prima; umori in `MOOD` (bpm, filtro, giro, melodia) e stili in `playStep`: `calm`, `mystery` (giro con re maggiore, staccato), `drive`, `joy`, `scan`, `jump` (fanfara, `festa()`). Volume del sottofondo in `VOL`. L'audio parte al primo tocco e si sospende con la pagina nascosta.

## Cache offline (APP-03)
`sw.js`: installazione con `cache: "reload"`; pagina e testi rete prima (cache se manca o > 4 s); `vendor/`, `icons/`, font cache prima. Il nome cache lo cambia `pages.yml`. Al cambio di service worker la pagina si ricarica se non c'è lavoro in corso.

## Limiti noti
PDF: CMYK, JBIG2, JPEG 2000, CCITT non ricompressi; PDF con password saltati; tutto in RAM. Foto: colori ad ampia gamma un po' spenti; HEIC non leggibile. Scansione: rilevamento del foglio debole su sfondo chiaro; pieghe interne non corrette; ombre nette attenuate ma con alone. Cartelle: non scrivibili su iPhone, Firefox, Safari.

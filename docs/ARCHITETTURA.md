# Architettura

Come è fatta l'app. Il *cosa* sta in `REQUISITI.md` (codici `R-…`); qui il *come*, con i nomi da cercare nel codice.

## Mappa del codice

Tutto il JavaScript è in `index.html`, dentro un'unica funzione, diviso da commenti `/* ---------- nome ---------- */`. Per arrivare a una sezione: `grep -n -- "---------- scansione" index.html`.

| Sezione (marcatore) | Funzioni principali | Requisiti |
|---|---|---|
| `lingue` | `pickLang`, `t`, `applyLang`, `showTitle`, `turnDrum`, `fitTitle`, `unsaved`, `stopWork`, `setMode`, `isPdf` | I18N, MOD |
| `carico` | `addFile`, `walkHandle`, `walkEntry`, `loaderOn`, `loaderOff` | CAR |
| `vista` | `render` | LST, SAV-08 |
| `motore` | `squeezePdf`, `squeezeImage`, `squeezeJpg`, `exifSegment`, `jpgOpts` | CMP, JPG |
| `video` | `loadMB`, `checkVideo`, `probeAll`, `probeVideo`, `ssim`, `planVideo`, `planAll`, `goVideo`, `squeezeVideo` | VID |
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

`items` (elenco: `{name, rel, file, size, status, out, note, handle, dir, scan, pages, pageBlobs, vp, plan}`), `mode` (`"pdf"`/`"jpg"`/`"video"`), `rootDir` (cartella scelta), `busy` (compressione in corso), `loading` (schermata a tutto schermo aperta), `scanPages` (pagine del PDF in corso di scansione).

`status`: (`probe`, solo video) → `wait` → `work` → `done` | `same` (non alleggerito) | `err` | `over` (sovrascritto).

## Testi e modalità
- `MODES=["pdf","jpg","video"]`. `t(k)`: in modalità JPG usa la chiave `kJ` se esiste, altrimenti sostituisce «PDF» con «JPG»; in modalità video `kV`, altrimenti «PDF» → `vWord` (maiuscola se apre la frase).
- Il rullo è un `<button id="modeBtn">` costruito da `showTitle()` al posto di `<span>PDF</span>` della chiave `h1`: quattro facce 3D (PDF, JPG, VIDEO e di nuovo PDF), girate in avanti da `turnDrum()` con un angolo in linea (`rollAngle`); dalla quarta faccia torna a 0 senza animazione. La larghezza del rullo segue la faccia visibile (colonna `minmax(0,1fr)`, così le facce più larghe non spostano quella visibile). `fitTitle()` (all'avvio, al cambio di lingua, all'arrivo del carattere, al ridimensionamento) dà al titolo una sola grandezza per tutte le modalità: lo misura come se mostrasse la faccia più larga, con la versione accanto, e lo rimpicciolisce (minimo 26 px) finché la riga ci sta; sotto i 26 px lascia andare a capo (UI-04/06).
- Cambio di modalità (MOD-06): `setMode` è asincrona; se `unsaved()` (lavoro in corso, analisi, file pronti, pagine scansionate) chiede conferma con `ask()`, poi `stopWork()` alza `abortWork` (i cicli di compressione si fermano tra un file e l'altro), annulla la conversione video in corso (`curConv.cancel()`) e aspetta che `busy` torni falso. Le classi `mode-jpg` e `mode-video` su `<body>` che cambia anche il colore `.m-skin` della mascotte e i tre toni d'accento (UI-05): `--acc-l` (chiaro: badge), `--acc` (pelle: pulsanti, etichette, conferme), `--acc-s` (intenso: «Schiaccia!», livello scelto, barra, contorni di fuoco). Definiti su `:root` per il PDF e ridefiniti in `.mode-jpg` e `.mode-video` (lavanda, dove `#camBtn` è nascosto); `--tomato` solo per errori e sovrascrittura.

## PDF (CMP)
`squeezePdf` apre con pdf-lib, prende i flussi `/Subtype /Image` (escluse le `SMask`), `squeezeImage` decodifica (JPEG col browser, Flate con `DecompressionStream` + filtro PNG), riduce, ricodifica JPEG, sostituisce solo se < 90%. Intoccati: CMYK, Indexed, `Decode`, `Mask`, JBIG2, JPX, CCITT. Forze in `PRESETS`: qualità 0,82/0,68/0,50, lato 2400/1700/1200.

## JPG (JPG)
`squeezeJpg`: decodifica raddrizzando l'orientamento, ridisegna entro il lato scelto; con peso massimo bisezione della qualità tra 0,30 e 0,92, poi riduzione delle dimensioni fino a 5 giri; senza peso qualità 0,80. EXIF ricopiato in testa con orientamento riportato a 1 (`exifSegment`); profilo colore non ricopiato. Su iPhone massimo 16 Mpx.

## Video (VID)
Libreria `vendor/mediabunny.min.mjs` (Mediabunny 1.59.1, MPL-2.0, licenza in `vendor/mediabunny-LICENSE.txt`), caricata con `import()` da `loadMB()` solo in modalità video. Sezione `video` in `index.html`.
1. `checkVideo()` all'ingresso nella modalità: `videoCodec()` sceglie il primo codec codificabile tra `hevc` e `avc` (`getFirstEncodableVideoCodec`). Se non ce n'è nessuno, `vidOk=false`: riga `#vidOff` e pulsanti di scelta spenti (VID-02). Per le prove automatiche `?vcodec=vp9` forza VP9, perché il Chromium di prova non ha H.264/HEVC.
2. Dopo la lettura `loaded()` lancia `probeAll()`: un video alla volta, stato `probe` con avanzamento nella scheda; `probeGen` interrompe l'analisi se l'elenco cambia. «Schiaccia!» resta spento finché l'analisi non finisce (`probing`).
3. `probeVideo(it)` (VID-04): `Input` su `BlobSource`; HDR (`hasHighDynamicRange`) → `same` con nota `hdr`; bitrate d'origine da `computePacketStats`. Spezzoni da 1,5 s (tutto il video se < 6 s, 2 se < 20 s, altrimenti 3); per ogni spezzone tre fotogrammi di riferimento presi con `CanvasSink`, al massimo a 1920 px di lato lungo (`fitSize`). Per la scala `LADDER` (frazioni del bitrate d'origine, da 0,85 a 0,035) `Conversion` con `trim`, audio scartato, `forceTranscode`, uscita in `BufferTarget`; SSIM medio (`ssim()`, finestre 8×8 sulla luminosità) e bit al secondo reali. Si scende finché la qualità resta ≥ 0,95. Risultato in `it.vp` (`curve`, `codec`, `dur`, `abr`, `aac`).
4. Audio (VID-08): `aac` vale true se l'audio è PCM o oltre 256 kbps, il passaggio ad AAC 160 kbps fa risparmiare almeno il 5% del file e `canEncodeAudio("aac")` risponde sì; altrimenti si copia.
5. `planVideo(vp,soglia)` (VID-06): bitrate minimo che rispetta la soglia, interpolato sul logaritmo del bitrate tra i due gradini vicini, +5%; il peso stimato usa i bit al secondo reali (il codificatore resta sotto il bitrate chiesto). `planAll()` lo applica al livello scelto (`vThr()`); sotto il 10% di risparmio → `same` con nota `noGainV` (VID-07). Cambiare livello richiama solo `planAll()`.
6. `goVideo()` → `squeezeVideo(it)`: `Conversion` completa con `Quality({bitrate, bitrateMode:"variable"})`, audio copiato o AAC, uscita `MovOutputFormat` per `.mov` e `Mp4OutputFormat` (fastStart in memoria) per il resto, in `BufferTarget`; Wake Lock dello schermo (`wakeLock()`, VID-13). Se il risultato non scende sotto il 90% → `same`. WebM e MKV: `vidExt()` cambia `name` e `rel` in `.mp4` e toglie `handle`, così la sovrascrittura non è offerta (VID-10).
7. Scheda: peso → ≈ stima · codec · qualità, badge «≈ −NN%» in attesa (`render`).
8. Video grandi (VID-14…18): `SAFE` = 1/8 di `navigator.deviceMemory` (max 1 GB) o 300 MB. Se `plan.bytes > SAFE`, `squeezeVideo` scrive con `StreamTarget` su un `FileSystemWritableFileStream` di un file in `navigator.storage.getDirectory()/schiaccia-tmp/` (fastStart `false`, nessun accumulo in memoria) e `it.out` diventa il `File` su disco (`getFile()`); spazio controllato con `navigator.storage.estimate()`. Senza `createWritable` o senza spazio (`canDisk()`) → `same` con nota `tooBig`; le schede grandi mostrano `bigNote`. `clearTmp()` cancella i file della cartella che non appartengono a schede presenti (`it.tmpName`); la chiamano l'avvio, `pagehide` e `tmpClean()`, usata in `loaded()`, nel cambio di modalità e in `finish()`. Dopo un salvataggio `tmpClean(90000)` aspetta 90 s (`tmpHold`), perché lo scaricamento legge ancora il file su disco. Un risultato scartato si cancella subito (`dropTmp`). In `saveElse`, senza cartelle e con video pronti oltre `SAFE` (`oneByOne()`), i file si scaricano uno alla volta (`saveDownload`) invece dello ZIP. Per le prove `?safe=1` rende «grande» ogni video.

Misure sul video di prova (720p, 6 s): stima e risultato entro il 2%; SSIM su tutto il video misurato con ffmpeg 0,990 / 0,979 / 0,960 per le soglie 0,985 / 0,97 / 0,95.

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
PDF: CMYK, JBIG2, JPEG 2000, CCITT non ricompressi; PDF con password saltati; tutto in RAM. Foto: colori ad ampia gamma un po' spenti; HEIC non leggibile. Video: HDR non ricodificati; video grandi su Safari prima della 26 saltati (manca la scrittura nella cartella privata); soglia sicura stimata, non misurata; con l'app in secondo piano la codifica può fermarsi; date e luogo nei metadati conservati solo se Mediabunny li riconosce. Scansione: rilevamento del foglio debole su sfondo chiaro; pieghe interne non corrette; ombre nette attenuate ma con alone. Cartelle: non scrivibili su iPhone, Firefox, Safari.

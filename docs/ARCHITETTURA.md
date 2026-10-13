# Architettura

Come è fatta l'app. Il *cosa* sta in `REQUISITI.md` (codici `R-…`); qui il *come*, con i nomi da cercare nel codice.

## Mappa del codice

Tutto il JavaScript è in `index.html`, dentro un'unica funzione, diviso da commenti `/* ---------- nome ---------- */`. Per arrivare a una sezione: `grep -n -- "---------- scansione" index.html`.

| Sezione (marcatore) | Funzioni principali | Requisiti |
|---|---|---|
| `lingue` | `pickLang`, `t`, `applyLang`, `showTitle`, `turnDrum`, `fitTitle`, `unsaved`, `stopWork`, `setMode`, `isPdf` | I18N, MOD |
| `carico` | `addFile`, `walkHandle`, `walkEntry`, `loaderOn`, `loaderOff` | CAR |
| `vista` | `render` | LST, SAV-08 |
| `motore` | `squeezePdf` (immagini in parallelo), `squeezeImage` (controlli e sostituzione nel PDF), `squeezeJpg`, `jpgOpts` | CMP, JPG |
| `worker` | `startPool`, `poolSize`, `runTask`, `poolWidth` | APP-09 |
| `video` | `loadMB`, `checkVideo`, `vRecall`, `vRemember`, `vFingerprint`, `vMemShow`, `probeAll`, `refineCurve`, `probeVideo`, `ssim`, `planVideo`, `planAll`, `goVideo`, `squeezeVideo` | VID |
| `salvataggio` | `saveBlob`, `ask`, `writeJobs`, `finish`, gestori di `saveAs`/`saveElse`/`saveBeside`/`overBtn` | SAV |
| `scansione con la fotocamera` | `detectPage`, `editCorners`, `makePage`, `warp`, `enhance`, `scanFileName` | SCN |
| `bordi` / `orientamento` | `paperMap`, `snapCorner`, `refineQuad`, `ocrWorker`, `autoOrient`, `findSkew`, `turnCanvas` | SCN-20…24 |
| `cattura` | `setAction`, `turnVerb`, `capRender`, `scanFile`, `galleryFiles`, `capBuild`, `capEdges`, `capMove`, `capSave` | SCN-14…19 |
| `avvio` | menu lingue, modalità iniziale | I18N, MOD-04 |
| `suoni` | `tone`, `hiss`, `sfx`, `playJingle`, `playSquash` | AUD-06 |
| `musica` | oggetto `music` (`start`, `stop`, `setMood`, `festa`), `MOOD`, `playStep` | AUD |
| `occhi` | `wink` | UI-01 |
| `cattura` (mascotte) | `snapFlash` (flash a ogni foto aggiunta) | UI-07 |
| `secondo piano` | `bgAsk`, `bgBegin`, `bgEnd`, `bgUpdate`, `bgText`, `progStart`/`progFrac`/`progEta`, `bgStop`, `bgNotify`, `humWav` | APP-05…08 |
| `condivisione` | `toast`, gestore di `shareBtn` | APP-02 |
| `installazione` | `beforeinstallprompt`, istruzioni iPhone | APP-01 |

Fuori dallo script principale: registrazione del service worker in fondo a `index.html` (APP-03).

| Altro file | Ruolo |
|---|---|
| `i18n.js` | `window.I18N`: un oggetto per lingua, stesse chiavi. Regole nella skill `traduzioni`. |
| `engine.js` | Motore delle immagini (`self.Engine`: `recompress`, `squeezeJpgFile`, `exifSegment`, `canWork`): gira nei worker o, dove non possono disegnare, nella pagina. |
| `tools/bench.mjs` | Misura i tempi (PDF, JPG, scansione, analisi video) con file di prova fissi; dentro l'app le misure si accendono con `?perf=1` (`perf()`, `window.__perf`). |
| `sw.js` | Cache offline: rete prima per pagina e testi, cache prima per `vendor/`, `icons/`, font. |
| `tools/mascot.mjs` | Unica fonte dei disegni della mascotte; `build-icons.mjs` li inietta in `index.html` tra `<!-- mascot:page|loader|scan -->`. L'oggetto sotto la pressa (`p-sheets`) ha tre versioni, `s-pdf`, `s-jpg`, `s-vid`, mostrate dal CSS secondo la modalità (UI-09). La testata ha anche gli accessori di Cattura (`gear`: occhiali, fotocamera, flash), nascosti fuori da Cattura (UI-07). |
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
`squeezePdf` apre con pdf-lib, prende i flussi `/Subtype /Image` (escluse le `SMask`) e li passa a più «corsie» in parallelo, quante sono i worker. `squeezeImage` fa i controlli e prepara il compito (byte del flusso, filtro, dimensioni, predittore); `Engine.recompress` (in `engine.js`, nel worker) decodifica (JPEG col browser, Flate con `DecompressionStream` + filtro PNG), riduce su `OffscreenCanvas` e ricodifica JPEG; la sostituzione nel PDF avviene nella pagina, solo se < 90%. Intoccati: CMYK, Indexed, `Decode`, `Mask`, JBIG2, JPX, CCITT. Forze in `PRESETS`: qualità 0,82/0,68/0,50, lato 2400/1700/1200.

## JPG (JPG)
`squeezeJpg` passa la foto a `Engine.squeezeJpgFile` nel worker; più foto insieme (una corsia per worker). Il motore decodifica raddrizzando l'orientamento, ridisegna entro il lato scelto; con peso massimo bisezione della qualità tra 0,30 e 0,92, poi riduzione delle dimensioni fino a 5 giri; senza peso qualità 0,80. EXIF ricopiato in testa con orientamento riportato a 1 (`exifSegment`); profilo colore non ricopiato. Su iPhone massimo 16 Mpx.

## Video (VID)
Libreria `vendor/mediabunny.min.mjs` (Mediabunny 1.59.1, MPL-2.0, licenza in `vendor/mediabunny-LICENSE.txt`), caricata con `import()` da `loadMB()` solo in modalità video. Sezione `video` in `index.html`.
1. `checkVideo()` all'ingresso nella modalità: `videoCodec()` sceglie il primo codec codificabile tra `hevc` e `avc` (`getFirstEncodableVideoCodec`). Se non ce n'è nessuno, `vidOk=false`: riga `#vidOff` e pulsanti di scelta spenti (VID-02). Per le prove automatiche `?vcodec=vp9` forza VP9, perché il Chromium di prova non ha H.264/HEVC.
2. Dopo la lettura `loaded()` lancia `probeAll()`: un video alla volta, stato `probe` con avanzamento nella scheda; `probeGen` interrompe l'analisi se l'elenco cambia. «Schiaccia!» resta spento finché l'analisi non finisce (`probing`).
3. `probeVideo(it)` (VID-04): `Input` su `BlobSource`; HDR (`hasHighDynamicRange`) → `same` con nota `hdr`; bitrate d'origine da `computePacketStats`. Spezzoni da 1,5 s (tutto il video se < 6 s, 2 se < 20 s, altrimenti 3); per ogni spezzone tre fotogrammi di riferimento presi con `CanvasSink`, al massimo a 1920 px di lato lungo (`fitSize`). Primo passaggio a bisezione (`refineCurve`): `nextFrac` sceglie la prossima frazione del bitrate d'origine (tra 0,035 e 0,85) finché due punti con rapporto ≤ 1,45 racchiudono la soglia del livello scelto. Per ogni punto gli spezzoni si codificano in parallelo (`clipScore`: `Conversion` con `trim`, audio scartato, `forceTranscode`, uscita in `BufferTarget`; se il codificatore non regge più sessioni, uno alla volta), con SSIM medio (`ssim()`, finestre 8×8 sulla luminosità) e bit al secondo reali. I fotogrammi di riferimento stanno in `it.vctx` solo durante l'analisi. Risultato in `it.vp` (`curve` ordinata con `f`, `b`, `q`, `rate`; `codec`, `dur`, `abr`, `aac`, `src`, `clips`).
4. Audio (VID-08): `aac` vale true se l'audio è PCM o oltre 256 kbps, il passaggio ad AAC 160 kbps fa risparmiare almeno il 5% del file e `canEncodeAudio("aac")` risponde sì; altrimenti si copia.
5. `planVideo(vp,soglia)` (VID-06): bitrate minimo che rispetta la soglia, interpolato sul logaritmo del bitrate tra i due gradini vicini, +5%; il peso stimato usa i bit al secondo reali (il codificatore resta sotto il bitrate chiesto). `planAll()` lo applica al livello scelto (`vThr()`); sotto il 10% di risparmio → `same` con nota `noGainV` (VID-07). Cambiando livello, `planAll()` rimette in analisi (`probe`) solo le schede la cui curva non racchiude la nuova soglia (`vCovered`), e `probeLoop` le completa con `refineCurve`.
6. `goVideo()` → `squeezeVideo(it)`: `Conversion` completa con `Quality({bitrate, bitrateMode:"variable"})`, audio copiato o AAC, uscita `MovOutputFormat` per `.mov` e `Mp4OutputFormat` (fastStart in memoria) per il resto, in `BufferTarget`; Wake Lock dello schermo (`wakeLock()`, VID-13). Se il risultato non scende sotto il 90% → `same`. WebM e MKV: `vidExt()` cambia `name` e `rel` in `.mp4` e toglie `handle`, così la sovrascrittura non è offerta (VID-10).
7. Scheda: peso → ≈ stima · codec · qualità, badge «≈ −NN%» in attesa (`render`).
8. Video grandi (VID-14…18): `SAFE` = 1/8 di `navigator.deviceMemory` (max 1 GB) o 300 MB. Se `plan.bytes > SAFE`, `squeezeVideo` scrive con `StreamTarget` su un `FileSystemWritableFileStream` di un file in `navigator.storage.getDirectory()/schiaccia-tmp/` (fastStart `false`, nessun accumulo in memoria) e `it.out` diventa il `File` su disco (`getFile()`); spazio controllato con `navigator.storage.estimate()`. Senza `createWritable` o senza spazio (`canDisk()`) → `same` con nota `tooBig`; le schede grandi mostrano `bigNote`. `clearTmp()` cancella i file della cartella che non appartengono a schede presenti (`it.tmpName`); la chiamano l'avvio, `pagehide` e `tmpClean()`, usata in `loaded()`, nel cambio di modalità e in `finish()`. Dopo un salvataggio `tmpClean(90000)` aspetta 90 s (`tmpHold`), perché lo scaricamento legge ancora il file su disco. Un risultato scartato si cancella subito (`dropTmp`). In `saveElse`, senza cartelle e con video pronti oltre `SAFE` (`oneByOne()`), i file si scaricano uno alla volta (`saveDownload`) invece dello ZIP. Per le prove `?safe=1` rende «grande» ogni video.

9. Memoria delle analisi (VID-19): IndexedDB `schiaccia`, archivio `vprobe`, chiave `vFingerprint(it)` = percorso | dimensione | data di modifica | SHA-256 (12 byte) dei primi e ultimi 64 KB. Valore `{ver: VPV, dev: vidCodec, v | hdr | light}`; si usa solo con la stessa `VPV` (versione del metodo, da aumentare quando cambia l'analisi) e lo stesso formato del dispositivo. `probeLoop` prima chiede `vRecall`, poi analizza o completa la curva, e registra con `vRemember` appena finito ogni video. «Dimentica le analisi salvate» = `vForget`.
10. Compressione durante l'analisi (VID-20): `goVideo` prende il primo video pronto (`wait` con `plan`); se non ce ne sono e l'analisi è ancora in corso, aspetta. Mentre comprime, `refineCurve` codifica gli spezzoni uno alla volta, per non contendere le sessioni del codificatore.
11. Scarto rapido (VID-21): in `probeVideo0`, bit per pixel e fotogramma = bitrate / (larghezza × altezza × fotogrammi al secondo); sotto 0,035 (H.264) o 0,05 (HEVC, VP9, AV1) → `{light:true}`, scheda «già leggero» senza codifiche di prova.

Misure sul video di prova (720p, 6 s): stima e risultato entro il 2%; SSIM su tutto il video misurato con ffmpeg 0,990 / 0,979 / 0,960 per le soglie 0,985 / 0,97 / 0,95.

## Cattura (SCN-14…19)
Sezione `cattura` in `index.html`, dopo `makePage` e `scanFileName`.
- Stato: `act` (`"squash"`/`"capture"`, classe `act-cap` su `<body>`) e `cap = {pages:[{work, q, mids, rot, style, blob, url}], sel}`. `style` nullo = stile generale `scanStyle` (`capStyle()`). Le sezioni della compressione hanno la classe `squash` e spariscono in Cattura; `#capture` e `#capMsg` spariscono in Schiaccia. `say()` scrive in `#capMsg` quando si è in Cattura.
- Titolo: `showTitle()` costruisce due rulli dal testo di `h1` e `h1C`: `#actBtn` (il verbo, cioè il testo fuori dallo `<span>`, prima o dopo secondo la lingua; `turnVerb()`) e `#modeBtn`. In modalità video `#actBtn` è spento (`aria-disabled`, freccette nascoste); in Cattura `#modeBtn` alterna solo PDF e JPG e `setMode` rifiuta `video`. `fitTitle()` somma, per ogni rullo, la faccia più larga.
- `setAction(a)` (SCN-18): conferma se in Schiaccia c'è lavoro (`unsavedSquash()`) o in Cattura ci sono pagine; poi `stopWork()` e `reset()`, oppure `capClear()`. Passare tra PDF e JPG in Cattura non chiede nulla: le pagine restano e cambia solo come si salvano. Il tasto fotocamera chiama `setAction`; le icone `.i-cam` e `.i-squash` si scambiano con `act-cap`.
- `t(k)`: in Cattura prova prima `kC` (e la sua variante `kCJ` in JPG): `subC`, `subCJ`.
- `capRender()` ridisegna tutto: con `matchMedia("(min-width:760px)")` la proposta B (griglia `.card` trascinabili con `capMove`, menu dello stile, barra `.dock` sticky), altrimenti la A (`.capBig`, striscia `.thumb` con «+», strumenti della pagina selezionata, `styleSeg` con «Come tutte», pannello Salva).
- Pagine: `scanFile` (fotocamera → `editCorners` → `capBuild`); `capTarget` indica la pagina da rifare (anche dal «Rifai» dell'editor). `galleryFiles` (input `#galInput` multiplo): bordi da `detectPage` o rettangolo rientrato, senza editor. `capBuild(p)` = `makePage` con lo stile della pagina + `rotBlob` per la rotazione; `capRebuild(list)` con la schermata `scan`. Lo stile generale si sceglie con `capSetStyle` (rifà le pagine senza stile proprio); quello della pagina con `pageStyle`. Nell'editor la scelta dello stile è nascosta (`#scanStyle`).
- Salvataggio `capSave()`: PDF con pdf-lib (lato lungo 842 pt) e `saveBlob`; JPG una pagina con `saveBlob`, più pagine in una cartella (`showDirectoryPicker`, nomi `scansione-…-1.jpg`) o in uno ZIP. `capDone()` svuota la schermata.

## Bordi, orientamento e raddrizzamento del testo (SCN-20…24)
Sezioni `bordi` e `orientamento` in `index.html`, dopo `detectPage`.
- `paperMap(work)`: punteggio carta/sfondo (luminosità − 0,8 × saturazione, come `detectPage`) a 900 px di lato lungo, soglia di Otsu abbassata verso lo sfondo, contrasto tra le due medie; in cache per ogni `work` (`WeakMap`). `edgeAlong(m, punto, normale, R)` trova lungo la normale il passaggio carta → sfondo più vicino (carta per 2 e 5 px all'interno, sfondo 2 px fuori, salto ≥ 35% del contrasto).
- Calamita (SCN-23): in `editCorners`, al rilascio di un angolo, `snapCorner` campiona i due lati vicini tra il 6% e il 40% della loro lunghezza (ricerca entro il 6% del lato corto), adatta una retta per lato (`lineFit`, minimi quadrati totali con scarto degli outlier) e prende l'incrocio (`lineCross`) se dista meno di 1,6 × il raggio. Le maniglie dei lati seguono come nel trascinamento.
- Controllo (SCN-24): `refineQuad` in `capBuild`, una volta per pagina (`p.refined`) e di nuovo dopo «Bordi». Per ogni lato 9 punti presi dalla mappatura della pagina (`pageMap`), ricerca lungo la normale verso l'esterno entro il 9%; se ci sono almeno 5 passaggi e almeno 3 stanno dentro, il lato diventa la retta trovata (e la maniglia prende la curvatura dei punti centrali). Si sposta solo verso l'interno. Un angolo si ricalcola se almeno uno dei due lati è stato corretto (l'altro resta la retta tra i suoi angoli) e se si sposta meno del 20% del lato corto.
- Orientamento (SCN-20/22): `ocrWorker()` aggiunge `vendor/tesseract/tesseract.min.js` solo al primo uso e crea un worker «osd» con il core SIMD «legacy» (`legacyCore`, `legacyLang`, `cacheMethod:"none"`: ci pensa `sw.js`). `autoOrient(cv)` passa a `worker.detect()` la pagina in grigio a 1600 px: `orientation_degrees` è la rotazione oraria da applicare e si usa se la fiducia è ≥ 2. Se Tesseract non si carica, `ocrBad` lo salta per il resto della sessione. Al primo caricamento la schermata `scan` mostra `ocrLoad`.
- Raddrizzamento fine (SCN-21): `findSkew` sulla pagina già girata, in grigio a 1000 px: pixel più scuri della media − 45, profilo orizzontale proiettato per angoli da −10° a +10° (passo 0,5° poi 0,1°), punteggio = somma dei quadrati delle differenze tra righe vicine; si corregge se |angolo| ≥ 0,2° e il profilo migliora di almeno il 5%.
- `capBuild`: `refineQuad` → `pageCanvas` (warp + stile) → `autoOrient` (in cache in `p.auto`; si rifà solo dopo «Bordi») → `turnCanvas` (quarti di giro automatici + «Ruota» + inclinazione, angoli scoperti bianchi, una sola ricampionatura) → JPEG.
- Misure (prove con foto finte di un foglio in prospettiva su un tavolo scuro): orientamento giusto in 52 casi su 52 su pagine pulite (13 lingue × 4 rotazioni) e in 8 su 8 su foto, compresi capovolti e coricati; circa 1,2 s a pagina al computer. Calamita entro 5 px su 1500; un angolo lasciato a 150 px nello sfondo viene riportato a 6 px dal vero.

## PDF ricercabile e caricamento pigro (SCN-25, APP-04)
- `loadScript(src)` aggiunge uno script una volta sola. JSZip non è più nella pagina: `zipLib()` lo carica al primo ZIP. `sw.js` tiene in `CORE` solo pagina, testi, pdf-lib e icone; Mediabunny, JSZip e Tesseract entrano in cache al primo uso («cache prima» per `vendor/`).
- `autoOrient` conserva anche `script` (da `worker.detect()`). `ocrLangFor(script)` sceglie la lingua (vedi SCN-25). I dati stanno in `vendor/tesseract/lang/<lingua>.traineddata.gz` (`@tesseract.js-data/*`, modelli `4.0.0_best_int`).
- `capSave` in PDF, con la casella `#ocrText` accesa: un secondo worker LSTM (`ocrRecWorker(lingua)`, `reinitialize` se la lingua cambia) riconosce ogni pagina con `{pdfTextOnly:true}` e uscita `{pdf:true}`; la pagina di solo testo, con il carattere invisibile `GlyphLessFont` di Tesseract (codifica Unicode, vale per ogni alfabeto), si incolla sopra l'immagine con `embedPdf` + `drawPage` alla stessa misura: nelle prove le parole cadono entro mezzo punto da quelle dell'immagine. Errori: la pagina resta senza testo. La casella è `ocrBox()` (in A nel pannello Salva, in B sotto la griglia, solo in PDF), memorizzata in `localStorage.ocrText`. Circa 1 s a pagina al computer.

## Worker (APP-09)
`startPool()` crea al primo uso 2–4 worker su `engine.js` (`poolSize`: processori − 1, da 2 a 4; 1 con 2 GB di memoria, 2 con 4 GB; `?workers=N` per le prove) e chiede al primo se sa disegnare (`ping` → `canWork`). Se no, o senza `Worker`/`OffscreenCanvas`, carica `engine.js` nella pagina e lavora lì. `runTask(msg, transfer, onPct)` mette in coda; i byte delle immagini viaggiano trasferiti, non copiati.

## Scansione sulla scheda grafica (APP-09)
`pageCanvas` prova prima `glPage` (WebGL2): raddrizzamento con una griglia 48×N di triangoli i cui vertici passano per `pageMap` (campionamento bilineare della grafica) nella texture A; copia piccola (lato ≈ 600 px) letta con `readPixels` per la luce del foglio (riquadri, massimo, allargamento e sfumatura come `enhance`), l'istogramma e i livelli; poi uno shader fa divisione per la luce e curve (`mode` 0 colore, 1 documento, 2 bianco e nero) sulla pagina intera, copiata in una tela 2D. Risultato uguale al calcolo in JavaScript (differenza media ~2 su 255). Si torna a `warp` + `enhance` se WebGL2 manca, se la texture supera il massimo, se c'è un errore, se il contesto si perde, o se la grafica è simulata dal processore (SwiftShader, llvmpipe: lì è più lenta); `?gl=0` / `?gl=1` forzano le due strade.

## Misure (tools/bench.mjs, 2 core, grafica simulata)
| | Prima (2.13.0) | Dopo (2.14.0) |
|---|---|---|
| PDF, 2 file × 6 immagini | 1,16 s | 0,69 s |
| JPG, 6 foto 4000×3000 | 1,92 s | 0,82 s |
| Scansione, 3 pagine (JS; WebGL non misurabile qui) | 0,79 s | 0,78 s |
| Analisi video, 4 s | 12,4 s | 6,1–6,9 s |
Sui telefoni contano anche più core (fino a 4 worker) e la grafica vera.

## Scansione (SCN)
1. «Scatta» in Cattura apre `<input id="camInput" capture="environment">`: fotocamera di sistema, nessun permesso.
2. `workFrom` riduce la foto a 3000 px (`work`).
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
7. La pagina finita va nella schermata Cattura (vedi sopra), che fa anche anteprima e salvataggio.

## Cartelle (CAR, SAV)
Tre ingressi: `showDirectoryPicker` (lettura e scrittura: unico che consente «accanto» e «sovrascrivi»), `<input webkitdirectory>` e trascinamento (sola lettura). File scelti con `showOpenFilePicker` portano `handle` (sovrascrivibili). Ogni elemento tiene `handle` e `dir`. `writeJobs` scrive con la schermata `back`; prima si contano i file già presenti (`okToReplace`).

| Salvataggio | Serve | Come |
|---|---|---|
| Salva con nome | — | `showSaveFilePicker`, altrimenti download |
| Altra cartella | `showDirectoryPicker` | ricrea i percorsi relativi; senza: ZIP |
| Accanto | `dir` su ogni file | stesso nome con prefisso/suffisso |
| Sovrascrivi | `handle` su ogni file | `createWritable` sull'originale |

## Schermata a tutto schermo
`loaderOn(mode, titolo)` / `loaderOff()`; gli oggetti che volano (`.fly`) ci sono in tre versioni (`k-pdf`, `k-jpg`, `k-vid`) e il CSS mostra quella della modalità (UI-08); rende inerte `#app`, resta almeno 0,9 s. Classi su `#loader`: nessuna = lettura cartella (schedario), `back` = scrittura (fogli che tornano), `scan` = scansione (scena `mascot:scan`, senza «Annulla»). Ogni classe sceglie anche l'umore della musica.

## Suoni e musica (AUD)
Tutto Web Audio, niente file. `music` mette in coda le note ~0,35 s prima; umori in `MOOD` (bpm, filtro, giro, melodia) e stili in `playStep`: `calm`, `mystery` (giro con re maggiore, staccato), `drive`, `joy`, `scan`, `jump` (fanfara, `festa()`). Volume del sottofondo in `VOL`. L'audio parte al primo tocco e si sospende con la pagina nascosta.

## Secondo piano (APP-05…08)
Sezione `secondo piano` in `index.html`, prima di `condivisione`.
- `bgAsk()` all'inizio di compressione, analisi video e codifica video: la prima volta chiede (`ask`) se continuare fuori dall'app; il pulsante «Sì» chiede anche il permesso per le notifiche dentro il tocco. Risposta in `localStorage.bg`. Su iPhone (`isIOS`) solo il `toast` `bgIos`, una volta per sessione.
- `bgBegin()` / `bgEnd()` contano i lavori in corso (`bgN`): li chiamano `loaderOn`/`loaderOff` (lettura cartelle, scrittura, scansione, PDF di Cattura), la compressione, `goVideo` e `probeAll` (che ora gira il ciclo in `probeLoop`). Con `bgOn()` suona in loop un `<audio>` con un ronzio a 60 Hz e −50 dB generato al volo (`humWav`, 2 s, 120 periodi esatti): Chrome non congela le pagine che riproducono audio e mostra il riquadro del lettore.
- `bgUpdate(testo)` aggiorna `navigator.mediaSession.metadata` al massimo ogni 0,8 s; il testo viene da `bgText()` (in `render`) o dal loader. `bgText` mostra «Schiaccio i di n · pct%» e il tempo residuo: `progStart(kind)` («work» in `goBtn`/`goVideo`, «probe» in `probeAll`) fissa i file del giro e il loro peso totale; `progFrac` dà la frazione complessiva pesata per dimensione (il file in corso conta per il suo `pct`); `progEta` stima il residuo dalla velocità reale (dopo il 2% e 4 s, media mobile 0,8/0,2, sotto il minuto a passi di 5 s; chiavi `bgEta`, `timeMin`, `timeSec`). Le azioni «pausa» e «stop» del lettore chiamano `bgStop()` (annulla lettura, compressione e codifica in corso).
- Il `visibilitychange` non sospende più l'audio mentre si lavora in secondo piano.
- `bgNotify(testo)` a fine lavoro (compressione, codifica, analisi, `finish()` del salvataggio), solo con la pagina nascosta e il permesso concesso: `showNotification` dal service worker; in `sw.js` `notificationclick` riporta all'app.
- Limiti: su iPhone il lavoro si ferma fuori dall'app; se il sistema chiude la pagina per memoria il lavoro si perde; il ronzio potrebbe non bastare su alcuni telefoni (va provato).

## Cache offline (APP-03)
`sw.js`: installazione con `cache: "reload"`; pagina e testi rete prima (cache se manca o > 4 s); `vendor/`, `icons/`, font cache prima. Il nome cache lo cambia `pages.yml`. Al cambio di service worker la pagina si ricarica se non c'è lavoro in corso.

## Limiti noti
PDF: CMYK, JBIG2, JPEG 2000, CCITT non ricompressi; PDF con password saltati; tutto in RAM. Foto: colori ad ampia gamma un po' spenti; HEIC non leggibile. Video: HDR non ricodificati; video grandi su Safari prima della 26 saltati (manca la scrittura nella cartella privata); soglia sicura stimata, non misurata; con l'app in secondo piano la codifica può fermarsi; date e luogo nei metadati conservati solo se Mediabunny li riconosce. Scansione: rilevamento del foglio, calamita e controllo dei bordi deboli su sfondo chiaro (foglio bianco su tavolo bianco); orientamento incerto su pagine con poco testo (resta com'è); raddrizzamento fine pensato per righe di testo orizzontali; pieghe interne non corrette; ombre nette attenuate ma con alone. Cartelle: non scrivibili su iPhone, Firefox, Safari.

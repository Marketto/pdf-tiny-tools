# Schiaccia PDF (e JPG, e video)

Compressore di PDF a fumetti che gira tutto nel browser: carichi i PDF pieni di immagini, scegli la forza, salvi le versioni leggere. I file non lasciano mai il dispositivo.

- **PDF**: ricomprime in JPEG le immagini dentro il documento; testo, link e pagine restano come sono.
- **JPG**: toccando la parola «PDF» nel titolo, che ruota come un rullo, l'app passa alle foto: si sceglie un lato lungo massimo e un peso massimo, e data e luogo dello scatto si possono conservare.
- **Video**: un altro giro del rullo porta ai video (MP4, MOV, M4V; anche WebM e MKV, salvati come MP4). Appena caricati, l'app ne analizza qualche spezzone e stima per ciascuno peso e qualità; si sceglie tra massima qualità, bilanciato e massimo risparmio (sempre sopra il 95% di somiglianza), poi ricodifica in HEVC o H.264 lasciando invariati risoluzione e fotogrammi al secondo. Le analisi fatte restano salvate sul dispositivo (solo i numeri, non i video): riaprendo la stessa cartella si riparte da dove si era rimasti, e si può cominciare a comprimere mentre l'analisi va avanti. Serve un browser che sappia codificare video (Chrome, Edge, Safari aggiornati); i video HDR restano come sono. I video grandi vengono scritti a pezzi su disco, in una cartella privata del browser che l'app svuota da sola (al più tardi alla riapertura), così non riempiono la memoria del telefono.
- **Cattura**: toccando il verbo del titolo («Schiaccia ⇄ Cattura») o il pulsante della fotocamera si passa a una schermata per fotografare fogli. L'app propone da sola angoli e curvatura dei lati (con un reticolato che mostra il raddrizzamento), raddrizza e pulisce la luce, gira la pagina perché il testo si legga dritto nella sua lingua (con Tesseract, sul dispositivo, scaricato al primo uso) e raddrizza le righe storte. Il PDF salvato ha il testo selezionabile e ricercabile (si può spegnere); i dati della lingua, 0,7–3 MB, si scaricano solo la prima volta che servono. Gli angoli si agganciano al bordo del foglio e, se un lato lascia vedere lo sfondo, si corregge da solo; le pagine si ruotano, si rifanno, si spostano, si eliminano e hanno uno stile (Documento, Bianco e nero, Colore) comune o proprio. In PDF si salvano in un unico file, in JPG una foto per pagina. Al telefono la schermata è a tre passi, al computer una griglia di schede. Non c'è per i video.
- Funziona su file singoli, su più file o su una cartella intera (sottocartelle comprese).
- Con un solo file si salva con nome o si sovrascrive l'originale; con più file si salva in un'altra cartella mantenendo la struttura, accanto agli originali con un prefisso o un suffisso, oppure si sovrascrive, sempre dopo conferma. Scrivere nelle cartelle richiede Chrome o Edge da computer; altrove si scarica il file o uno ZIP.
- Si installa come app su Android e iPhone e funziona anche senza rete dopo la prima apertura. Su Android può continuare a lavorare mentre usi altre app, con l'avanzamento nella tendina delle notifiche e un avviso alla fine; su iPhone il lavoro si ferma finché non torni nell'app.

## Lingue

L'interfaccia sceglie da sola la lingua del browser e si può cambiare dal menu in alto; la scelta viene ricordata. Sono disponibili: italiano, inglese, cinese, hindi, spagnolo, francese, arabo, bengalese, portoghese, russo, urdu, indonesiano e tedesco. Se la lingua del browser non è tra queste, si usa l'inglese.

I testi stanno tutti in `i18n.js`: per aggiungere una lingua basta copiare un blocco, cambiare la sigla e tradurre i valori.

## Installazione

- **Android (Chrome):** apri la pagina, menu ⋮, «Aggiungi a schermata Home» / «Installa app».
- **iPhone (Safari):** apri la pagina, Condividi, «Aggiungi alla schermata Home».

## Librerie incluse

[pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 (MIT) e [JSZip](https://github.com/Stuk/jszip) 3.10.1 (MIT o GPLv3), in `vendor/`.

## Sviluppo

Il sito non ha build né dipendenze: si modifica e si apre. Per provarlo in locale basta `python3 -m http.server` nella cartella del progetto.

- [`docs/REQUISITI.md`](docs/REQUISITI.md): cosa deve fare l'app, secondo le decisioni prese finora.
- [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md): come funziona la compressione e come è organizzato il codice.
- [`docs/AGENTI.md`](docs/AGENTI.md): come lavorare al progetto con un agente di programmazione (skill, agenti, strumenti).
- `node tools/check-i18n.mjs` controlla le traduzioni; `node tools/smoke-test.mjs` prova l'app in un browser vero.

## Pubblicazione

Ogni push su `main` controlla le traduzioni e pubblica il sito su GitHub Pages tramite `.github/workflows/pages.yml`. Cambiare il numero in `VERSION` crea il tag corrispondente. Serve una sola impostazione iniziale: in **Settings → Pages**, alla voce «Source», scegliere **GitHub Actions**.

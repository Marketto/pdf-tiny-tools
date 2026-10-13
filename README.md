# Schiaccia PDF (e JPG, e video)

Compressore di PDF a fumetti che gira tutto nel browser: carichi i PDF pieni di immagini, scegli la forza, salvi le versioni leggere. I file non lasciano mai il dispositivo.

- **PDF**: ricomprime in JPEG le immagini dentro il documento; testo, link e pagine restano come sono.
- **JPG**: toccando la parola «PDF» nel titolo, che ruota come un rullo, l'app passa alle foto: si sceglie un lato lungo massimo e un peso massimo, e data e luogo dello scatto si possono conservare.
- **Video**: un altro giro del rullo porta ai video (MP4, MOV, M4V; anche WebM e MKV, salvati come MP4). Appena caricati, l'app ne analizza qualche spezzone e stima per ciascuno peso e qualità; si sceglie tra massima qualità, bilanciato e massimo risparmio (sempre sopra il 95% di somiglianza), poi ricodifica in HEVC o H.264 lasciando invariati risoluzione e fotogrammi al secondo. Serve un browser che sappia codificare video (Chrome, Edge, Safari aggiornati); i video HDR restano come sono. I video grandi vengono scritti a pezzi su disco, in una cartella privata del browser che l'app svuota da sola (al più tardi alla riapertura), così non riempiono la memoria del telefono.
- **Scansione**: con il pulsante della fotocamera si fotografa un foglio; l'app propone da sola angoli e curvatura dei lati (con un reticolato che mostra il raddrizzamento), si correggono se serve, poi raddrizza, pulisce la luce e mostra un'anteprima; in modalità PDF le pagine si raccolgono in un unico PDF, in modalità JPG ogni scatto è una foto. In modalità video il pulsante è nascosto.
- Funziona su file singoli, su più file o su una cartella intera (sottocartelle comprese).
- Con un solo file si salva con nome o si sovrascrive l'originale; con più file si salva in un'altra cartella mantenendo la struttura, accanto agli originali con un prefisso o un suffisso, oppure si sovrascrive, sempre dopo conferma. Scrivere nelle cartelle richiede Chrome o Edge da computer; altrove si scarica il file o uno ZIP.
- Si installa come app su Android e iPhone e funziona anche senza rete dopo la prima apertura.

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

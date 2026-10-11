# Schiaccia PDF (e JPG)

Compressore di PDF a fumetti che gira tutto nel browser: carichi i PDF pieni di immagini, scegli la forza, salvi le versioni leggere. I file non lasciano mai il dispositivo.

- **PDF**: ricomprime in JPEG le immagini dentro il documento; testo, link e pagine restano come sono.
- **JPG**: toccando la parola «PDF» nel titolo, che ruota come un rullo, l'app passa alle foto: si sceglie un lato lungo massimo e un peso massimo, e data e luogo dello scatto si possono conservare.
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

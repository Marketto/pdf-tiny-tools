# Schiaccia PDF (e JPG, e video, e tutto insieme)

Compressore di PDF a fumetti che gira tutto nel browser: carichi i PDF pieni di immagini, scegli la forza, salvi le versioni leggere. In tutte le modalità le forze sono tre: Carezza (predefinita: qualità alta, misure originali), Stretta (più leggera, misure originali) e Martellata (come Stretta, e in più riduce immagini, foto e video più grandi). I file non lasciano mai il dispositivo; l'app conta solo statistiche d'uso anonime e senza cookie (GoatCounter), disattivabili dalla riga in fondo alla pagina.

- **PDF**: ricomprime in JPEG le immagini dentro il documento; testo, link e pagine restano come sono.
- **JPG**: toccando la parola «PDF» nel titolo, che ruota come un rullo, l'app passa alle foto: le foto si ricomprimono con la forza scelta, e data, luogo e profilo colore restano sempre.
- **Video**: un altro giro del rullo porta ai video (MP4, MOV, M4V; anche WebM e MKV, salvati come MP4). Come per PDF e foto si preme subito «Schiaccia!»: per ogni video l'app legge codifica e bitrate, stima la compressione giusta e la verifica misurando quanto il risultato somiglia all'originale (i video corti li prova interi, quelli lunghi su qualche spezzone); la forza decide la qualità minima (97% o 95% di somiglianza), poi ricodifica in HEVC o H.264 lasciando invariati i fotogrammi al secondo e, salvo in Martellata (dove oltre il Full HD si scende a 1080p), la risoluzione. Le misure fatte restano salvate sul dispositivo (solo i numeri, non i video): ricomprimendo gli stessi video non si rimisura. Serve un browser che sappia codificare video (Chrome, Edge, Safari aggiornati); i video HDR restano come sono. I video grandi vengono scritti a pezzi su disco, in una cartella privata del browser che l'app svuota da sola (al più tardi alla riapertura), così non riempiono la memoria del telefono.
- **Tutto**: il quarto giro del rullo prende insieme PDF, foto JPG e video di una cartella (gli altri file si saltano e si contano). Un solo livello vale per tutti i tipi, e «Regola per tipo» permette di cambiarne uno solo; prima si schiacciano PDF e foto, poi i video, con le stesse regole delle loro modalità. Ha un aspetto olografico, con colori che si muovono come un gas.
- **Pausa**: durante la compressione una schermata mostra l'avanzamento; si può annullare o mettere in pausa. Un lavoro in pausa (anche quando si cambia modalità) resta sul dispositivo con i file già pronti: alla riapertura l'app lo propone da riprendere o eliminare.
- **Cattura**: toccando il verbo del titolo («Schiaccia ⇄ Cattura») o il pulsante della fotocamera si passa a una schermata per fotografare fogli. L'app propone da sola angoli e curvatura dei lati (con un reticolato che mostra il raddrizzamento), raddrizza e pulisce la luce, gira la pagina perché il testo si legga dritto nella sua lingua (con Tesseract, sul dispositivo, scaricato al primo uso) e raddrizza le righe storte. Il PDF salvato ha il testo selezionabile e ricercabile (si può spegnere); i dati della lingua, 0,7–3 MB, si scaricano solo la prima volta che servono. Gli angoli si agganciano al bordo del foglio e, se un lato lascia vedere lo sfondo, si corregge da solo; le pagine si ruotano, si rifanno, si spostano, si eliminano e hanno uno stile (Documento, Bianco e nero, Colore) comune o proprio. In PDF si salvano in un unico file, in JPG una foto per pagina. Al telefono la schermata è a tre passi, al computer una griglia di schede. Non c'è per i video.
- Funziona su file singoli, su più file o su una cartella intera (sottocartelle comprese).
- Con un solo file si salva con nome o si sovrascrive l'originale; con più file si salva in un'altra cartella mantenendo la struttura, accanto agli originali con un prefisso o un suffisso, oppure si sovrascrive, sempre dopo conferma. Scrivere nelle cartelle richiede Chrome o Edge da computer; altrove si scarica il file o uno ZIP.
- Si installa come app su Android e iPhone e funziona anche senza rete dopo la prima apertura. Su Android può continuare a lavorare mentre usi altre app, con l'avanzamento nella tendina delle notifiche e un avviso alla fine; su iPhone il lavoro si ferma finché non torni nell'app.

## Lingue

L'interfaccia sceglie da sola la lingua del browser e si può cambiare dal menu in alto; la scelta viene ricordata. Sono disponibili: italiano, inglese, cinese, hindi, spagnolo, francese, arabo, bengalese, portoghese, russo, urdu, indonesiano e tedesco, e tutte le altre lingue europee: albanese, bielorusso, bosniaco, bulgaro, ceco, croato, danese, estone, finlandese, greco, irlandese, islandese, lettone, lituano, macedone, maltese, norvegese, olandese, polacco, rumeno, serbo, slovacco, sloveno, svedese, ucraino e ungherese (39 in tutto). Se la lingua del browser non è tra queste, si usa l'inglese.

I testi stanno in `i18n/`, un file per lingua: l'app scarica solo quello della lingua in uso. Per aggiungere una lingua basta copiare un file, cambiare la sigla, tradurre i valori e aggiungerla all'elenco `i18n/index.js`.

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

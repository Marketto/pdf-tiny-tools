---
name: verifica
description: Controllare che l'app funzioni dopo una modifica e prima di pubblicare - traduzioni, layout, compressione reale nel browser. Da usare alla fine di ogni lavoro.
---

# Verifica

Due livelli. Il primo è obbligatorio dopo ogni modifica, il secondo ogni volta che cambia `index.html`, `i18n.js` o `sw.js`.

## 1. Controllo dei testi (pochi secondi, nessuna dipendenza)

```bash
node tools/check-i18n.mjs
```

Deve finire con `problemi: 0`. È lo stesso controllo che blocca la pubblicazione su GitHub.

## 2. Prova nel browser

```bash
cd tools && npm install   # solo la prima volta
node tools/smoke-test.mjs
```

Apre l'app in otto lingue (compresa una da destra a sinistra, una non supportata, il norvegese dal codice «nb» del browser, il greco e l'ucraino), controlla che non ci siano errori JavaScript né scorrimento orizzontale a 400 px, poi crea un PDF di prova, lo comprime e verifica che esca più leggero. Infine passa alla modalità JPG dal rullo del titolo, comprime una foto di prova con Carezza e con Martellata e controlla nome, peso, misure (originali, poi 2048 px), dati dello scatto e profilo colore del file salvato. Poi passa alla modalità video (con `?vcodec=vp9`, perché il Chromium di prova non ha H.264/HEVC): crea un video di prova nella pagina, controlla che «Schiaccia!» si prema subito (niente analisi prima), misura e codifica in un giro con qualità sopra la soglia, estensione, risoluzione e numero di fotogrammi; prova la memoria delle analisi (stesso video ricompresso dopo un ricaricamento: niente nuove misure; «Dimentica le analisi salvate»); con `?safe=1` prova i video grandi: scrittura su disco nella cartella privata, download uno alla volta, file completo, pulizia alla riapertura. Chiude con Cattura: passaggio dal tasto fotocamera, verbo del titolo, due pagine dalla fotocamera simulata (editor con angoli, lati e reticolato), «Prima | Elimina | Dopo» sotto la striscia, «Automatico» già acceso che non fa niente, «Angoli a mano» (passa dall'editor, ripremuto lo riapre) e ritorno ad «Automatico», rotazione e stile di una pagina, passaggio a JPG senza perdere le pagine, griglia al computer, PDF di due pagine, conferma tornando a Schiaccia, verbo spento in modalità video. Poi una foto finta di un foglio capovolto e storto: calamita su un angolo, controllo dei bordi su un angolo lasciato nello sfondo, orientamento verificato con un secondo Tesseract, PDF con il livello di testo invisibile; un foglio finto con righe ondulate e uno scalino, che deve uscire con le righe dritte (pieghe distese), caricamento pigro (niente JSZip, Mediabunny o Tesseract all'avvio; una sola lingua scaricata al salvataggio). Nel secondo piano controlla anche la riga «fuori dall'app» con «Cambia». Con la memoria delle analisi controlla che la casella «Salva ogni video appena è pronto» non ci sia più e che a fine compressione compaiano i pulsanti per salvare. Prova la pulizia all'avvio (dati di un formato vecchio proposti e cancellati, lavori validi lasciati). Prova pausa e ripresa: schermata di lavoro con pressa, Caramella e pulsanti larghi uguale; «Metti in pausa» durante la compressione, finestra dei lavori in pausa alla riapertura, «Riprendi» con gli stessi file (i già pronti restano pronti), completamento, «Annulla» con conferma. Prova la modalità TUTTO: rullo alla quarta faccia, Cattura spenta, mascotte olografica, livello unico che imposta i tre tipi, un PDF, una foto e un video caricati insieme con un file di altro tipo (saltato e contato), etichette e ordine, tutti e tre alleggeriti in un giro. Controlla anche che il titolo abbia la stessa grandezza nelle quattro modalità e stia su una riga a 360 px.

Prova anche il motore senza worker (`?workers=0`) e la scansione sulla scheda grafica contro il calcolo in JavaScript (`?gl=1` / `?gl=0`, stesso risultato).

Per una modifica che tocca le prestazioni, misura con `node tools/bench.mjs "prima"` e `"dopo"` e riporta i due numeri.

## Cosa la prova automatica non copre

Dillo esplicitamente nel resoconto, senza darlo per verificato:

- scelta di una cartella vera e i salvataggi che scrivono nelle cartelle (altra cartella, accanto agli originali, sovrascrittura);
- installazione su Android e iPhone, funzionamento senza rete;
- i suoni (si possono solo ascoltare);
- il lavoro in secondo piano e le notifiche sui telefoni veri (la prova controlla solo domanda, riquadro del lettore e spegnimento a fine lavoro);
- la codifica video vera in HEVC e H.264 (si prova solo su un dispositivo che li ha: telefono o Chrome/Edge/Safari da computer), l'audio ricompresso in AAC e i video lunghi;
- l'aspetto: per una modifica visiva guarda uno screenshot, a larghezza telefono e computer.

## Come riferire

Una riga per controllo: cosa hai eseguito, com'è andata. Se qualcosa fallisce riporta il messaggio così com'è. Non scrivere «tutto funziona» se hai eseguito solo il primo livello.

---
name: verifica
description: Controllare che l'app funzioni dopo una modifica e prima di pubblicare - traduzioni, layout, compressione reale nel browser. Da usare alla fine di ogni lavoro.
---

# Verifica

Due livelli. Il primo è obbligatorio dopo ogni modifica, il secondo ogni volta che cambia `index.html`, i testi in `i18n/` o `sw.js`.

## 1. Controllo dei testi (pochi secondi, nessuna dipendenza)

```bash
node tools/check-i18n.mjs
node --test tests/*.test.mjs
```

Il primo deve finire con `problemi: 0`, il secondo con `fail 0`. È lo stesso controllo che blocca la pubblicazione su GitHub.

## 2. Prova nel browser

```bash
cd tools && npm install   # solo la prima volta
node tools/smoke-test.mjs
node tools/motore-test.mjs
```

`smoke-test.mjs` apre l'app in otto lingue (destra-sinistra, non supportata, `nb`, greco, ucraino) senza errori JavaScript né scorrimento orizzontale a 400 px, e prova davvero compressione di PDF, JPG e video, Tutto, Cattura, Compila, Modifica, lavoro salvato, benvenuto, novità, condizioni d'uso e secondo piano. L'elenco completo è il file stesso (ogni controllo stampa una riga «✓»); quando aggiungi una funzione aggiungi lì il suo controllo. `motore-test.mjs` usa `motore.js` da solo, come un'altra app.

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

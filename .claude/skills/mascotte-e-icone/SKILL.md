---
name: mascotte-e-icone
description: Modificare la mascotte (la pressa kawaii), le icone dell'app, la favicon o l'animazione di caricamento con lo schedario. Da usare ogni volta che cambia un disegno.
---

# Mascotte e icone

Il disegno ha **una sola fonte**: `tools/mascot.mjs`. Da lì si generano:

| Uscita | Dove finisce |
|---|---|
| Mascotte in testata | `index.html`, tra `<!-- mascot:page -->` e `<!-- /mascot:page -->` |
| Scena di caricamento (schedario + mascotte + fogli) | `index.html`, tra `<!-- mascot:loader -->` e `<!-- /mascot:loader -->` |
| Icona vettoriale | `icons/icon.svg` |
| Icone Android, iPhone, favicon | `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`, `favicon.ico` |

## Procedura

1. Modifica `tools/mascot.mjs`.
2. Rigenera: `node tools/build-icons.mjs` (serve Playwright: `cd tools && npm install`). Con `--no-png` aggiorna solo `index.html` e l'SVG.
3. Guarda il risultato: apri l'app e le icone. Un disegno non si verifica leggendo il codice.
4. Esegui la skill `verifica`.

La scena di caricamento ha due versi: lettura di una cartella (i fogli escono dallo schedario) e sovrascrittura degli originali (classe `back` su `#loader`: gli stessi fogli tornano nello schedario).

## Vincoli da rispettare

- **Classi usate dalle animazioni:** `p-head` (testa che schiaccia), `p-sheets` (fogli che si appiattiscono), `p-spark` (scintilla), `e-open` / `e-c` / `e-d` (occhi aperti, strizzati a > <, ad arco) e `blush` (guance), comandati dalle classi `wink-c` e `wink-d` che lo script mette su `<body>` a intervalli casuali, `p-hand`, `fly`, `drawer` (caricamento). Se le rinomini, aggiorna il CSS in `index.html`.
- **Icone a tutto campo:** sfondo giallo unito `#ffd23f`, senza bordo e senza angoli trasparenti; ci pensa il telefono a ritagliarle.
- **Zona sicura Android:** tutto ciò che conta deve stare in un cerchio centrato largo l'80% dell'icona. La scala `0.98` in `build-icons.mjs` è il massimo per il disegno attuale: se allarghi la mascotte, riducila.
- **Stile:** kawaii (forme tonde, pastello, occhioni lucidi) con contorno scuro `#3b2a4a`, perché deve legare con l'interfaccia a fumetto.
- **Movimento ridotto:** ogni animazione nuova va spenta dentro `@media (prefers-reduced-motion: reduce)`.

## Da dire a chi usa l'app

Sul telefono l'icona di un'app già installata si aggiorna tardi (Android) o mai (iPhone): per vederla serve disinstallare e reinstallare.

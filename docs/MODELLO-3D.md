# Modello a falde per le pieghe (sperimentale, non adottato)

Ramo `modello-3d`. Idea: la carta si piega ma non si allunga, quindi un foglio piegato è fatto di falde piatte unite lungo pieghe dritte.

## Cosa c'è nel ramo
- `ufKinks`: per ogni linea trovata dalla distensione (R-SCN-27), i punti dove la pendenza cambia di colpo (finestre del 3% della pagina, sopra 0,04 e sopra 4 volte il rumore della linea).
- `ufCreases`: rette delle pieghe tra quei punti, con una ricerca casuale ripetibile (almeno 6 punti, lunghe almeno il 40% della pagina, inclinate al massimo 0,5).
- In `unfoldField` la mappa non mescola campioni di falde diverse (`cut` in `ufGrid`). Si accende con `CONFIG.scan.crease.on`.

## Esito (ottobre 2026, foto di prova del proprietario)
- La piega verticale della ricevuta medica viene trovata con precisione.
- Il risultato non migliora: le due falde, stimate separatamente, spostano le righe in modo diverso ai due lati e lo scalino a volte cresce.

## Per riprenderlo
- Lo spostamento deve restare continuo sulla piega (cerniera): cambia la pendenza, non la posizione. Al posto del taglio dei campioni, adattare ogni linea con una spezzata continua con i vertici sulle pieghe.
- Stimare l'inclinazione di ogni falda (l'accorciamento prospettico della parte piegata), non solo la curvatura delle linee.
- Misurare su linee stampate (tabelle) e non sulla scrittura a mano, che rende la misura rumorosa.

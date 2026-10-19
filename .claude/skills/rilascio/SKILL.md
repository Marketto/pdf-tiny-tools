---
name: rilascio
description: Pubblicare una nuova versione - numero di versione, tag e deploy su GitHub Pages. Da usare quando viene chiesto di rilasciare, taggare o pubblicare.
---

# Rilascio

La pubblicazione è automatica: non c'è nulla da caricare a mano.

| Cosa succede | Quando | Chi lo fa |
|---|---|---|
| Il sito va su GitHub Pages | a ogni push su `main` | `.github/workflows/pages.yml` |
| Nasce il tag `v<numero>` | quando cambia il file `VERSION` | `.github/workflows/tag.yml` |
| La cache offline cambia nome | a ogni pubblicazione | lo stesso `pages.yml`, non toccare a mano il nome in `sw.js` |
| Il numero accanto al titolo si aggiorna | a ogni pubblicazione | lo stesso `pages.yml`, che lo legge da `VERSION`; in locale si vede «dev» |

## Procedura

1. Esegui la skill `verifica` per intero. Se fallisce, fermati.
2. Scegli il numero con il **versionamento semantico**, sempre a tre cifre `MAGGIORE.MINORE.CORREZIONE`:
   - **CORREZIONE** (`2.0.0` → `2.0.1`): difetti sistemati, ritocchi a testi, suoni o aspetto che non aggiungono funzioni.
   - **MINORE** (`2.0.1` → `2.1.0`): funzioni nuove che non tolgono né cambiano quelle esistenti. La correzione torna a 0.
   - **MAGGIORE** (`2.1.0` → `3.0.0`): cambi che rompono abitudini, dati salvati o link degli utenti, oppure una funzione di primo piano (la 2.0.0 ha aggiunto i JPG). Minore e correzione tornano a 0.
   - Mai saltare numeri, mai riusare un numero già pubblicato, mai due cifre sole (`2.1` non è valido: si scrive `2.1.0`).
3. Scrivi il numero in `VERSION` (solo il numero, senza `v`) e fai un commit «Versione X.Y.Z» che contenga anche le modifiche non ancora inviate.
4. Push su `main`.
5. Controlla l'esito:
   ```bash
   gh api repos/Marketto/pdf-tiny-tools/actions/runs -q '.workflow_runs[0:2][]|[.name,.conclusion]|@tsv'
   git ls-remote --tags origin
   ```
6. Riferisci numero di versione, esito dei due flussi e indirizzo del sito: `https://marketto.github.io/pdf-tiny-tools/`.

## Da sapere

- **Non creare né spostare tag a mano**: un tag esistente non viene riscritto dal flusso. Se un numero è sbagliato, usa il successivo.
- Chi apre il sito con la rete attiva vede subito la versione nuova: la pagina si chiede sempre prima alla rete. Chi ha installato una versione fino alla 1.8.2 deve aprire l'app e ricaricarla una volta, perché quelle versioni servivano prima la cache.
- GitHub Pages può impiegare un minuto o due a servire i file nuovi dopo che il flusso risulta completato.
- Se il flusso di pubblicazione fallisce al passo «configure-pages», in Settings → Pages la sorgente non è «GitHub Actions»: può cambiarla solo il proprietario del repository.
- Se hai aggiunto un file che il sito deve servire, mettilo anche nell'elenco del passo «Prepara il sito» in `pages.yml` e, se serve offline subito, in `CORE` dentro `sw.js`. I file in `vendor/` e `i18n/` non vanno in `CORE`: sono moduli, scaricati quando servono e conservati tra le versioni; `pages.yml` ne calcola le impronte (`tools/moduli.mjs` → `moduli.json`), così dopo un aggiornamento si riscaricano solo quelli cambiati (R-APP-16).

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
2. Scegli il numero: correzioni → ultima cifra (`1.1.1`), funzioni nuove → cifra centrale (`1.2`), cambi che rompono abitudini o dati degli utenti → prima cifra.
3. Scrivi il numero in `VERSION` (solo il numero, senza `v`) e fai un commit «Versione X.Y» che contenga anche le modifiche non ancora inviate.
4. Push su `main`.
5. Controlla l'esito:
   ```bash
   gh api repos/Marketto/pdf-tiny-tools/actions/runs -q '.workflow_runs[0:2][]|[.name,.conclusion]|@tsv'
   git ls-remote --tags origin
   ```
6. Riferisci numero di versione, esito dei due flussi e indirizzo del sito: `https://marketto.github.io/pdf-tiny-tools/`.

## Da sapere

- **Non creare né spostare tag a mano**: un tag esistente non viene riscritto dal flusso. Se un numero è sbagliato, usa il successivo.
- Chi ha già aperto il sito vede la versione nuova alla **seconda** apertura, per via della cache offline.
- Se il flusso di pubblicazione fallisce al passo «configure-pages», in Settings → Pages la sorgente non è «GitHub Actions»: può cambiarla solo il proprietario del repository.
- Se hai aggiunto un file che il sito deve servire, mettilo anche nell'elenco del passo «Prepara il sito» in `pages.yml` e, se serve offline, in `CORE` dentro `sw.js`.

---
name: traduzioni
description: Aggiungere, correggere o rivedere i testi dell'interfaccia e le traduzioni in i18n.js, oppure aggiungere una lingua nuova. Da usare per qualsiasi testo visibile nell'app.
---

# Testi e traduzioni

Tutti i testi stanno in `i18n.js`, un oggetto per lingua con le stesse chiavi. L'italiano (`it`) è la lingua di riferimento, l'inglese (`en`) quella di riserva quando il browser parla una lingua non prevista.

## Aggiungere o cambiare un testo

1. Aggiungi la chiave a **tutte** le lingue, nella stessa posizione. Non lasciare lingue indietro.
2. Nel markup usa `data-i18n="chiave"` (testo), `data-i18n-html="chiave"` (se contiene tag) o `data-i18n-aria="chiave"` (etichetta per lettori di schermo). Nel codice usa `t("chiave", {n: …})`.
3. Esegui `node tools/check-i18n.mjs` finché non segnala zero problemi.

## PDF e JPG

L'app ha due modalità, PDF e JPG, ma un solo testo per ogni chiave. In modalità JPG la funzione `t()` sostituisce da sola «PDF» con «JPG» (e «pdf» con «jpg»). Quindi:

- scrivi sempre la sigla **«PDF» tale e quale**, staccata dalle altre parole, e costruisci la frase in modo che regga anche con «JPG» al suo posto;
- quando la frase non regge (parla di immagini *dentro* un documento, di password, di pagine), aggiungi una seconda chiave con lo stesso nome più una `J` finale (`sub` → `subJ`): in modalità JPG vince quella. Oggi esistono `subJ`, `descJ`, `whatBodyJ` e `s2J`;
- la chiave `h1` contiene `<span>PDF</span>`: quello span diventa il rullo del titolo, non toglierlo.

## Come tradurre

- **A senso, non parola per parola.** Il tono è giocoso e diretto: scrivi come lo direbbe una persona madrelingua in un'app simpatica. I tre livelli di forza e il titolo vanno reinventati in ogni lingua, non tradotti.
- **Segnaposto intoccabili:** `{n}`, `{i}`, `{ok}`, `{name}`, `{dir}`, `{size}`, `{pct}` restano identici e tutti presenti.
- **Numeri e plurali:** le frasi con un conteggio sono costruite per funzionare con qualsiasi numero («PDF pronti: {n}»). Mantieni questa forma: evita frasi che richiedono l'accordo singolare/plurale.
- **Nomi di menu reali:** per le istruzioni di installazione su iPhone usa le voci come compaiono davvero in iOS in quella lingua.
- **Marchi e sigle** (PDF, ZIP, JPEG, Dropbox, Chrome, Edge) non si traducono.
- `suffix`, `prefixDef` e `zipName` diventano parti di nomi di file: niente `/ \ : * ? " < > |`. Per hindi, bengalese, arabo e urdu restano in inglese.

## Aggiungere una lingua

1. Copia il blocco `en`, cambia la sigla (codice ISO a due lettere) e traduci.
2. Imposta `name` (nome della lingua nella lingua stessa) e `dir` (`ltr` o `rtl`).
3. Se l'alfabeto non è latino, controlla che i font in `--display` e `--body` (in `index.html`) lo coprano; altrimenti aggiungi un font a Google Fonts nella riga `<link>` e nelle due pile, e la lingua alle regole `:lang(...)` che ingrossano i titoli.
4. Aggiorna l'elenco delle lingue in `README.md`.
5. Esegui `node tools/check-i18n.mjs` e la skill `verifica`.

## Prima di chiudere

Dichiara sempre quali lingue non sono state riviste da un madrelingua: è un limite reale e chi pubblica deve saperlo.

# Requisiti

Qui sono raccolte le decisioni prese dal proprietario del progetto su come l'app deve comportarsi. È il riferimento quando codice e ricordi non coincidono: se un comportamento cambia, questa pagina si aggiorna nello stesso commit.

## Principi

- Tutto avviene nel browser: i file non lasciano il dispositivo.
- Sito statico, senza server e senza build, pubblicato su GitHub Pages.
- Interfaccia a fumetto con mascotte kawaii; testi giocosi, tradotti a senso e non alla lettera.
- Gli originali non vengono mai modificati senza una conferma esplicita.

## Modalità: PDF o JPG

- La stessa app alleggerisce i PDF oppure le foto JPG, con la stessa esperienza d'uso.
- Si passa dall'una all'altra toccando la parola «PDF» nel titolo, che ruota come un rullo a due facce (PDF e JPG). Il rullo deve far capire che è toccabile: ha due freccette e, la prima volta, accenna da solo un mezzo giro.
- Cambiando modalità cambiano il colore della mascotte (rosa per i PDF, verde menta per i JPG), il colore d'accento, i testi e le opzioni del passo 2. Se c'era un elenco di file, si svuota.
- La modalità scelta viene ricordata; un link che finisce con `#jpg` apre direttamente quella delle foto, e il pulsante di condivisione lo include.
- Il rullo è un vero pulsante: funziona da tastiera e i lettori di schermo dicono qual è la modalità attiva.

## Foto JPG

- Al posto dei tre livelli di forza si scelgono due soglie: **lato lungo massimo** (originale, 2560, 1920, 1280 px) e **peso massimo** (nessun limite, 1 MB, 500 KB, 200 KB). Valgono insieme.
- Data, luogo e altri dati dello scatto si conservano, salvo togliere la spunta.
- Si accettano solo file JPG; il file salvato resta un JPG con lo stesso nome ed estensione.
- Caricamento, elenco e salvataggio funzionano come per i PDF.

## Scansione con la fotocamera

- Un pulsante con l'emoji 📷, accanto a suoni e condivisione, apre la fotocamera del telefono (sul computer, la scelta di una foto).
- Dopo lo scatto si apre un editor a tutto schermo: quattro angoli trascinabili da portare sui bordi del foglio, con una lente d'ingrandimento sotto il dito; si può ruotare la foto, rifare lo scatto o annullare.
- Tre stili di pulizia: **Documento** (fondo bianco uniforme, ombre e dominanti di colore attenuate, contrasto tirato), **Bianco e nero** (per moduli e testi), **Foto** (solo livelli e colori ritoccati con delicatezza). L'ultimo stile scelto viene ricordato.
- Il foglio viene raddrizzato in prospettiva; se le proporzioni sono vicine a un A4, vengono riportate a A4.
- Il formato dipende dalla modalità del rullo: in **PDF**, dopo ogni pagina l'app chiede sempre se aggiungerne un'altra o finire, e alla fine le riunisce in un unico PDF; in **JPG** ogni scatto diventa un file JPG.
- La scansione compare nell'elenco con il numero di pagine e si salva con gli stessi pulsanti degli altri file; non si ricomprime e non ha originali da sovrascrivere.
- Durante l'elaborazione compare una schermata dedicata (un foglio storto che si raddrizza sotto una barra di luce) con una variante musicale propria, da macchina che lavora.
- Come tutto il resto, le foto non lasciano il dispositivo.

## Caricamento

- Si possono scegliere uno o più PDF, una cartella intera, oppure trascinarli nella pagina.
- Le cartelle vengono lette fino a 6 livelli di profondità; i file illeggibili si saltano senza interrompere.
- **Ogni nuova selezione sostituisce l'elenco precedente**, per evitare malintesi.
- Su schermi touch il riquadro «trascina qui» non compare: restano i pulsanti.
- Durante la lettura di una cartella compare una schermata a tutto schermo che blocca il resto dell'app, con la mascotte che prende i fogli da uno schedario e un pulsante «Annulla» in basso al centro. Annullando torna l'elenco di prima. Il conteggio in questa schermata dice «PDF trovati»: «pronti» si usa solo a lettura finita, quando i file sono davvero pronti da comprimere.

## Compressione

- Per i PDF, tre livelli di forza: leggero, medio, forte.
- Si ricomprimono solo le immagini; il testo resta selezionabile.
- Un file che non si alleggerisce viene segnalato e lasciato com'è.

## Elenco dei file

- Ogni scheda mostra nome, dimensioni prima e dopo, percentuale e stato.
- Su telefono e tablet in verticale questi elementi stanno uno sotto l'altro, in quest'ordine.
- **Le schede non hanno pulsanti di salvataggio**: si salva dai pulsanti sotto l'elenco.

## Salvataggio

Le opzioni dipendono da quanti file ci sono nell'elenco.

**Un solo file**

- «Salva con nome»: si sceglie dove e con che nome.
- «Sovrascrivi l'originale».

**Più file**

- «Salva in un'altra cartella»: stessa struttura di sottocartelle e stessi nomi dei file.
  - Se uno o più PDF non si sono alleggeriti, una finestra chiede se copiarli comunque nella destinazione o lasciarli fuori.
  - La cartella di origine non è ammessa come destinazione: per quello c'è «Sovrascrivi».
- «Salva accanto agli originali»: si apre una finestra con un selettore prefisso/suffisso e un campo per il testo; i file compressi finiscono nelle stesse cartelle degli originali con il nome modificato. La finestra mostra un esempio del nome risultante.
- «Sovrascrivi gli originali».

**Regole comuni**

- A salvataggio o sovrascrittura riusciti l'app torna come appena aperta, con l'elenco dei file vuoto; resta visibile solo il messaggio di conferma. Se la scrittura si interrompe o viene annullata, l'elenco resta com'è per poter riprovare.
- La sovrascrittura chiede sempre conferma.
- Se nella destinazione esistono già file con lo stesso nome, lo si dice e si chiede prima di sostituirli.
- Durante la scrittura di più file compare la schermata con la mascotte che rimette i fogli nello schedario; si può annullare tra un file e l'altro, e i file già scritti restano scritti.
- Dove il browser non permette di scrivere nelle cartelle (telefono, Firefox, Safari): un file si salva come download, più file come un unico ZIP con la stessa struttura di cartelle. Le opzioni non disponibili restano visibili ma spente, con una riga che spiega perché.

## Lingue

- Lingua scelta automaticamente da quella del browser, modificabile da un menu; la scelta viene ricordata.
- Le dodici lingue più parlate più l'italiano; inglese come riserva.
- Arabo e urdu si leggono da destra a sinistra.

## Aspetto

- Mascotte: pressa in stile kawaii con occhioni, che ogni tanto strizza gli occhi scegliendo a caso tra due espressioni («> <» e sorriso ad arco).
- Icone dell'app a tutto campo su fondo giallo unito, con la mascotte il più grande possibile.
- In testata, accanto al logo: installazione, suoni, condivisione e lingua, disposti in flex.
- Il numero di versione è visibile accanto al titolo.

## Suoni e musica

- **Un solo pulsante** accende e spegne insieme effetti e musica.
- Musica di sottofondo dinamica, originale, in stile 8 bit anni '80/'90: calma durante l'uso, concitata e ritmata durante la compressione, celebrativa al salvataggio.
- La versione calma è lenta e su toni bassi, per un effetto rilassato.
- Mentre scrive i file (salvataggio in una cartella o sovrascrittura) la musica diventa allegra, ritmata e vittoriosa (da festa, non da marcia), e si chiude con la fanfara a lavoro finito.
- Mentre elabora una scansione la musica diventa un arpeggio che sale e scende, come la luce di uno scanner.
- Mentre legge i file di una cartella la musica prende toni di mistero, poi torna calma. Il mistero deve restare allegro e curioso, non cupo.
- Il volume del sottofondo deve restare gradevole e mai invadente.
- Jingle all'avvio e suono di schiacciata durante la compressione.

## Installazione e condivisione

- L'app è installabile su Android e iPhone e propone l'installazione con un pulsante; su iPhone mostra i passaggi da fare.
- Un pulsante con l'icona tipica apre la condivisione di sistema; dove non c'è, copia il link.

## Rilascio

- Pubblicazione automatica su GitHub Pages a ogni push su `main`.
- Ogni pubblicazione che cambia l'app aggiorna il numero in `VERSION`, da cui nasce il tag.
- I numeri seguono il versionamento semantico, sempre a tre cifre: maggiore per i cambi che rompono abitudini o aggiungono una funzione di primo piano, minore per le funzioni nuove, correzione per difetti e ritocchi.
- Dopo una pubblicazione, chi apre o aggiorna l'app deve vedere subito la versione nuova, senza doverla ricaricare più volte; senza rete continua a funzionare l'ultima versione scaricata.

## Documentazione

- La documentazione va tenuta aggiornata ogni volta che arrivano requisiti, correzioni o migliorie: questa pagina per il comportamento, `ARCHITETTURA.md` per come è fatto, le skill in `.claude/` per le procedure.

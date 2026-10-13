# Requisiti

Comportamento deciso dal proprietario. Ogni voce ha un codice stabile (`R-AREA-nn`): citalo nei commit e cercalo con `grep -n "R-SCN" docs/*.md`. Un codice non si riusa mai; se un requisito cade, la voce resta con «(ritirato)».

Aree: [PRI](#pri-principi) · [MOD](#mod-modalità-pdf--jpg) · [CAR](#car-caricamento) · [CMP](#cmp-compressione) · [JPG](#jpg-foto) · [SCN](#scn-scansione) · [LST](#lst-elenco) · [SAV](#sav-salvataggio) · [UI](#ui-aspetto) · [AUD](#aud-suoni-e-musica) · [I18N](#i18n-lingue) · [APP](#app-installazione-e-condivisione) · [REL](#rel-rilascio) · [DOC](#doc-documentazione)

## PRI · Principi
- R-PRI-01 Tutto avviene nel browser; i file e le foto non lasciano il dispositivo, niente telemetria.
- R-PRI-02 Sito statico su GitHub Pages: niente server, niente build.
- R-PRI-03 Gli originali si modificano solo dopo conferma esplicita.
- R-PRI-04 Stile a fumetto con mascotte kawaii; testi giocosi.

## MOD · Modalità PDF / JPG
- R-MOD-01 Stessa app e stessa esperienza per PDF e foto JPG.
- R-MOD-02 Si cambia toccando la parola «PDF» del titolo: un rullo a due facce (PDF, JPG) con due freccette; la prima volta accenna da solo mezzo giro.
- R-MOD-03 Cambiando modalità cambiano colore della mascotte (rosa PDF, menta JPG), colori dell'interfaccia (R-UI-05), testi e opzioni del passo 2; l'elenco si svuota.
- R-MOD-04 Modalità ricordata; `#jpg` nel link apre le foto e la condivisione lo include.
- R-MOD-05 Il rullo è un pulsante vero: tastiera e lettori di schermo.

## CAR · Caricamento
- R-CAR-01 Uno o più file, una cartella intera o trascinamento.
- R-CAR-02 Cartelle lette fino a 6 livelli; file illeggibili saltati senza interrompere.
- R-CAR-03 Ogni nuova selezione sostituisce l'elenco precedente.
- R-CAR-04 Su schermi touch niente riquadro «trascina qui».
- R-CAR-05 Lettura di una cartella: schermata a tutto schermo che blocca l'app, mascotte che prende fogli da uno schedario, «Annulla» in basso al centro (torna l'elenco di prima).
- R-CAR-06 In quella schermata il conteggio dice «PDF trovati»; «pronti» solo a lettura finita.

## CMP · Compressione
- R-CMP-01 PDF: tre livelli di forza (leggero, medio, forte).
- R-CMP-02 Si ricomprimono solo le immagini; il testo resta selezionabile.
- R-CMP-03 Un file che non si alleggerisce viene segnalato e lasciato com'è.

## JPG · Foto
- R-JPG-01 Due soglie insieme al posto della forza: lato lungo massimo (originale, 2560, 1920, 1280 px) e peso massimo (nessuno, 1 MB, 500 KB, 200 KB).
- R-JPG-02 Data, luogo e dati dello scatto conservati, salvo togliere la spunta.
- R-JPG-03 Solo file JPG; il salvato resta JPG con stesso nome ed estensione.

## SCN · Scansione
- R-SCN-01 Pulsante fotocamera in testata accanto a suoni e condivisione; apre la fotocamera del telefono (sul computer, scelta di una foto).
- R-SCN-02 Dopo lo scatto, editor a tutto schermo: angoli trascinabili, lente sotto il dito, ruota, rifai, annulla.
- R-SCN-03 Stili: Documento (fondo bianco uniforme, ombre e dominanti attenuate, contrasto), Bianco e nero, Foto (solo livelli). Ultimo stile ricordato.
- R-SCN-04 Raddrizzamento prospettico; proporzioni vicine ad A4 riportate ad A4.
- R-SCN-05 Modalità PDF: dopo ogni pagina chiede sempre «un'altra pagina o finisci?», poi un unico PDF. Modalità JPG: ogni scatto è un JPG.
- R-SCN-06 La scansione va in elenco con il numero di pagine e si salva con i pulsanti normali; non si ricomprime e non ha originali da sovrascrivere.
- R-SCN-07 Elaborazione con schermata dedicata (foglio che si raddrizza sotto una barra di luce) e variante musicale propria.
- R-SCN-08 L'icona della fotocamera ha lo stesso stile delle altre icone di testata (disegno a tratto, non emoji).
- R-SCN-09 Appena aperto l'editor, gli angoli sono già posizionati dove l'app trova il foglio; se non lo trova, partono da un rettangolo appena rientrato. L'utente può sempre correggerli.
- R-SCN-10 Fogli curvi: oltre agli angoli c'è una maniglia a metà di ogni lato; un reticolato disegnato sul foglio mostra come verrà raddrizzato. Anche le maniglie dei lati vengono proposte seguendo il bordo trovato. Spostando un angolo, le maniglie dei lati lo seguono.
- R-SCN-11 Le pieghe interne al foglio non vengono riconosciute in automatico: il reticolato corregge solo curvature che si vedono dai bordi.
- R-SCN-12 Dopo l'elaborazione compare subito un'anteprima della pagina: in modalità PDF dentro la domanda «un'altra pagina?», che offre anche «Rifai questa pagina»; in modalità JPG con «Tienila» e «Rifai».
- R-SCN-13 Le scansioni in elenco hanno un pulsante «Anteprima» che mostra tutte le pagine.

## LST · Elenco
- R-LST-01 Ogni scheda: nome, dimensioni prima e dopo, percentuale, stato.
- R-LST-02 Telefono e tablet in verticale: questi elementi uno sotto l'altro, in quest'ordine.
- R-LST-03 Niente pulsanti di salvataggio nelle schede (l'anteprima delle scansioni sì, R-SCN-13).

## SAV · Salvataggio
- R-SAV-01 Un file: «Salva con nome» o «Sovrascrivi l'originale».
- R-SAV-02 Più file: «Salva in un'altra cartella» (stessa struttura e nomi), «Salva accanto agli originali», «Sovrascrivi gli originali».
- R-SAV-03 Altra cartella: se ci sono file non alleggeriti, una finestra chiede se copiarli comunque; la cartella di origine non è ammessa.
- R-SAV-04 Accanto agli originali: finestra con selettore prefisso/suffisso, campo di testo ed esempio del nome.
- R-SAV-05 Sovrascrittura sempre confermata; file già presenti nella destinazione segnalati prima di sostituirli.
- R-SAV-06 Scrittura di più file: schermata con la mascotte che rimette i fogli nello schedario; annullabile tra un file e l'altro.
- R-SAV-07 Salvataggio riuscito: l'app torna come appena aperta (elenco vuoto) con il solo messaggio di conferma; se interrotto, l'elenco resta.
- R-SAV-08 Senza scrittura nelle cartelle (telefono, Firefox, Safari): un file come download, più file come ZIP con la stessa struttura; le opzioni non disponibili restano visibili ma spente, con una riga di spiegazione.

## UI · Aspetto
- R-UI-01 Mascotte: pressa kawaii con occhioni; ogni tanto strizza gli occhi a caso tra «> <» e sorriso ad arco.
- R-UI-02 Icone dell'app a tutto campo su giallo unito, mascotte più grande possibile.
- R-UI-03 Testata: accanto al logo, in flex, lingua, installazione e le tre icone suoni, fotocamera, condivisione. Le tre icone stanno sempre su una sola riga, anche su telefoni stretti o con caratteri ingranditi.
- R-UI-04 Numero di versione visibile accanto al titolo.
- R-UI-05 Colori «tono su tono» con la pelle della mascotte, che cambiano con la modalità; lo sfondo azzurro a puntini resta uguale. Pulsanti, etichette dei passi, badge e riquadri di conferma nel colore della pelle (rosa in PDF, menta in JPG); «Schiaccia!», livello scelto, barra di avanzamento e contorni di messa a fuoco nella stessa tinta più intensa; badge dei risultati in versione più chiara. Nel titolo la faccia PDF del rullo è rosa e quella JPG menta. Il rosso resta solo per errori e sovrascrittura. L'icona dell'app resta gialla (R-UI-02).

## AUD · Suoni e musica
- R-AUD-01 Un solo pulsante accende e spegne effetti e musica.
- R-AUD-02 Musica 8 bit originale e dinamica: calma (lenta, toni bassi) durante l'uso, concitata durante la compressione, fanfara al salvataggio riuscito.
- R-AUD-03 Lettura cartella: mistero allegro e curioso, non cupo, un po' svelto.
- R-AUD-04 Scrittura dei file: allegra, ritmata, vittoriosa (da festa), poi fanfara.
- R-AUD-05 Elaborazione scansione: arpeggio che sale e scende come la luce di uno scanner.
- R-AUD-06 Volume del sottofondo gradevole, mai invadente. Jingle all'avvio, suono di schiacciata.

## I18N · Lingue
- R-I18N-01 Lingua dal browser, modificabile da menu, ricordata.
- R-I18N-02 Le dodici lingue più parlate più l'italiano; inglese di riserva; traduzioni a senso.
- R-I18N-03 Arabo e urdu da destra a sinistra.

## APP · Installazione e condivisione
- R-APP-01 Installabile su Android e iPhone, con pulsante «Installa»; su iPhone mostra i passaggi.
- R-APP-02 Pulsante di condivisione di sistema; dove manca, copia il link.
- R-APP-03 Dopo una pubblicazione la versione nuova si vede al primo aggiornamento; senza rete funziona l'ultima scaricata.

## REL · Rilascio
- R-REL-01 Pubblicazione automatica su GitHub Pages a ogni push su `main`.
- R-REL-02 Versionamento semantico a tre cifre; il tag nasce da `VERSION`.

## DOC · Documentazione
- R-DOC-01 La documentazione si aggiorna **prima** dell'implementazione: prima i requisiti, poi il codice, poi `ARCHITETTURA.md` allineata a ciò che è stato fatto.
- R-DOC-02 Documentazione pensata per essere letta da agenti: voci brevi, codici stabili, una sola fonte per ogni informazione, rimandi invece di ripetizioni.

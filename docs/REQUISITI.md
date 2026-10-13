# Requisiti

Comportamento deciso dal proprietario. Ogni voce ha un codice stabile (`R-AREA-nn`): citalo nei commit e cercalo con `grep -n "R-SCN" docs/*.md`. Un codice non si riusa mai; se un requisito cade, la voce resta con «(ritirato)».

Aree: [PRI](#pri-principi) · [MOD](#mod-modalità-pdf--jpg--video--tutto) · [CAR](#car-caricamento) · [CMP](#cmp-compressione) · [JPG](#jpg-foto) · [VID](#vid-video) · [TUT](#tut-schiaccia-tutto) · [SCN](#scn-scansione) · [LST](#lst-elenco) · [SAV](#sav-salvataggio) · [UI](#ui-aspetto) · [AUD](#aud-suoni-e-musica) · [I18N](#i18n-lingue) · [APP](#app-installazione-e-condivisione) · [REL](#rel-rilascio) · [DOC](#doc-documentazione)

## PRI · Principi
- R-PRI-01 Tutto avviene nel browser; i file e le foto non lasciano il dispositivo, niente telemetria.
- R-PRI-02 Sito statico su GitHub Pages: niente server, niente build.
- R-PRI-03 Gli originali si modificano solo dopo conferma esplicita.
- R-PRI-04 Stile a fumetto con mascotte kawaii; testi giocosi.

## MOD · Modalità PDF / JPG / VIDEO / TUTTO
- R-MOD-01 Stessa app e stessa esperienza per PDF, foto JPG e video.
- R-MOD-02 Si cambia toccando la parola «PDF» del titolo: un rullo con due freccette che gira in ordine PDF → JPG → VIDEO → TUTTO → PDF (R-TUT-01); la prima volta accenna da solo mezzo giro.
- R-MOD-03 Cambiando modalità cambiano colore della mascotte (rosa PDF, menta JPG, lavanda VIDEO, R-VID-12), colori dell'interfaccia (R-UI-05), testi e opzioni del passo 2; l'elenco si svuota.
- R-MOD-04 Modalità ricordata; `#jpg`, `#video` o `#all` nel link aprono quella modalità e la condivisione lo include.
- R-MOD-05 Il rullo è un pulsante vero: tastiera e lettori di schermo.
- R-MOD-06 Se ci sono lavorazioni in corso o risultati non salvati (compressione o analisi in corso, file pronti da salvare, pagine scansionate non salvate), cambiare modalità chiede sempre conferma, avvisando che il lavoro non salvato si perde. Confermando, il lavoro in corso si interrompe e l'elenco si svuota.

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

## VID · Video
- R-VID-01 Video MP4, MOV e M4V (anche WebM e MKV in lettura). Ricodifica nel browser con il codificatore del dispositivo; nessun file lascia il dispositivo.
- R-VID-02 Formato video di uscita compatibile con i telefoni: HEVC (H.265) se il dispositivo sa codificarlo, altrimenti H.264. Se nessuno dei due è disponibile la modalità resta visibile ma spenta, con una riga di spiegazione.
- R-VID-03 Risoluzione, orientamento e istanti dei fotogrammi (quindi il frame rate, anche variabile) restano quelli dell'originale.
- R-VID-04 Analisi in fase di lettura (il «primo passaggio»): da ogni video si codificano alcuni spezzoni brevi a compressioni diverse e si misura la qualità rispetto all'originale; ne escono, per ogni livello, la compressione da usare, la qualità e il peso stimati, mostrati nella scheda. Alla pressione di «Schiaccia!» si codifica tutto il video con la compressione trovata (secondo passaggio).
- R-VID-05 Qualità misurata come somiglianza strutturale (SSIM) sulla luminosità, fotogramma per fotogramma: 95% = SSIM 0,95. Mai sotto il 95%.
- R-VID-06 Tre livelli al passo 2, con gli stessi nomi giocosi del PDF (Carezza, Stretta, Martellata) e la soglia tecnica come sottotitolo: Qualità ≥ 98,5%, ≥ 97%, ≥ 95%. Cambiando livello le stime si aggiornano; se la curva misurata non basta per la nuova soglia, la scheda torna brevemente in analisi solo per i punti mancanti (R-APP-09).
- R-VID-07 Se al livello scelto il risparmio stimato o reale è sotto il 10%, il video viene segnato «già leggero» e lasciato com'è.
- R-VID-08 Audio copiato così com'è; si ricomprime (AAC) solo se il guadagno è notevole: audio non compresso o oltre 256 kbps, e almeno il 5% del file in meno. Se il dispositivo non sa codificare AAC, si copia.
- R-VID-09 Video HDR (tipici dell'iPhone): lasciati com'è con la nota «HDR, lasciato com'è», perché il browser li renderebbe spenti.
- R-VID-10 Estensione: `.mp4`, `.m4v` e `.mov` restano uguali (compatibili con HEVC e H.264); WebM e MKV diventano `.mp4`. Nome invariato salvo l'estensione.
- R-VID-11 In modalità video il pulsante della fotocamera è nascosto.
- R-VID-12 Terzo colore per mascotte e interfaccia in modalità video: lavanda (pelle della mascotte lilla chiaro, accento viola), scelto dal proprietario tra tre proposte (R-UI-05).
- R-VID-13 Durante la codifica lo schermo resta acceso dove il browser lo permette; ogni scheda mostra l'avanzamento.
- R-VID-14 Video grandi: se il peso stimato del risultato supera una soglia sicura (1/8 della memoria del dispositivo quando il browser la dichiara, al massimo 1 GB; altrimenti 300 MB), il risultato si scrive a pezzi in una cartella privata del browser sul dispositivo invece che in memoria. Il flusso resta uguale: si vede il risultato, poi si sceglie come salvare. Sotto la soglia tutto resta in memoria come prima.
- R-VID-15 Prima di scrivere un video grande si controlla che ci sia spazio libero (stima + 10%). Se manca, o il browser non permette di scrivere nella cartella privata (per esempio Safari prima della versione 26), il video viene saltato con la nota «troppo grande per questo dispositivo». La scelta della destinazione prima della codifica non serve: dove esiste (Chrome ed Edge da computer) c'è anche la cartella privata.
- R-VID-16 Pulizia della cartella privata: si svuota all'apertura dell'app (garanzia principale: l'app non riprende lavori a metà), dopo un salvataggio riuscito, a ogni nuova selezione o cambio di modalità, quando un risultato viene scartato, e si prova anche alla chiusura. Se si chiude senza salvare, il risultato si perde e lo spazio si libera alla prossima apertura.
- R-VID-17 Le schede dei video grandi lo dicono: «se chiudi senza salvare, il risultato si perde».
- R-VID-18 Dove non si può scrivere nelle cartelle e i video pronti superano insieme la soglia sicura, «Scarica tutto» non fa uno ZIP (andrebbe tutto in memoria) ma scarica i video uno alla volta.
- R-VID-19 Memoria delle analisi: ogni video analizzato si registra sul dispositivo (archivio del browser; solo i numeri dell'analisi, mai il video), riconosciuto da percorso, nome, dimensione, data di modifica e un'impronta dei primi e ultimi 64 KB. Riaprendo la stessa cartella i video già analizzati mostrano subito la stima e l'analisi riprende dal primo mancante, anche dopo una chiusura a metà. Le analisi si scartano se cambia il metodo di analisi o il formato di uscita del dispositivo. Un comando «Dimentica le analisi salvate» le cancella.
- R-VID-20 «Schiaccia!» si può premere appena c'è un video analizzato: la compressione procede sui video pronti mentre l'analisi continua sugli altri, e aspetta i nuovi finché l'analisi non è finita.
- R-VID-21 Scarto rapido: un video già molto compresso (pochi dati per pixel e fotogramma: sotto 0,05 bit con HEVC, VP9 o AV1, sotto 0,035 con H.264) viene segnato «già leggero» senza codifiche di prova.
- R-VID-22 Salva man mano (video e TUTTO): casella «Salva ogni video appena è pronto», ricordata. Accesa, ogni video finito si salva subito: accanto all'originale con il prefisso o suffisso scelto l'ultima volta (se la cartella è scrivibile), altrimenti come download. La scheda diventa «Salvato» e la memoria lo libera. La memoria delle analisi (R-VID-19) ricorda anche che quel video è già stato schiacciato e salvato: riaprendo la stessa cartella dopo un'interruzione viene saltato («già schiacciato e salvato»), così un lavoro lungo riprende da dove si era fermato. Se il salvataggio non riesce, il video resta pronto da salvare con i pulsanti.

## TUT · Schiaccia tutto
- R-TUT-01 Quarta modalità, «TUTTO» sul rullo del titolo: prende insieme PDF, foto JPG e video, da file scelti, trascinati o da una cartella con le sottocartelle.
- R-TUT-02 Aspetto «Olografico» (scelto dal proprietario tra tre varianti unicorno): pelle della mascotte, pulsanti, etichette dei passi, livello scelto e cerchio della Caramella in sfumature rosa, azzurro ghiaccio, lilla e oro. Il colore si muove come un gas, alternando due moti: «Marea» (le sfumature scorrono lente) e «Nebbia» (nuvole di colore che si mescolano), con giri lenti di 8–30 s. Con «riduci movimento» il colore resta fermo. La mascotte ha un corno dorato e tre stelline; la parola «TUTTO» del titolo cambia colore piano.
- R-TUT-03 Passo 2: un livello unico (Carezza, Stretta, Martellata) che vale per tutti i tipi: PDF con lo stesso livello; foto 2560 px senza limite di peso, 1920 px e 500 KB, 1280 px e 200 KB; video con qualità ≥ 98,5%, ≥ 97%, ≥ 95%. Sotto, «Regola per tipo» (chiusa all'inizio) contiene le opzioni delle tre modalità per cambiare un tipo solo; toccare di nuovo il livello unico riallinea tutti i tipi.
- R-TUT-04 Ogni riga dell'elenco ha l'etichetta del tipo (PDF, JPG, VIDEO) nel colore della sua modalità. Prima si schiacciano i PDF (uno alla volta) e le foto (più insieme), poi i video; l'analisi dei video parte subito al caricamento, come in modalità video, e procede intanto.
- R-TUT-05 Per i video valgono le regole della modalità video: memoria delle analisi e ripresa (R-VID-19), soglia sicura e conferma per i video grandi (R-VID-14…16), estensione (R-VID-10). Se il browser non sa codificare video, i video restano com'erano con una nota e il resto si schiaccia lo stesso.
- R-TUT-06 Salvataggio con gli stessi pulsanti delle altre modalità, mantenendo le sottocartelle.
- R-TUT-07 I file di altri tipi (HEIC, PNG, documenti…) si saltano e alla fine del caricamento si dice quanti sono stati ignorati.
- R-TUT-08 Cattura non è disponibile in TUTTO: fotocamera nascosta e verbo fermo, come in VIDEO.

## SCN · Scansione
- R-SCN-01 Pulsante fotocamera in testata accanto a suoni e condivisione: porta a Cattura (R-SCN-14). In modalità video è nascosto (R-VID-11).
- R-SCN-02 Dopo lo scatto, e con «Bordi» su una pagina, editor a tutto schermo: angoli trascinabili, lente sotto il dito, ruota, rifai, annulla. Lo stile non si sceglie qui ma nella schermata Cattura (R-SCN-17).
- R-SCN-03 Stili: Documento (fondo bianco uniforme, ombre e dominanti attenuate, contrasto), Bianco e nero, Colore (solo livelli). Ultimo stile generale ricordato.
- R-SCN-04 Raddrizzamento prospettico; proporzioni vicine ad A4 riportate ad A4.
- R-SCN-05 Modalità PDF: le pagine si raccolgono nella schermata Cattura e si salvano in un unico PDF. Modalità JPG: ogni pagina è un JPG. (Prima: domanda «un'altra pagina o finisci?» dopo ogni scatto, sostituita da R-SCN-16.)
- R-SCN-06 (ritirato) Le scansioni non vanno più nell'elenco della compressione: si salvano dalla schermata Cattura.
- R-SCN-07 Elaborazione con schermata dedicata (foglio che si raddrizza sotto una barra di luce) e variante musicale propria.
- R-SCN-08 L'icona della fotocamera ha lo stesso stile delle altre icone di testata (disegno a tratto, non emoji).
- R-SCN-09 Appena aperto l'editor, gli angoli sono già posizionati dove l'app trova il foglio; se non lo trova, partono da un rettangolo appena rientrato. L'utente può sempre correggerli.
- R-SCN-10 Fogli curvi: oltre agli angoli c'è una maniglia a metà di ogni lato; un reticolato disegnato sul foglio mostra come verrà raddrizzato. Anche le maniglie dei lati vengono proposte seguendo il bordo trovato. Spostando un angolo, le maniglie dei lati lo seguono.
- R-SCN-11 Le pieghe interne al foglio non vengono riconosciute in automatico: il reticolato corregge solo curvature che si vedono dai bordi.
- R-SCN-12 Dopo l'elaborazione la pagina compare subito tra le miniature della schermata Cattura, selezionata.
- R-SCN-13 (ritirato) L'anteprima sta nelle miniature della schermata Cattura.
- R-SCN-14 Due azioni, Schiaccia e Cattura: anche il verbo del titolo è un rullo («Schiaccia ⇄ Cattura»). Il pulsante della fotocamera porta a Cattura; in Cattura la sua icona diventa quella della compressione e riporta a Schiaccia.
- R-SCN-15 Cattura esiste solo per PDF e JPG: in modalità video il rullo del verbo è spento (e la fotocamera nascosta, R-VID-11); in Cattura il rullo della modalità alterna solo PDF e JPG.
- R-SCN-16 Cattura ha una schermata propria, non quella della compressione: si scatta (fotocamera, o galleria con più foto insieme e bordi proposti), si sistemano le pagine (ruota, bordi, rifai lo scatto, stile, sposta, elimina, aggiungi) e si salva (PDF: un file con tutte le pagine; JPG: una foto per pagina, in una cartella o in uno ZIP dove le cartelle non si scrivono). Dopo un salvataggio riuscito la schermata si svuota.
- R-SCN-19 Aspetto scelto dal proprietario tra tre proposte. Telefono e finestre strette (proposta A): tre passi 1 · Scatta (pulsante grande e «Dalla galleria»), 2 · Sistema (stile per tutte, striscia di miniature con «+», strumenti della pagina selezionata: ruota, bordi, rifai, ‹ ›, elimina, stile di questa pagina), 3 · Salva. Computer, da 760 px di larghezza (proposta B): griglia di schede, ognuna con i suoi pulsanti e lo stile, spostabili trascinandole, e barra fissa in basso con Scatta, Galleria e Salva.
- R-SCN-17 Stile (Documento, Bianco e nero, Colore; «Foto» diventa «Colore») scelto una volta per tutte le pagine; ogni pagina può poi averne uno suo.
- R-SCN-18 Passare da Cattura a Schiaccia (e viceversa) con pagine o file non salvati chiede conferma, come il cambio di modalità (R-MOD-06).
- R-SCN-20 Orientamento automatico: ogni pagina viene girata da sola (0°, 90°, 180°, 270°) perché il testo si legga dritto nella direzione della sua lingua. Lo decide Tesseract (riconoscimento di orientamento e alfabeto, sul dispositivo); si gira solo se è sicuro, altrimenti resta com'è. «Ruota» si aggiunge sopra.
- R-SCN-21 Raddrizzamento fine del testo: dopo l'orientamento, le righe di testo vengono raddrizzate (fino a ±10°); gli angoli che restano scoperti si riempiono di bianco. Senza testo riconoscibile non si tocca nulla.
- R-SCN-22 Tesseract (circa 9 MB) si scarica solo la prima volta che serve, con un messaggio che lo dice, e poi resta disponibile anche senza rete. Se non si può scaricare, le pagine si fanno lo stesso, senza orientamento automatico.
- R-SCN-23 Calamita dei bordi: nell'editor, quando si lascia un angolo vicino al bordo vero del foglio, l'angolo si aggancia al punto in cui si incontrano i due bordi; le maniglie dei lati lo seguono.
- R-SCN-24 Controllo dopo il raddrizzamento: se nella pagina raddrizzata un bordo del foglio resta visibile storto o curvo (si vede lo sfondo), angoli e maniglie dei lati vengono corretti da soli e la pagina si rifà una volta.
- R-SCN-25 PDF ricercabile: il PDF salvato da Cattura ha, sopra ogni pagina, il testo riconosciuto (invisibile, ma selezionabile e ricercabile). Lingua dal sistema di scrittura riconosciuto (R-SCN-20) e dalla lingua dell'app: per l'alfabeto latino la lingua dell'app se è latina, altrimenti inglese; cirillico → russo; arabo → urdu se l'app è in urdu, altrimenti arabo; devanagari → hindi; bengalese → bengalese; cinese → cinese semplificato. Altri sistemi: niente testo. Si può spegnere con una casella accanto a «Salva il PDF», accesa all'inizio e ricordata. Se il riconoscimento non riesce, il PDF si salva lo stesso, senza testo.

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
- R-UI-04 Numero di versione visibile accanto al titolo, sulla stessa riga del titolo e della parola della modalità, anche al telefono: se non ci sta, il titolo si rimpicciolisce.
- R-UI-06 Il titolo ha la stessa grandezza in tutte le modalità: è dimensionato sulla parola più lunga del rullo, quindi cambiando modalità non cambia.
- R-UI-07 In Cattura la mascotte mette occhialoni tondi e tiene una macchina fotografica davanti ai fogli; la scintilla diventa un flash giallo, che lampeggia a ogni foto aggiunta. Occhiali e fotocamera entrano ed escono con una piccola animazione (spenta con «riduci movimento»). Scelta del proprietario tra sei proposte (combinazione E); l'icona dell'app non cambia.
- R-UI-08 Nelle schermate di lettura e di scrittura dei file volano oggetti adatti alla modalità: fogli in PDF, Polaroid con un paesaggio in JPG, ciak in video. Scelta del proprietario tra due proposte per modalità.
- R-UI-09 Anche l'oggetto sotto la pressa segue la modalità: foglio in PDF, Polaroid in JPG, ciak in video (nella testata e nelle scene di caricamento; l'icona dell'app resta con il foglio).
- R-UI-05 Colori «tono su tono» con la pelle della mascotte, che cambiano con la modalità (anche VIDEO, R-VID-12); lo sfondo azzurro a puntini resta uguale. Pulsanti, etichette dei passi, badge e riquadri di conferma nel colore della pelle (rosa in PDF, menta in JPG); «Schiaccia!», livello scelto, barra di avanzamento e contorni di messa a fuoco nella stessa tinta più intensa; badge dei risultati in versione più chiara. Nel titolo la faccia PDF del rullo è rosa e quella JPG menta. Il rosso resta solo per errori e sovrascrittura. L'icona dell'app resta gialla (R-UI-02).
- R-UI-10 Indicatore di avanzamento nell'app («Caramella», scelta del proprietario tra tre proposte): durante compressione, analisi e codifica, sopra l'elenco del passo 3 una pillola con un cerchio a righe che si riempie, la percentuale complessiva, «7 di 12» e il tempo residuo (stesso calcolo di R-APP-07). Quando scorrendo la sezione esce dallo schermo, la pillola si stacca e resta in cima; tornando alla sezione si riaggancia al suo posto. Toccandola si torna al file in corso, che lampeggia un attimo. A lavoro finito sparisce.

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
- R-APP-03 Dopo una pubblicazione la versione nuova si vede al primo aggiornamento; senza rete funziona l'ultima scaricata. All'avvio la pagina non si ricarica da sola: lo fa solo se la versione nuova arriva quando l'app è aperta da un po', senza lavoro in corso, e mai più di una volta ogni 2 minuti.
- R-APP-04 Caricamento pigro: le parti pesanti si scaricano solo quando servono e poi restano nella cache offline. Mediabunny alla prima volta in modalità video; Tesseract e il modello di orientamento alla prima pagina di Cattura; i dati di una lingua (0,7–3 MB) al primo PDF ricercabile in quella lingua; JSZip al primo ZIP.
- R-APP-05 Lavoro in secondo piano: durante i lavori lunghi (lettura di cartelle, analisi dei video, compressione, scrittura dei file, riconoscimento del testo) l'app tiene acceso l'audio anche fuori dall'app: la musica se i suoni sono accesi, altrimenti un ronzio impercettibile. Così Chrome su Android non la congela. Va provato sui telefoni veri: non è garantito.
- R-APP-06 La prima volta che parte un lavoro lungo l'app chiede se continuare in secondo piano e avvisare a lavoro finito («Sì» chiede anche il permesso per le notifiche); la risposta è ricordata. Su iPhone, dove il lavoro si ferma comunque fuori dall'app, compare solo l'avviso «resta nell'app finché non ho finito». In fondo al passo 3 una riga dice cosa succede fuori dall'app (continuo e avviso, continuo ma le notifiche sono bloccate, mi fermo) con «Cambia», che ripropone la domanda.
- R-APP-07 Mentre lavora in secondo piano, nella tendina delle notifiche compare il riquadro del lettore con l'avanzamento complessivo e il tempo residuo («Schiaccio 7 di 12 · 58% · ancora 4 min») e un pulsante per fermare. Con il permesso per le notifiche, mentre l'app è nascosta c'è anche una notifica silenziosa con lo stesso testo, mostrata una volta sola quando l'app passa in secondo piano e non aggiornata (su Android ogni aggiornamento faceva vibrare il telefono a ogni file; l'avanzamento aggiornato resta nel riquadro del lettore): mette l'icona dell'app (la sagoma della mascotte, in bianco come vuole Android) nella barra di stato accanto all'orologio. Sparisce tornando nell'app o a lavoro finito, quando la sostituisce la notifica dell'esito (R-APP-08). Il ronzio dura 12 secondi in loop, perché Chrome mostra il riquadro del lettore solo per audio di almeno 5 secondi. La percentuale pesa i file per dimensione; il tempo residuo nasce dalla velocità reale, compare dopo qualche secondo e si ammorbidisce per non saltare.
- R-APP-08 A lavoro finito, se l'app è in secondo piano e il permesso c'è, arriva una notifica con l'esito; toccandola si torna all'app. Il telefono vibra solo qui, a lavoro finito, mai durante il lavoro.
- R-APP-09 Prestazioni: a parità di risultato, l'app usa al meglio il telefono. Video: l'analisi cerca per bisezione solo la soglia del livello scelto e codifica gli spezzoni di prova in parallelo; cambiando livello completa la curva solo se serve. PDF e JPG: le immagini si ricomprimono in parallelo in più worker (quanti ne reggono processori e memoria), con ritorno al lavoro in pagina dove i worker non possono disegnare. Scansione: raddrizzamento e pulizia sulla scheda grafica (WebGL), con ritorno al calcolo attuale se WebGL manca o fallisce. I tempi si misurano con `tools/bench.mjs` prima e dopo ogni cambiamento.

## REL · Rilascio
- R-REL-01 Pubblicazione automatica su GitHub Pages a ogni push su `main`.
- R-REL-02 Versionamento semantico a tre cifre; il tag nasce da `VERSION`.

## DOC · Documentazione
- R-DOC-01 La documentazione si aggiorna **prima** dell'implementazione: prima i requisiti, poi il codice, poi `ARCHITETTURA.md` allineata a ciò che è stato fatto.
- R-DOC-02 Documentazione pensata per essere letta da agenti: voci brevi, codici stabili, una sola fonte per ogni informazione, rimandi invece di ripetizioni.

## Idee non ancora decise
Non sono requisiti: diventano voci con codice solo quando il proprietario le approva.
- Cattura, proposta C «pagina grande» (piaciuta, tenuta da parte): una pagina alla volta in grande con frecce e contatore «2 / 3», strumenti sotto, miniature piccole e barra fissa Scatta / Salva.
- Scansione: mirino dal vivo con scatto automatico quando il foglio è fermo e ben inquadrato.
- Icona dell'app in rosa invece che gialla (oggi resta gialla, R-UI-02).

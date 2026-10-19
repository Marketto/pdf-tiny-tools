/* Soglie e parametri dell'app, tutti qui (R-DOC-03). Ogni valore dice a quale requisito si riferisce (docs/REQUISITI.md).
   Cambiando un numero cambia il comportamento: dopo, esegui la skill `verifica`. Le frazioni sono «quanto del peso originale». */
window.CONFIG = {
  /* i tre livelli di forza, uguali in tutte le modalità (R-CMP-01); Carezza è il predefinito. I sottotitoli prendono i numeri da qui.
     pdf: qualità JPEG e lato lungo massimo in pixel delle immagini ricompresse (R-CMP-04)
     jpg: qualità JPEG e lato lungo massimo delle foto, 0 = misure originali (R-JPG-01)
     video: qualità minima (SSIM sulla luminosità) e riquadro massimo [lato lungo, lato corto], 0 = risoluzione originale (R-VID-06/23) */
  levels: {
    soft: { pdf: { q: 0.68, max: 4000 }, jpg: { q: 0.82, side: 0 }, video: { ssim: 0.97, box: 0 } },
    mid: { pdf: { q: 0.5, max: 4000 }, jpg: { q: 0.68, side: 0 }, video: { ssim: 0.95, box: 0 } },
    hard: { pdf: { q: 0.5, max: 1800 }, jpg: { q: 0.68, side: 2048 }, video: { ssim: 0.95, box: [1920, 1080] } }
  },
  pdf: {
    /* un'immagine dentro il PDF si sostituisce solo se la nuova pesa meno di questa frazione della vecchia (R-CMP-02) */
    imageKeep: 0.95,
    /* il PDF intero conta come alleggerito sotto questa frazione del peso originale (R-CMP-03) */
    fileKeep: 0.98
  },
  jpg: {
    /* la foto conta come alleggerita sotto questa frazione del peso originale (R-CMP-03) */
    fileKeep: 0.98
  },
  video: {
    /* il video si ricodifica solo se stima e risultato stanno sotto questa frazione del peso originale (R-VID-07) */
    fileKeep: 0.9,
    /* l'audio passa ad AAC solo se fa risparmiare almeno questa frazione del file (R-VID-08), al bitrate qui sotto */
    audioGain: 0.05,
    aacBitrate: 160000,
    /* scarto rapido: sotto questi bit per pixel e fotogramma il video è già leggero, niente codifiche di prova (R-VID-21) */
    lightBpp: { avc: 0.035, other: 0.05 },
    /* tentativi (R-VID-04): frazione minima e massima del bitrate d'origine; ci si ferma quando un punto promosso e uno bocciato
       distano meno di fstep, o quando il punto promosso più leggero supera la soglia di meno di near; slope = quanto sale la qualità
       (SSIM) a ogni raddoppio del bitrate diviso ln 2, per stimare il salto; al massimo maxSteps tentativi sugli spezzoni */
    search: { fmin: 0.035, fmax: 0.85, fstep: 1.45, near: 0.006, slope: 0.02, maxSteps: 6 },
    /* primo tentativo mirato (R-VID-04): il minore tra bit per pixel e fotogramma (bpp, per HEVC) e una frazione del bitrate d'origine
       secondo la sua codifica (modern = HEVC/VP9/AV1, avc = H.264, old = le altre); hi vale per qualità ≥ hiFrom, lo per le altre;
       con H.264 in uscita i valori si moltiplicano per avcMul */
    guess: { hiFrom: 0.965, bpp: { hi: 0.06, lo: 0.04 }, ratio: { hi: { modern: 0.7, avc: 0.45, old: 0.3 }, lo: { modern: 0.5, avc: 0.32, old: 0.22 } }, avcMul: 1.5 },
    /* video corti (R-VID-04): fino a shortSecs secondi si prova il video intero, al massimo wholeTries volte, misurando wholeFrames fotogrammi */
    shortSecs: 20, wholeTries: 4, wholeFrames: 6,
    /* margine sul bitrate trovato, perché la qualità reale non scenda sotto la soglia (R-VID-06) */
    planMargin: 1.05,
    /* video grandi (R-VID-14): soglia sicura = memoria del dispositivo × memPerGbMB, al massimo maxMB; se la memoria non è nota, defaultMB */
    safe: { memPerGbMB: 128, maxMB: 1024, defaultMB: 300 }
  },
  scan: {
    ocrIdleMs: 60000,      // R-APP-17: dopo quanto tempo senza usarli si spengono i motori di Tesseract
    /* bordi dai lati dritti (R-SCN-31), tutto su una copia con il lato lungo di size px (misure in px di quella copia):
       - contorno = pendenza oltre minGrad; si prendono le lines rette più forti; gli angoli possono uscire dalla foto fino a outside,
         il foglio occupa almeno minArea della foto;
       - punteggio di un lato: perde miss per ogni tratto senza contorno, unseen per ogni tratto fuori dalla foto, cont per ogni tratto
         oltre il quale il foglio continua (entro contReach della foto: carta al più contPaper più scura di quella dentro, senza colori
         oltre growSat, con tratti più scuri di contInk);
       - dei keep quadrilateri migliori ogni lato si sposta fino a sideRange della profondità, inclinandosi di ±sideTilt px, dove il
         punteggio sale: in fuori solo su carta con scritte (colori sotto paperSat), in dentro solo se fuori restano tratti scuri in meno
         di cutInk dei punti;
       - un lato con contorno sotto trimFrom passa dove finisce il contorno di un lato vicino, se manca almeno trimMin prima dell'angolo,
         ruotando fino a trimTurn gradi perché fuori restino tratti scuri in meno di trimInk dei punti;
       - cornice: un lato va sul contorno esterno parallelo entro frame della profondità se ha almeno frameSup di contorno e la striscia
         in mezzo ha colori oltre frameSat;
       - alla fine i lati rientrano di inset px e si curvano solo se così il contorno sotto di loro cresce di almeno curveGain;
       - bordi della maschera (R-SCN-09/28): punteggio × segBias (× segGoodBias se ogni lato ha almeno segGood di contorno); vincono anche
         se contengono quelli dei lati dritti e ogni loro lato ha almeno segMin di contorno;
       - pagina finita: lo sfondo scuro (sotto cleanDark, senza colore) attaccato ai bordi entro cleanBand diventa bianco */
    edges: { size: 480, minGrad: 3, lines: 28, outside: 0.15, minArea: 0.08,
      miss: 1, unseen: 0.3, cont: 2, contReach: 0.1, contPaper: 60, contInk: 50, growSat: 60,
      keep: 5, sideRange: 0.3, sideTilt: 12, paperSat: 35, cutInk: 0.4,
      trimFrom: 0.3, trimMin: 0.1, trimTurn: 30, trimInk: 0.03,
      frame: 0.1, frameSup: 0.7, frameSat: 35, inset: 2, curveGain: 0.005,
      segBias: 1.1, segGood: 0.8, segGoodBias: 1.35, segMin: 0.3, cleanBand: 0.03, cleanDark: 90 },
    /* ombre delle pieghe (R-SCN-29): analisi su una copia con il lato lungo di size px; luce fine con raggio fine, luce del foglio con
       raggio coarse (frazioni della pagina); bordo netto = pendenza della luce oltre sharp per pixel; la luce fine parte dal foglio pulito
       (luce ≥ seed di quella del foglio) e si allarga solo cambiando di meno di step per pixel; schiarimento al massimo maxGain;
       attorno ai tratti la luce si prende dal foglio raggiunto entro fill px (niente aloni) */
    shade: { on: true, size: 1000, fine: 0.006, coarse: 0.04, sharp: 0.015, step: 0.005, seed: 0.97, maxGain: 1.5, fill: 6 },
    /* distensione delle pieghe (R-SCN-27): analisi su una copia con il lato lungo di size px; una linea conta se lunga almeno minLen della pagina
       e piatta (larga almeno 4 volte l'altezza, alta al massimo maxH); la mappa si calcola su una griglia grid×grid con pesi gaussiani
       stretti lungo la linea (along) e larghi di traverso (across), in frazioni della pagina; spostamenti al massimo maxShift della pagina;
       servono almeno minLines linee, altrimenti la pagina resta com'è; passes = passate di correzione, composte in una sola; una linea vale se
       ha inchiostro su almeno cover della sua lunghezza; una pagina con più di maxColor di colori decisi non si distende;
       né una pagina le cui linee tremano (scarto mediano dalla loro parabola) più di maxWobble px: è scritta a mano */
    unfold: { maxColor: 0.15, maxWobble: 2.2, passes: 2, size: 1000, minLen: 0.1, cover: 0.65, maxH: 0.06, along: 0.02, across: 0.12, grid: 48, maxShift: 0.04, minLines: 3 }
  },
  /* statistiche d'uso anonime (R-PRI-05): codice del sito GoatCounter, scritto qui dal flusso di pubblicazione
     dalla variabile GC_CODE del repository; vuoto = nessun conteggio. host = solo su questo sito, mai in locale */
  stats: { code: "", host: "marketto.github.io" },
  ui: {
    /* il riquadro del lettore si aggiorna al massimo ogni tanti millisecondi (R-APP-07) */
    mediaEvery: 20000,
    /* salvataggio automatico del lavoro, al massimo ogni tanti millisecondi (R-APP-12) */
    autosaveEvery: 4000
  }
};

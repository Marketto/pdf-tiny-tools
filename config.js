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
    shortSecs: 20, wholeTries: 3, wholeFrames: 6,
    /* margine sul bitrate trovato, perché la qualità reale non scenda sotto la soglia (R-VID-06) */
    planMargin: 1.05,
    /* video grandi (R-VID-14): soglia sicura = memoria del dispositivo × memPerGbMB, al massimo maxMB; se la memoria non è nota, defaultMB */
    safe: { memPerGbMB: 128, maxMB: 1024, defaultMB: 300 }
  },
  ui: {
    /* il riquadro del lettore si aggiorna al massimo ogni tanti millisecondi (R-APP-07) */
    mediaEvery: 20000,
    /* salvataggio automatico del lavoro, al massimo ogni tanti millisecondi (R-APP-12) */
    autosaveEvery: 4000
  }
};

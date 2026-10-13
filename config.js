/* Soglie e parametri dell'app, tutti qui (R-DOC-03). Ogni valore dice a quale requisito si riferisce (docs/REQUISITI.md).
   Cambiando un numero cambia il comportamento: dopo, esegui la skill `verifica`. Le frazioni sono «quanto del peso originale». */
window.CONFIG = {
  pdf: {
    /* forza per i PDF (R-CMP-01): qualità JPEG e lato lungo massimo in pixel delle immagini ricompresse */
    levels: { soft: { q: 0.82, max: 2400 }, mid: { q: 0.68, max: 1700 }, hard: { q: 0.5, max: 1200 } },
    /* un'immagine dentro il PDF si sostituisce solo se la nuova pesa meno di questa frazione della vecchia (R-CMP-02) */
    imageKeep: 0.95,
    /* il PDF intero conta come alleggerito sotto questa frazione del peso originale (R-CMP-03) */
    fileKeep: 0.98
  },
  jpg: {
    /* la foto conta come alleggerita sotto questa frazione del peso originale (R-CMP-03) */
    fileKeep: 0.98,
    /* livello più forte delle foto, per il suggerimento quando nulla si alleggerisce (R-LST-05): valori dei pulsanti del passo 2 */
    maxLevel: { side: "1280", weight: "204800" }
  },
  video: {
    /* qualità minima (SSIM sulla luminosità) per Carezza, Stretta, Martellata (R-VID-06). I testi «Qualità ≥ …» sono in i18n.js */
    levels: { soft: 0.985, mid: 0.97, hard: 0.95 },
    /* il video si ricodifica solo se stima e risultato stanno sotto questa frazione del peso originale (R-VID-07) */
    fileKeep: 0.9,
    /* l'audio passa ad AAC solo se fa risparmiare almeno questa frazione del file (R-VID-08), al bitrate qui sotto */
    audioGain: 0.05,
    aacBitrate: 160000,
    /* scarto rapido: sotto questi bit per pixel e fotogramma il video è già leggero, niente codifiche di prova (R-VID-21) */
    lightBpp: { avc: 0.035, other: 0.05 },
    /* ricerca del bitrate: frazione minima e massima del bitrate d'origine e passo tra un tentativo e l'altro (R-VID-04/06) */
    search: { fmin: 0.035, fmax: 0.85, fstep: 1.45 },
    /* margine sul bitrate trovato, perché la qualità reale non scenda sotto la soglia (R-VID-06) */
    planMargin: 1.05,
    /* video grandi (R-VID-14): soglia sicura = memoria del dispositivo × memPerGbMB, al massimo maxMB; se la memoria non è nota, defaultMB */
    safe: { memPerGbMB: 128, maxMB: 1024, defaultMB: 300 }
  },
  /* TUTTO (R-TUT-03): cosa imposta ogni livello unico in PDF e foto (per i video vale lo stesso livello di video.levels) */
  all: {
    soft: { lvl: "soft", side: "2560", weight: "0" },
    mid: { lvl: "mid", side: "1920", weight: "512000" },
    hard: { lvl: "hard", side: "1280", weight: "204800" }
  },
  ui: {
    /* il riquadro del lettore si aggiorna al massimo ogni tanti millisecondi (R-APP-07) */
    mediaEvery: 20000,
    /* salvataggio automatico del lavoro, al massimo ogni tanti millisecondi (R-APP-12) */
    autosaveEvery: 4000
  }
};

/* Lavoro in secondo piano riusabile (R-APP-23): tiene viva la pagina mentre lavora con l'app nascosta o lo schermo
   spento. Chrome su Android non congela una pagina che riproduce audio: durante i lavori lunghi suona un <audio> in
   loop (tono a 17 kHz, −50 dB: non si sente; niente basse frequenze, che alcuni telefoni trasformano in vibrazione)
   che porta anche il riquadro del lettore con l'avanzamento e i pulsanti per fermare. Su iPhone non basta.
   Usato da Schiaccia PDF (index.html) e da altre app sullo stesso dominio (per esempio Kapibo).
   window.Sfondo: version, ios, inizia({titolo, app, icone, ferma}), aggiorna(titolo, subito), finisci(), attivo(). */
(function () {
  "use strict";
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var el = null, n = 0, last = 0, opt = {};
  function humWav() {
    /* 12 s (720 periodi esatti): Chrome per Android mostra il riquadro del lettore solo per audio di almeno 5 s */
    var sr = 44100, k = sr * 12, b = new ArrayBuffer(44 + k * 2), v = new DataView(b);
    function w(o, x) { for (var i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); }
    w(0, "RIFF"); v.setUint32(4, 36 + k * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, k * 2, true);
    for (var i = 0; i < k; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 17000 * i / sr) * 100), true);
    return new Blob([b], { type: "audio/wav" });
  }
  function meta(titolo) {
    if (!titolo || !navigator.mediaSession || !window.MediaMetadata) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: titolo, artist: opt.app || "", artwork: opt.icone || [] }); } catch (e) { /* niente */ }
  }
  /* inizia un lavoro (si possono annidare: la musica si ferma all'ultimo finisci) */
  function inizia(o) {
    n++;
    if (n === 1) {
      opt = o || {};
      try {
        if (!el) { el = new Audio(URL.createObjectURL(humWav())); el.loop = true; el.setAttribute("playsinline", ""); }
        var pr = el.play(); if (pr && pr.catch) pr.catch(function () {});
        if (navigator.mediaSession) {
          var stop = function () { if (opt.ferma) opt.ferma(); };
          navigator.mediaSession.setActionHandler("pause", stop);
          try { navigator.mediaSession.setActionHandler("stop", stop); } catch (e) { /* niente */ }
          navigator.mediaSession.playbackState = "playing";
        }
      } catch (e) { /* niente */ }
    }
    aggiorna(o && o.titolo, true);
  }
  /* avanzamento nel riquadro del lettore: al massimo ogni CFG.ui.mediaEvery ms (su alcuni telefoni ogni aggiornamento vibra) */
  function aggiorna(titolo, subito) {
    if (!n || !titolo) return;
    var every = (window.CONFIG && window.CONFIG.ui && window.CONFIG.ui.mediaEvery) || 20000, t = Date.now();
    if (!subito && t - last < every) return; last = t; meta(titolo);
  }
  function finisci() {
    n = Math.max(0, n - 1); if (n) return;
    try { if (el) { el.pause(); el.currentTime = 0; } } catch (e) { /* niente */ }
    try { if (navigator.mediaSession) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; } } catch (e) { /* niente */ }
  }
  window.Sfondo = { version: "dev", ios: ios, inizia: inizia, aggiorna: aggiorna, finisci: finisci, attivo: function () { return n > 0; }, humWav: humWav };
})();

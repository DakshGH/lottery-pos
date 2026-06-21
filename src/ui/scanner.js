/*
 * scanner.js — camera barcode/QR scanner with graceful, cross-browser fallbacks.
 *
 * Camera decoding engine, chosen at runtime:
 *   1. Native BarcodeDetector  (Chrome / Edge / Android — fastest, no library)
 *   2. ZXing  (vendor/zxing.js) — used when the native API is missing
 *      (Safari / iOS / Firefox). This is the "common barcode library".
 *   3. If neither + no camera → manual / USB hardware-scanner text entry.
 *
 * Lottery tickets are 1D barcodes (ITF / Code 128), so ZXing is hinted to those
 * formats (plus QR) for speed and accuracy.
 *
 * API:
 *   POS.scanner.scanOnce({ title, hint, mask })  -> Promise<string|null>
 *   POS.scanner.openContinuous({ title, hint, mask, onResult }) -> { close }
 *       onResult(raw) may return { kind:'ok'|'warn'|'err', title, msg }.
 *
 * Browser global: window.POS.scanner
 */
(function () {
  'use strict';
  const POS = (window.POS = window.POS || {});

  const SVG_SCAN =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8"/></svg>';
  const SVG_TORCH =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6l-1 7h2l-5 13v-9H8z"/></svg>';

  // High-res rear camera with continuous autofocus — needed to resolve the thin
  // bars of the 1D (Interleaved 2 of 5) barcode on lottery tickets.
  function cameraConstraints() {
    return {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: 'continuous',
      },
    };
  }
  function activeTrack(video, stream) {
    if (stream) { const t = stream.getVideoTracks()[0]; if (t) return t; }
    const s = video && video.srcObject;
    return s && s.getVideoTracks ? s.getVideoTracks()[0] || null : null;
  }

  function hasDetector() { return 'BarcodeDetector' in window; }
  function hasZXing() { return !!(window.ZXing && window.ZXing.BrowserMultiFormatReader); }

  // ZXing decode hints: the 1D formats found on lottery tickets, plus QR.
  function zxingHints() {
    const Z = window.ZXing;
    const f = Z.BarcodeFormat;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      f.ITF, f.CODE_128, f.CODE_39, f.CODABAR,
      f.EAN_13, f.EAN_8, f.UPC_A, f.UPC_E, f.QR_CODE,
    ]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    return hints;
  }

  function build(opts) {
    const continuous = !!opts.continuous;
    const overlay = document.createElement('div');
    overlay.className = 'scan-overlay';
    overlay.innerHTML =
      '<div class="scan-panel">' +
        '<div class="scan-head"><span class="ico">' + SVG_SCAN + '</span>' +
          '<h2>' + esc(opts.title || 'Scan ticket') + '</h2>' +
          '<button class="x" data-x>&times;</button></div>' +
        '<div class="scan-stage">' +
          '<video playsinline autoplay muted></video>' +
          '<div class="scan-reticle"><span></span><span></span><span></span><span></span><div class="scan-laser"></div></div>' +
          '<button class="scan-torch" data-torch hidden title="Flashlight">' + SVG_TORCH + '</button>' +
          '<div class="scan-status">Starting camera…</div>' +
        '</div>' +
        '<div class="scan-manual">' +
          '<input type="text" placeholder="' + esc(opts.hint || 'or type / hardware-scan the barcode, then Enter') + '" autocomplete="off" spellcheck="false" />' +
          '<button class="btn primary sm" data-manual>Enter</button>' +
        '</div>' +
        (continuous ? '<div class="scan-log"></div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function start(opts, handle) {
    const continuous = !!opts.continuous;
    const overlay = build(opts);
    const video = overlay.querySelector('video');
    const statusEl = overlay.querySelector('.scan-status');
    const input = overlay.querySelector('.scan-manual input');
    const logEl = overlay.querySelector('.scan-log');
    let stream = null, detector = null, timer = null, zxingReader = null, closed = false, lastVal = '', lastAt = 0;

    function setStatus(msg, kind) {
      statusEl.textContent = msg;
      statusEl.className = 'scan-status' + (kind ? ' ' + kind : '');
    }
    function log(res) {
      if (!logEl || !res) return;
      const row = document.createElement('div');
      row.className = 'scan-log-row ' + (res.kind || 'ok');
      row.innerHTML = '<span class="dot"></span><div><div class="t">' + esc(res.title || '') + '</div>' +
        (res.msg ? '<div class="s">' + esc(res.msg) + '</div>' : '') + '</div>';
      logEl.insertBefore(row, logEl.firstChild);
      while (logEl.children.length > 30) logEl.removeChild(logEl.lastChild);
    }

    function deliver(raw) {
      raw = String(raw || '').trim();
      if (!raw) return;
      const now = Date.now();
      if (continuous && raw === lastVal && now - lastAt < 1500) return; // debounce dup
      lastVal = raw; lastAt = now;
      if (continuous) {
        flashReticle();
        const res = opts.onResult ? opts.onResult(raw) : null;
        log(res);
      } else {
        cleanup();
        handle.resolve(raw);
      }
    }

    function flashReticle() {
      const r = overlay.querySelector('.scan-reticle');
      r.classList.add('hit'); setTimeout(() => r.classList.remove('hit'), 350);
    }

    async function initCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return noCamera('Camera not available on this device.');
      }
      // 1) Native BarcodeDetector — fastest where supported.
      if (hasDetector()) return initNative();
      // 2) ZXing library — cross-browser fallback (Safari / iOS / Firefox).
      if (hasZXing()) return initZXing();
      // 3) Camera preview only, manual entry for decoding.
      try {
        stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
        video.srcObject = stream; try { await video.play(); } catch (e) {}
        afterCameraReady();
        setStatus('Live camera (auto-detect unavailable — type the code).', 'warn');
      } catch (e) { noCamera('Camera blocked or unavailable — use manual entry.'); }
    }

    async function initNative() {
      try {
        stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
      } catch (e) { return noCamera('Camera blocked or unavailable — use manual entry.'); }
      video.srcObject = stream;
      try { await video.play(); } catch (e) {}
      afterCameraReady();
      try { detector = new window.BarcodeDetector(); } catch (e) { detector = null; }
      if (!detector) return initZXing(); // detector ctor failed -> try library
      setStatus('Point at the barcode — hold steady, fill the frame', '');
      timer = setInterval(scanTick, 200);
    }

    function initZXing() {
      if (!hasZXing()) return noCamera('Camera decoding unavailable — use manual entry.');
      try {
        zxingReader = new window.ZXing.BrowserMultiFormatReader(zxingHints(), 200);
        setStatus('Point at the barcode — hold steady, fill the frame', '');
        zxingReader.decodeFromConstraints(
          cameraConstraints(), video,
          (result) => { if (!closed && result) deliver(result.getText()); }
        ).then(() => afterCameraReady())
          .catch(() => noCamera('Camera blocked or unavailable — use manual entry.'));
      } catch (e) { noCamera('Camera blocked or unavailable — use manual entry.'); }
    }

    // Once a camera is live (any engine): request continuous autofocus and show
    // the torch button if the device supports it.
    function afterCameraReady() {
      const track = activeTrack(video, stream);
      if (!track) return;
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps && Array.isArray(caps.focusMode) && caps.focusMode.indexOf('continuous') !== -1) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        if (caps && caps.torch) {
          const btn = overlay.querySelector('[data-torch]');
          if (btn) {
            btn.hidden = false;
            let on = false;
            btn.onclick = () => {
              on = !on;
              track.applyConstraints({ advanced: [{ torch: on }] })
                .then(() => btn.classList.toggle('on', on)).catch(() => {});
            };
          }
        }
      } catch (e) { /* capabilities not supported — fine */ }
    }

    function noCamera(msg) {
      overlay.querySelector('.scan-stage').classList.add('no-cam');
      setStatus(msg, 'warn');
      input.focus();
    }

    async function scanTick() {
      if (closed || !detector || video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) deliver(codes[0].rawValue);
      } catch (e) { /* transient detect errors are fine */ }
    }

    function cleanup() {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      if (zxingReader) { try { zxingReader.reset(); } catch (e) {} }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
    }

    // restrict manual entry to digits, auto-inserting dashes per the mask
    const mask = opts.mask && opts.mask.length ? opts.mask : null;
    function format(raw) {
      let digits = String(raw).replace(/\D/g, '');
      if (!mask) return digits; // digits only when no segment mask
      const total = mask.reduce((a, b) => a + b, 0);
      digits = digits.slice(0, total);
      const out = [];
      let i = 0;
      for (let s = 0; s < mask.length && i < digits.length; s++) {
        out.push(digits.slice(i, i + mask[s]));
        i += mask[s];
      }
      return out.join('-');
    }
    input.addEventListener('input', () => {
      const start = input.selectionStart, before = input.value;
      const f = format(input.value);
      input.value = f;
      // keep caret near the end on reformat
      if (f.length !== before.length) input.setSelectionRange(input.value.length, input.value.length);
      else input.setSelectionRange(start, start);
    });

    // wire controls
    overlay.querySelector('[data-x]').onclick = () => { cleanup(); handle.resolve(null); };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) { cleanup(); handle.resolve(null); } });
    const submitManual = () => { const v = input.value.trim(); input.value = ''; if (v) deliver(v); };
    overlay.querySelector('[data-manual]').onclick = submitManual;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitManual(); } });
    document.addEventListener('keydown', escClose);
    function escClose(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', escClose); cleanup(); handle.resolve(null); } }

    handle.close = () => { document.removeEventListener('keydown', escClose); cleanup(); handle.resolve(null); };
    initCamera();
  }

  function scanOnce(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const handle = { resolve };
      start(Object.assign({}, opts, { continuous: false }), handle);
    });
  }

  function openContinuous(opts) {
    opts = opts || {};
    const handle = { resolve: function () {} };
    start(Object.assign({}, opts, { continuous: true }), handle);
    return { close: () => handle.close && handle.close() };
  }

  // engine() reports which camera decoder is in use — handy for diagnostics.
  function engine() { return hasDetector() ? 'native' : hasZXing() ? 'zxing' : 'manual'; }
  POS.scanner = { scanOnce, openContinuous, hasDetector, hasZXing, engine };
})();

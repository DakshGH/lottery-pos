/*
 * scanner.js — camera-based QR / barcode scanner with graceful fallbacks.
 *
 * Primary input is the device camera (uses the native BarcodeDetector API,
 * supporting QR codes and 1D barcodes). Always offers a manual / hardware-
 * scanner text field so it works on devices without a camera or that API.
 *
 * API:
 *   POS.scanner.scanOnce({ title, hint })  -> Promise<string|null>   (raw value)
 *   POS.scanner.openContinuous({ title, hint, onResult })            -> { close }
 *       onResult(raw) may return { kind:'ok'|'warn'|'err', title, msg }
 *       to show a line in the in-scanner activity log.
 *
 * Browser global: window.POS.scanner
 */
(function () {
  'use strict';
  const POS = (window.POS = window.POS || {});

  const SVG_SCAN =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8"/></svg>';

  function hasDetector() { return 'BarcodeDetector' in window; }

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
          '<video playsinline muted></video>' +
          '<div class="scan-reticle"><span></span><span></span><span></span><span></span><div class="scan-laser"></div></div>' +
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
    let stream = null, detector = null, timer = null, closed = false, lastVal = '', lastAt = 0;

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
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, audio: false,
        });
      } catch (e) {
        return noCamera('Camera blocked or unavailable — use manual entry.');
      }
      video.srcObject = stream;
      try { await video.play(); } catch (e) {}
      if (!hasDetector()) {
        setStatus('Live camera (auto-detect unavailable — type the code).', 'warn');
        return;
      }
      try { detector = new window.BarcodeDetector(); } catch (e) { detector = null; }
      setStatus('Point at the barcode / QR code', '');
      timer = setInterval(scanTick, 280);
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

  POS.scanner = { scanOnce, openContinuous, hasDetector };
})();

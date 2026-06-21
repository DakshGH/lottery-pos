/*
 * hardware-scan.js — global USB barcode-scanner (keyboard-wedge) capture.
 *
 * A USB barcode scanner acts like a keyboard: it "types" the barcode digits very
 * fast and ends with Enter. This listens app-wide so a clerk can scan from any
 * screen without first clicking into a field.
 *
 * Detection heuristic: characters arriving in a fast burst (< ~50ms apart),
 * terminated by Enter, with a minimum length. Slow human typing is ignored.
 *
 * It deliberately stays out of the way:
 *   - if the camera scanner overlay is open, that dialog handles input;
 *   - if the user is typing in a real input/textarea/select, we don't intercept.
 *
 * API: POS.hardwareScan.install(onScan)   // onScan(rawString)
 * Browser global: window.POS.hardwareScan
 */
(function () {
  'use strict';
  const POS = (window.POS = window.POS || {});

  const MAX_GAP_MS = 50;   // max time between keystrokes to still count as a scan
  const MIN_LENGTH = 6;    // ignore short bursts (stray keys)

  function install(onScan) {
    let buf = '';
    let lastAt = 0;
    let fastCount = 0;

    document.addEventListener('keydown', (e) => {
      // a focused field (or our scan overlay) owns the keystrokes
      const ae = document.activeElement;
      const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' ||
        ae.tagName === 'SELECT' || ae.isContentEditable);
      if (inField || document.querySelector('.scan-overlay')) { buf = ''; fastCount = 0; return; }

      const now = Date.now();
      const gap = now - lastAt;

      if (e.key === 'Enter') {
        const looksScanned = buf.length >= MIN_LENGTH && fastCount >= buf.length - 1;
        const code = buf;
        buf = ''; fastCount = 0;
        if (looksScanned) { e.preventDefault(); onScan(code); }
        return;
      }
      if (e.key && e.key.length === 1) {
        if (gap > MAX_GAP_MS) { buf = ''; fastCount = 0; } // reset on a slow (human) gap
        else if (buf) fastCount++;
        buf += e.key;
        lastAt = now;
      }
    }, true);
  }

  POS.hardwareScan = { install };
})();

/*
 * barcode.js — parse and validate lottery scratch-off barcodes.
 *
 * Format: GGGGG-PPPPPPP-III   e.g. "01967-1032738-033"
 *   GGGGG     (5)  game number  — static for a given game
 *   PPPPPPP   (7)  pack number  — unique per pack within a game
 *   III       (3)  pack index   — tickets sold so far in this pack (0-based)
 *
 * Scanners may emit the dashes or a continuous digit string (15 digits).
 * Some states use different field widths, so widths are configurable.
 *
 * Works in both Node (require) and the browser (window.POS.barcode).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.POS = window.POS || {};
    window.POS.barcode = mod;
  }
})(this, function () {
  'use strict';

  const DEFAULT_WIDTHS = { game: 5, pack: 7, index: 3 };

  /**
   * Parse a raw scanned string into { gameNumber, packNumber, index }.
   * Returns { ok:false, error } if it can't be parsed.
   */
  function parse(raw, widths) {
    widths = widths || DEFAULT_WIDTHS;
    if (raw == null) return fail('Empty scan');
    const s = String(raw).trim();
    if (!s) return fail('Empty scan');

    // If it already has the dashed shape with 3 parts, trust that split.
    if (s.indexOf('-') !== -1) {
      const parts = s.split('-').map((p) => p.replace(/\D/g, ''));
      if (parts.length === 3 && parts.every((p) => p.length > 0)) {
        return build(parts[0], parts[1], parts[2]);
      }
    }

    // Otherwise treat as a continuous digit string and slice by widths.
    const digits = s.replace(/\D/g, '');
    const total = widths.game + widths.pack + widths.index;
    if (digits.length !== total) {
      return fail(
        `Expected ${total} digits (got ${digits.length}). Check the scan or barcode width settings.`
      );
    }
    const game = digits.slice(0, widths.game);
    const pack = digits.slice(widths.game, widths.game + widths.pack);
    const index = digits.slice(widths.game + widths.pack);
    return build(game, pack, index);
  }

  function build(game, pack, index) {
    const idx = parseInt(index, 10);
    if (Number.isNaN(idx)) return fail('Invalid index segment');
    return {
      ok: true,
      gameNumber: game,
      packNumber: pack,
      index: idx,
      indexRaw: index,
      // canonical "key" that identifies a physical pack
      packKey: game + '-' + pack,
    };
  }

  function fail(error) {
    return { ok: false, error: error };
  }

  /** Build a canonical pack key from game + pack numbers. */
  function packKey(gameNumber, packNumber) {
    return String(gameNumber) + '-' + String(packNumber);
  }

  return { parse, packKey, DEFAULT_WIDTHS };
});

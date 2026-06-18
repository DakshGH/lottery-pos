/*
 * games.js — the "online game database" layer.
 *
 * Maps a 5-digit game number -> { name, price, ticketsPerPack }.
 * Resolution order when looking up:
 *   1. local overrides (games the owner added/edited manually)  [persisted]
 *   2. fetched/seed catalog (from a remote URL or bundled seed) [refreshable]
 *
 * This is intentionally a thin, swappable layer: point `remoteUrl` at a real
 * state-lottery feed later without touching the rest of the app.
 *
 * Browser global: window.POS.games  (depends on window.POS.engine)
 */
(function (root, factory) {
  const mod = factory(
    typeof require !== 'undefined' ? require('./engine') : (root.POS && root.POS.engine)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.POS = window.POS || {};
    window.POS.games = mod;
  }
})(this, function (engine) {
  'use strict';

  /** Normalize a raw catalog entry into a complete game record. */
  function normalize(gameNumber, entry) {
    if (!entry) return null;
    const price = Number(entry.price);
    const tpp = entry.ticketsPerPack
      ? Number(entry.ticketsPerPack)
      : engine.ticketsPerPack(price);
    return {
      gameNumber: String(gameNumber),
      name: entry.name || ('Game ' + gameNumber),
      price: price,
      ticketsPerPack: tpp,
      maxIndex: tpp > 0 ? tpp - 1 : 0,
      _known: tpp > 0 && Number.isFinite(price),
    };
  }

  /**
   * Create a catalog instance.
   * @param {object} catalog  { games: { [num]: {name,price,...} } }
   * @param {object} overrides { [num]: {name,price,...} } persisted local edits
   */
  function create(catalog, overrides) {
    const base = (catalog && catalog.games) || {};
    overrides = overrides || {};

    function lookup(gameNumber) {
      const g = String(gameNumber);
      const entry = overrides[g] || base[g];
      return normalize(g, entry); // null if totally unknown
    }

    /** True if we have name+price+packsize for this game. */
    function isKnown(gameNumber) {
      const r = lookup(gameNumber);
      return !!(r && r._known);
    }

    /** Merge a refreshed remote catalog (keeps local overrides on top). */
    function setCatalog(next) {
      catalog = next || { games: {} };
    }

    /** Add/replace a local override (manual entry for an unknown game). */
    function setOverride(gameNumber, entry) {
      overrides[String(gameNumber)] = entry;
    }

    function allKnownNumbers() {
      const set = new Set(
        Object.keys((catalog && catalog.games) || {}).concat(Object.keys(overrides))
      );
      return Array.from(set).sort();
    }

    return {
      lookup,
      isKnown,
      setCatalog,
      setOverride,
      allKnownNumbers,
      get overrides() {
        return overrides;
      },
      get catalog() {
        return catalog;
      },
    };
  }

  /**
   * Fetch a remote catalog JSON (browser only). Falls back gracefully.
   * @returns {Promise<object|null>}
   */
  async function fetchCatalog(url) {
    if (typeof fetch === 'undefined' || !url) return null;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      return json && json.games ? json : null;
    } catch (e) {
      return null;
    }
  }

  return { create, normalize, fetchCatalog };
});

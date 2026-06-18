/*
 * storage.js — persistence (browser). Saves the whole app state as JSON in
 * localStorage, with file export/import for backups.
 *
 * localStorage is synchronous and simple; the data set (bins, packs, ~years of
 * day records) stays well under the multi-MB limit. The interface is small so
 * it can be swapped for IndexedDB / a file backend later without touching the
 * store.
 *
 * Browser global: window.POS.storage
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.POS = window.POS || {};
    window.POS.storage = mod;
  }
})(this, function () {
  'use strict';

  const KEY = 'pos.lottery.state.v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load state', e);
      return null;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Failed to save state', e);
      return false;
    }
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  /** Trigger a download of the current state as a backup file. */
  function exportToFile(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'lottery-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Read a user-selected JSON file -> parsed object. */
  function importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch (e) {
          reject(new Error('Not a valid backup file.'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    });
  }

  return { KEY, load, save, clear, exportToFile, importFromFile };
});

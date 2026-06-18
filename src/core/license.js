/*
 * license.js — client side of subscription / anti-theft enforcement.
 *
 * IMPORTANT (read LICENSING.md): a browser app runs on the client's machine, so
 * this client check can be bypassed by a determined user. Real protection needs
 * the *server* to be the gatekeeper. This module is the client half of that
 * design: it phones home every 15 minutes to YOUR license server, records usage,
 * and locks the app when the subscription is invalid/expired. Hardened only when
 * paired with the server contract described in LICENSING.md.
 *
 * Enforcement is OFF until a server URL + key are configured (so demos/trials
 * run freely). Browser global: window.POS.license
 */
(function () {
  'use strict';
  const POS = (window.POS = window.POS || {});
  const KEY = 'pos.license.v1';
  const CHECK_MS = 15 * 60 * 1000;      // heartbeat cadence (15 min)
  const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // allow 7 days offline

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  let st = load();
  if (!st.deviceId) { st.deviceId = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); save(st); }
  let timer = null;
  const listeners = new Set();
  function emit() { const s = status(); listeners.forEach((fn) => fn(s)); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function configured() { return !!(st.serverUrl && st.key); }

  /** Current license status (what the UI/lock screen read). */
  function status() {
    const now = Date.now();
    if (!configured()) {
      return { mode: 'unlicensed', locked: false, key: st.key || '', serverUrl: st.serverUrl || '', deviceId: st.deviceId, plan: null, validUntil: null };
    }
    const valid = st.lastValid === true && st.validUntil && now < st.validUntil;
    const explicitlyInvalid = st.lastValid === false;
    const withinGrace = st.lastOkAt && now - st.lastOkAt < OFFLINE_GRACE_MS;
    let locked = false, mode = 'active';
    if (explicitlyInvalid) { locked = true; mode = 'invalid'; }
    else if (valid) { locked = false; mode = 'active'; }
    else if (withinGrace) { locked = false; mode = 'grace'; }
    else { locked = true; mode = st.lastOkAt ? 'expired' : 'unverified'; }
    return {
      mode, locked, key: st.key, serverUrl: st.serverUrl, deviceId: st.deviceId,
      plan: st.plan || null, validUntil: st.validUntil || null,
      lastOkAt: st.lastOkAt || null, lastError: st.lastError || null,
    };
  }

  /** One heartbeat to the license server. Records usage + refreshes validity. */
  async function check() {
    if (!configured()) { emit(); return status(); }
    try {
      const res = await fetch(st.serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'lottery-pos',
          key: st.key,
          deviceId: st.deviceId,
          ts: new Date().toISOString(),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          // light usage telemetry so you can see active installs
          usage: collectUsage(),
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json(); // expected: { valid:bool, plan, validUntil (ISO) }
      st.lastValid = !!data.valid;
      st.plan = data.plan || st.plan;
      st.validUntil = data.validUntil ? Date.parse(data.validUntil) : st.validUntil;
      st.lastOkAt = Date.now();
      st.lastError = null;
    } catch (e) {
      st.lastError = String(e.message || e); // network/server down -> rely on grace window
    }
    save(st); emit();
    return status();
  }

  function collectUsage() {
    try {
      const app = POS.storage && POS.storage.load && POS.storage.load();
      if (!app) return {};
      return {
        bins: (app.bins || []).length,
        packs: Object.keys(app.packs || {}).length,
        days: (app.days || []).length,
        storeName: (app.settings || {}).storeName || '',
      };
    } catch (e) { return {}; }
  }

  function start() {
    if (timer) clearInterval(timer);
    if (configured()) { check(); timer = setInterval(check, CHECK_MS); }
    else emit();
  }

  function setConfig(serverUrl, key) {
    st.serverUrl = (serverUrl || '').trim();
    st.key = (key || '').trim();
    st.lastValid = undefined; st.validUntil = undefined; st.lastOkAt = undefined; st.lastError = undefined;
    save(st);
    start();
  }
  function deactivateLocal() { setConfig('', ''); }

  POS.license = { start, check, status, onChange, setConfig, deactivateLocal, get deviceId() { return st.deviceId; } };
})();

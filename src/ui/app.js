/*
 * app.js — UI controller. Renders views, wires actions, runs the day flows.
 * Depends on window.POS.{engine, barcode, games, storage, store}.
 */
(function () {
  'use strict';
  const POS = window.POS;
  const { engine, barcode } = POS;

  // ---- tiny helpers ------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const money = (n) => {
    const v = Number(n) || 0;
    const s = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return v < 0 ? '-' + s : s;
  };
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

  const ICON = {
    scan: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8"/></svg>',
    bins: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    box: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    archive: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>',
    history: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/></svg>',
    chart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/></svg>',
    gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><path d="M9 7v10" stroke-dasharray="1.5 2.5"/></svg>',
    search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
    bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    cam: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8"/></svg>',
    check: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  };

  // ---- toast -------------------------------------------------------------
  function toast(title, msg, kind) {
    const root = $('#toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.innerHTML = '<div class="t-title">' + esc(title) + '</div>' + (msg ? '<div class="t-msg">' + esc(msg) + '</div>' : '');
    root.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s'; t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, kind === 'err' ? 5000 : 2800);
  }

  // ---- shared UI state ---------------------------------------------------
  let searchQuery = '';
  function matchSearch(text) {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return String(text || '').toLowerCase().indexOf(q) !== -1;
  }

  // ---- modal -------------------------------------------------------------
  let modalMount = null;
  function openModal(opts) {
    closeModal();
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML =
      '<div class="modal ' + (opts.wide ? 'wide' : '') + '">' +
        '<div class="modal-head"><h2>' + esc(opts.title) + '</h2>' +
          (opts.noClose ? '' : '<button class="x" data-action="close-modal">&times;</button>') +
        '</div>' +
        '<div class="modal-body">' + (opts.bodyHTML || '') + '</div>' +
        (opts.footHTML ? '<div class="modal-foot">' + opts.footHTML + '</div>' : '') +
      '</div>';
    root.appendChild(wrap);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && !opts.noClose) closeModal(); });
    modalMount = wrap;
    if (opts.onMount) opts.onMount(wrap);
    return wrap;
  }
  function closeModal() {
    if (modalMount) { modalMount.remove(); modalMount = null; }
  }

  // ===================================================================== //
  //  BOOT                                                                 //
  // ===================================================================== //
  let store;
  function boot() {
    const seed = window.POS_SEED_CATALOG || { games: {} };
    store = POS.store.createStore(seed);
    window.__store = store; // debug/automation handle
    store.subscribe(() => render());
    // optional remote refresh
    const url = store.getState().settings.remoteGamesUrl;
    if (url) {
      POS.games.fetchCatalog(url).then((cat) => { if (cat) store.setCatalog(cat); });
    }
    window.addEventListener('hashchange', () => render());
    // USB barcode scanner (keyboard-wedge): works from any screen
    if (POS.hardwareScan) POS.hardwareScan.install(handleHardwareScan);
    // subscription / anti-theft: lock the app if the license server says so
    if (POS.license) {
      POS.license.onChange(renderLockScreen);
      POS.license.start();
      renderLockScreen(POS.license.status());
    }
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const si = $('#search-input'); if (si) si.focus();
      }
    });
    render();
  }

  function currentView() {
    return (location.hash || '#bins').replace('#', '') || 'bins';
  }
  function go(view) { location.hash = '#' + view; }

  // ===================================================================== //
  //  RENDER                                                               //
  // ===================================================================== //
  function render() {
    const view = currentView();
    const inDay = store.isInDay();
    const counts = {
      bins: store.listBins().length,
      inventory: store.listInventory().length,
      soldout: store.listSoldOut().length,
    };
    const navItem = (id, label, icon, badge) =>
      '<a data-nav="' + id + '" class="' + (view === id ? 'active' : '') + '">' + icon +
        '<span class="label">' + label + '</span>' +
        (badge != null && badge > 0 ? '<span class="badge">' + badge + '</span>' : '') + '</a>';

    const app = $('#app');
    app.innerHTML =
      topbar(inDay) +
      '<div class="layout">' +
        '<nav class="nav">' +
          navItem('bins', 'Bins', ICON.bins, counts.bins) +
          navItem('inventory', 'Inventory', ICON.box, counts.inventory) +
          navItem('soldout', 'Sold-out', ICON.archive, counts.soldout) +
          navItem('history', 'History', ICON.history) +
          navItem('reports', 'Reports', ICON.chart) +
          '<div class="spacer"></div>' +
          salesCard() +
          navItem('settings', 'Settings', ICON.gear) +
        '</nav>' +
        '<main class="main">' + viewHTML(view) + '</main>' +
      '</div>';

    const si = $('#search-input');
    if (si) si.addEventListener('input', (e) => { searchQuery = e.target.value; renderMain(); });
  }

  // Re-render only the content area (keeps topbar/search focus intact).
  function renderMain() {
    const m = $('.main');
    if (m) m.innerHTML = viewHTML(currentView());
  }

  // Full-screen lock when the subscription is invalid/expired.
  function renderLockScreen(s) {
    let el = document.getElementById('lock-screen');
    if (!s || !s.locked) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'lock-screen'; el.className = 'lock-screen'; document.body.appendChild(el); }
    const msg = s.mode === 'expired' ? 'Your subscription has expired. Renew to continue.'
      : s.mode === 'invalid' ? 'This license key is not valid for this device.'
      : 'Could not verify your subscription. Connect to the internet, or enter a valid key.';
    el.innerHTML =
      '<div class="lock-card"><div class="brand" style="justify-content:center;min-width:0;margin-bottom:6px"><div class="logo">' + ICON.logo + '</div></div>' +
      '<h2>Subscription required</h2><p class="muted">' + esc(msg) + '</p>' +
      '<div class="field"><label>License key</label><input id="lk-key" value="' + esc(s.key || '') + '" placeholder="LP-XXXX-XXXX"></div>' +
      '<div class="field"><label>License server URL</label><input id="lk-url" value="' + esc(s.serverUrl || '') + '" placeholder="https://your-server/validate"></div>' +
      '<button class="btn primary block lg" id="lk-go">Activate &amp; verify</button>' +
      // Escape hatch only when the app was NEVER successfully verified (i.e. a
      // setup typo / no server) — an expired or revoked license cannot bypass.
      (s.mode === 'unverified' ? '<button class="btn ghost block" id="lk-trial" style="margin-top:8px">Continue in trial mode</button>' : '') +
      '<p class="muted" style="font-size:12px;margin-top:14px">Device ID: <span class="mono">' + esc(s.deviceId) + '</span></p></div>';
    el.querySelector('#lk-go').onclick = async () => {
      POS.license.setConfig(el.querySelector('#lk-url').value, el.querySelector('#lk-key').value);
      const r = await POS.license.check();
      if (r.locked) toast('Still locked', r.lastError || 'Key or server rejected', 'err');
      else toast('Activated', 'Subscription verified', 'ok');
    };
    const trial = el.querySelector('#lk-trial');
    if (trial) trial.onclick = () => { POS.license.deactivateLocal(); toast('Trial mode', 'License cleared', 'ok'); };
  }

  function initials() {
    const n = (store.getState().settings.storeName || '').trim();
    if (!n) return 'NJ';
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join('').toUpperCase();
  }

  // Sidebar "Today's Sales" readout.
  function salesCard() {
    const days = store.listDays();
    const vals = days.map((d) => engine.computeDay(d).scratchSales);
    const today = vals.length ? vals[vals.length - 1] : 0;
    const yest = vals.length > 1 ? vals[vals.length - 2] : 0;
    let delta = '<div class="delta">no history yet</div>';
    if (yest > 0) {
      const pct = Math.round(((today - yest) / yest) * 100);
      delta = '<div class="delta ' + (pct >= 0 ? 'up' : 'down') + '">' + (pct >= 0 ? '+' : '') + pct + '% vs yesterday</div>';
    } else if (today > 0) {
      delta = '<div class="delta up">first sales recorded</div>';
    }
    return '<div class="nav-sales">' +
      '<div class="lbl">Today\'s Sales</div>' +
      '<div class="amt">' + money(today) + '</div>' + delta + '</div>';
  }

  // Operational alerts surfaced on the bell.
  function notifications() {
    const out = [];
    store.listBins().forEach((b) => {
      const p = store.activePackInBin(b.id);
      if (p && p.ticketsPerPack) {
        const left = p.ticketsPerPack - (p.currentIndex || 0);
        if (left <= 5) out.push({ kind: 'warn', title: b.name + ' running low', msg: left + ' ticket' + (left === 1 ? '' : 's') + ' left · ' + p.name });
      }
    });
    store.listInventory().forEach((p) => {
      if (!p.knownGame) out.push({ kind: 'err', title: 'Unknown game ' + p.gameNumber, msg: 'Define it in Settings (pack ' + p.packNumber + ')' });
    });
    if (!store.isInDay()) out.push({ kind: 'ok', title: 'Day is closed', msg: 'Start a day to record sales' });
    return out;
  }
  function notificationsFlow() {
    const items = notifications();
    const body = items.length
      ? '<div class="list">' + items.map((a) =>
          '<div class="list-item"><span class="sdot ' + (a.kind === 'err' ? 'err' : a.kind === 'warn' ? 'warn' : 'ok') + '"></span>' +
            '<div class="grow"><div class="title">' + esc(a.title) + '</div><div class="sub">' + esc(a.msg) + '</div></div></div>').join('') + '</div>'
      : '<div class="empty-state" style="padding:32px"><div class="big">' + ICON.check + '</div><h3>All clear</h3><p>No alerts right now.</p></div>';
    openModal({ title: 'Alerts', bodyHTML: body, footHTML: '<button class="btn primary" data-action="close-modal">Close</button>' });
  }

  function topbar(inDay) {
    const st = store.getState().settings;
    const alertCount = notifications().length;
    const dayBtn = inDay
      ? '<button class="btn danger" data-action="end-day">End Day</button>'
      : '<button class="btn green" data-action="start-day">Start Day</button>';
    return (
      '<header class="topbar">' +
        '<div class="brand"><div class="logo">' + ICON.logo + '</div>' +
          '<div><div class="name">Lottery POS</div>' +
            (st.storeName ? '<div class="store-name">' + esc(st.storeName) + '</div>' : '<div class="store-name">New Jersey</div>') +
          '</div></div>' +
        '<div class="searchbar">' + ICON.search +
          '<input id="search-input" placeholder="Search games, packs, bins…" autocomplete="off" spellcheck="false" value="' + esc(searchQuery) + '" />' +
          '<span class="kbd">Ctrl K</span>' +
        '</div>' +
        '<div class="topbar-right">' +
          '<button class="btn-scan" data-action="scan">' + ICON.cam + ' Scan</button>' +
          '<button class="icon-btn" data-action="show-notifications" title="Alerts">' + ICON.bell +
            (alertCount > 0 ? '<span class="badge-count">' + (alertCount > 9 ? '9+' : alertCount) + '</span>' : '') + '</button>' +
          '<div class="day-badge ' + (inDay ? 'in-day' : 'closed') + '"><span class="dot"></span>' +
            (inDay ? 'IN-DAY · ' + esc(store.currentDay().date) : 'CLOSED') + '</div>' +
          dayBtn +
          '<div class="avatar" data-nav="settings" title="Settings">' + esc(initials()) + '</div>' +
        '</div>' +
      '</header>'
    );
  }

  function viewHTML(view) {
    switch (view) {
      case 'bins': return viewBins();
      case 'inventory': return viewInventory();
      case 'soldout': return viewSoldOut();
      case 'history': return viewHistory();
      case 'day': return viewDayDetail();
      case 'reports': return viewReports();
      case 'settings': return viewSettings();
      default: return viewBins();
    }
  }

  // ---- BINS --------------------------------------------------------------
  function viewBins() {
    const bins = store.listBins();
    const inDay = store.isInDay();
    let head =
      '<div class="page-head"><h1>Bins</h1>' +
        '<span class="sub">' + bins.length + ' bin' + (bins.length === 1 ? '' : 's') +
        (inDay ? '' : ' · day is closed') + '</span>' +
        '<div class="actions"><button class="btn primary" data-action="add-bin">+ Add Bin</button></div></div>';

    if (!bins.length) {
      return head +
        '<div class="empty-state"><div class="big">' + ICON.bins + '</div><h3>No bins yet</h3>' +
        '<p>Add a bin for each physical dispenser slot, then activate a pack into it.</p>' +
        '<button class="btn primary lg" data-action="add-bin">+ Add your first bin</button></div>';
    }

    const day = store.currentDay();
    const cards = bins.map((bin) => {
      const pack = store.activePackInBin(bin.id);
      if (!pack) {
        return '<div class="card bin-card empty">' +
          '<div class="bin-top" style="width:100%"><span class="bin-pill">' + esc(bin.name) + '</span>' +
            '<span class="gameno">empty</span></div>' +
          '<div class="placeholder"><div class="plus">+</div>No active pack</div>' +
          '<div class="row-actions" style="justify-content:center;border-top:none;padding-top:0">' +
            '<button class="btn primary" data-action="activate" data-bin="' + bin.id + '">Activate pack</button>' +
            '<button class="btn ghost sm" data-action="rename-bin" data-bin="' + bin.id + '">Rename</button>' +
            '<button class="btn ghost sm" data-action="remove-bin" data-bin="' + bin.id + '">Remove</button>' +
          '</div></div>';
      }
      const tpp = pack.ticketsPerPack || 0;
      const idx = pack.currentIndex || 0;
      const pct = tpp ? Math.min(100, (idx / tpp) * 100) : 0;
      let soldToday = 0, amtToday = 0;
      if (day && day.bins[bin.id]) {
        const s = engine.binTicketSales(day.bins[bin.id]);
        soldToday = s.tickets; amtToday = s.amount;
      }
      return '<div class="card bin-card">' +
        '<div class="bin-top"><span class="bin-pill">' + esc(bin.name) + '</span>' +
          '<span class="gameno">' + esc(pack.gameNumber) + '</span></div>' +
        '<div class="game">' + esc(pack.name) + ' <span class="price">' + money(pack.price) + '</span></div>' +
        '<div class="meta mono">pack ' + esc(pack.packNumber) + ' · idx ' + idx + ' / ' + (tpp - 1) + '</div>' +
        '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
        '<div class="stats">' +
          '<div class="stat"><div class="n">' + soldToday + '</div><div class="l">sold today</div></div>' +
          '<div class="stat"><div class="n">' + money(amtToday) + '</div><div class="l">$ today</div></div>' +
          '<div class="stat"><div class="n">' + (tpp - idx) + '</div><div class="l">left</div></div>' +
        '</div>' +
        '<div class="row-actions">' +
          (inDay ? '<button class="btn accent sm" data-action="update-index" data-bin="' + bin.id + '">Update index</button>' : '') +
          '<button class="btn sm" data-action="activate" data-bin="' + bin.id + '">New pack</button>' +
          '<button class="btn sm" data-action="full-pack-active" data-pack="' + pack.id + '">Sold-out (full)</button>' +
          moveOutBtn(bin.id) +
          swapBtn(bin.id) +
          '<button class="btn ghost sm" data-action="reverse-activation" data-pack="' + pack.id + '">Undo activate</button>' +
        '</div></div>';
    }).join('');

    return head + '<div class="grid bins-grid">' + cards + '</div>';
  }
  function moveOutBtn(binId) {
    const empties = store.listBins().filter((b) => b.id !== binId && store.isBinEmpty(b.id));
    if (!empties.length) return '';
    return '<button class="btn ghost sm" data-action="move-pack" data-bin="' + binId + '">Move</button>';
  }
  function swapBtn(binId) {
    if (store.listBins().length < 2) return '';
    return '<button class="btn ghost sm" data-action="swap-bin" data-bin="' + binId + '">Swap</button>';
  }
  function moveIntoBtn() { return ''; }

  // ---- INVENTORY ---------------------------------------------------------
  function viewInventory() {
    const all = store.listInventory();
    const inv = all.filter((p) => matchSearch(p.name) || matchSearch(p.gameNumber) || matchSearch(p.packNumber));
    let head =
      '<div class="page-head"><h1>Inventory</h1>' +
        '<span class="sub">' + inv.length + (searchQuery ? ' of ' + all.length : '') + ' unactivated pack' + (inv.length === 1 ? '' : 's') + '</span>' +
        '<div class="actions">' +
          (store.listTrash().length ? '<button class="btn ghost" data-action="open-trash">Trash (' + store.listTrash().length + ')</button>' : '') +
          '<button class="btn primary" data-action="add-inventory">' + ICON.cam + ' Add delivery</button></div></div>';
    if (!all.length) {
      return head + '<div class="empty-state"><div class="big">' + ICON.box + '</div><h3>Inventory is empty</h3>' +
        '<p>When a delivery arrives, scan each pack to load it in.</p>' +
        '<button class="btn primary lg" data-action="add-inventory">+ Add delivery</button></div>';
    }
    // group by game
    const groups = {};
    inv.forEach((p) => { (groups[p.gameNumber] = groups[p.gameNumber] || []).push(p); });
    let html = '';
    Object.keys(groups).sort().forEach((gn) => {
      const packs = groups[gn];
      const g = packs[0];
      html += '<div class="section-title">' + esc(g.name) + ' · ' + esc(gn) +
        (g.knownGame ? ' · ' + money(g.price) : ' · <span class="chip amber">unknown game</span>') +
        ' · ' + packs.length + ' pack' + (packs.length === 1 ? '' : 's') + '</div>';
      html += '<div class="list">' + packs.map((p) =>
        '<div class="list-item">' +
          '<div class="grow"><div class="title mono">pack ' + esc(p.packNumber) + '</div>' +
            '<div class="sub">added ' + esc((p.addedAt || '').slice(0, 10)) + '</div></div>' +
          (p.knownGame
            ? '<button class="btn primary sm" data-action="activate-pack" data-pack="' + p.id + '">Activate → bin</button>' +
              '<button class="btn sm" data-action="full-pack-inv" data-pack="' + p.id + '">Sell full pack</button>'
            : '<button class="btn sm" data-action="define-game" data-game="' + esc(p.gameNumber) + '">Define game</button>') +
          '<button class="btn danger sm" data-action="remove-inv" data-pack="' + p.id + '">Remove</button>' +
        '</div>').join('') + '</div>';
    });
    return head + html;
  }

  // ---- SOLD-OUT ----------------------------------------------------------
  function viewSoldOut() {
    const packs = store.listSoldOut().slice().reverse();
    const value = packs.reduce((s, p) => s + (p.ticketsPerPack || 0) * (p.price || 0), 0);
    let head =
      '<div class="page-head"><h1>Sold-out archive</h1>' +
        '<span class="sub">' + packs.length + ' pack' + (packs.length === 1 ? '' : 's') +
        ' · ' + money(value) + ' total face value</span></div>';
    if (!packs.length) {
      return head + '<div class="empty-state"><div class="big">' + ICON.check + '</div><h3>Nothing sold out yet</h3>' +
        '<p>When a pack is replaced or a full pack is sold, it lands here. You can reverse it if it was a mistake.</p></div>';
    }
    return head + '<div class="list">' + packs.map((p) =>
      '<div class="list-item">' +
        '<div class="grow"><div class="title">' + esc(p.name) + ' <span class="muted mono">' + esc(p.packKey) + '</span></div>' +
          '<div class="sub">' + reasonLabel(p.soldOutReason) + ' · ' + esc((p.soldOutAt || '').slice(0, 10)) +
            ' · face ' + money((p.ticketsPerPack || 0) * (p.price || 0)) + '</div></div>' +
        '<button class="btn sm" data-action="reverse-soldout" data-pack="' + p.id + '">Reverse</button>' +
      '</div>').join('') + '</div>';
  }
  function reasonLabel(r) {
    return r === 'fullpack' ? 'Full-pack sale' : r === 'replaced' ? 'Replaced (rollover)' : 'Manual';
  }

  // ---- HISTORY -----------------------------------------------------------
  function viewHistory() {
    const days = store.listDays().slice().reverse();
    let head = '<div class="page-head"><h1>History</h1><span class="sub">' + days.length + ' day record' + (days.length === 1 ? '' : 's') + '</span></div>';
    if (!days.length) {
      return head + '<div class="empty-state"><div class="big">' + ICON.history + '</div><h3>No days recorded</h3>' +
        '<p>Start and end a day to build history. Past days can be edited and changes cascade forward.</p></div>';
    }
    return head + '<table class="tbl"><thead><tr><th>Date</th><th>Hours</th><th>Status</th><th class="num">Scratch $</th><th class="num">Online $</th><th class="num">Register $</th><th></th></tr></thead><tbody>' +
      days.map((d) => {
        const c = d.computed || engine.computeDay(d);
        return '<tr>' +
          '<td class="mono">' + esc(d.date) + '</td>' +
          '<td class="mono muted">' + esc(dayHours(d)) + '</td>' +
          '<td>' + (d.state === 'closed' ? '<span class="chip gray">closed</span>' : '<span class="chip green">in-day</span>') + '</td>' +
          '<td class="num">' + money(c.scratchSales) + '</td>' +
          '<td class="num">' + money(c.onlineSales) + '</td>' +
          '<td class="num">' + money(c.registerCash) + '</td>' +
          '<td class="num"><button class="btn sm" data-action="open-day" data-day="' + d.id + '">View / edit</button></td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  function dayHours(d) {
    const s = d.startTime || '';
    const e = d.endTime || (d.state === 'closed' ? '' : 'now');
    if (!s && !e) return '—';
    return (s || '—') + '–' + (e || '—');
  }

  let openDayId = null;
  function viewDayDetail() {
    const d = store.getDay(openDayId);
    if (!d) return '<div class="empty-state">Day not found. <button class="btn" data-action="nav-history">Back</button></div>';
    const c = d.computed || engine.computeDay(d);
    let head = '<div class="page-head"><button class="btn ghost sm" data-action="nav-history">← History</button>' +
      '<h1>' + esc(d.date) + '</h1>' +
      '<span class="sub">' + esc(dayHours(d)) + ' · ' + (d.state === 'closed' ? 'closed' : 'in-day') + '</span>' +
      '<div class="actions"><button class="btn" data-action="export-day-pdf" data-day="' + d.id + '">Export PDF</button>' +
        '<button class="btn" data-action="recompute">Recompute cascade</button></div></div>';

    let rows = '';
    store.listBins().forEach((bin) => {
      const bd = d.bins[bin.id];
      if (!bd) return;
      bd.segments.forEach((seg, si) => {
        const sold = engine.segmentTicketsSold(seg);
        rows += '<tr>' +
          '<td>' + esc(bin.name) + (bd.segments.length > 1 ? ' <span class="chip gray">pack ' + (si + 1) + '</span>' : '') + '</td>' +
          '<td>' + esc(seg.name || seg.gameNumber) + '</td>' +
          '<td class="num editable" data-action="edit-seg" data-day="' + d.id + '" data-bin="' + bin.id + '" data-seg="' + si + '" data-field="startIndex">' + seg.startIndex + '</td>' +
          '<td class="num editable" data-action="edit-seg" data-day="' + d.id + '" data-bin="' + bin.id + '" data-seg="' + si + '" data-field="endIndex">' + (seg.completed ? (seg.ticketsPerPack + ' (sold out)') : seg.endIndex) + '</td>' +
          '<td class="num">' + sold + '</td>' +
          '<td class="num">' + money(sold * (seg.price || 0)) + '</td>' +
        '</tr>';
      });
    });
    if (!rows) rows = '<tr><td colspan="6" class="muted">No bin activity recorded for this day.</td></tr>';

    const fp = (d.fullPacks || []).map((f) =>
      '<div class="kv"><span class="k">' + esc(f.name) + ' (full pack)</span><span class="v">' + money(engine.fullPackValue(f)) + '</span></div>').join('');

    return head +
      '<div class="card"><table class="tbl"><thead><tr><th>Bin</th><th>Game</th><th class="num">Start</th><th class="num">End</th><th class="num">Tickets</th><th class="num">$</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="muted" style="margin:12px 4px 0">Tip: click a start/end value to edit it. Changes cascade to later days automatically.</p></div>' +
      '<div class="section-title">Totals</div>' +
      '<div class="card">' +
        (fp || '') +
        '<div class="kv"><span class="k">Scratch ticket sales</span><span class="v">' + money(c.scratchTicketAmount) + '</span></div>' +
        (c.fullPackAmount ? '<div class="kv"><span class="k">Full-pack sales</span><span class="v">' + money(c.fullPackAmount) + '</span></div>' : '') +
        '<div class="kv"><span class="k">Total scratch sales</span><span class="v">' + money(c.scratchSales) + '</span></div>' +
        '<div class="kv"><span class="k">+ Online sales</span><span class="v">' + money(c.onlineSales) + '</span></div>' +
        '<div class="kv"><span class="k">− Online cashes</span><span class="v">' + money(c.onlineCashes) + '</span></div>' +
        '<div class="kv"><span class="k">− Scratch cashes</span><span class="v">' + money(c.scratchCashes) + '</span></div>' +
        '<div class="kv total"><span class="k">Cash in register</span><span class="v">' + money(c.registerCash) + '</span></div>' +
      '</div>';
  }

  // ---- REPORTS -----------------------------------------------------------
  let reportRange = null;
  function defaultWeek() {
    const end = todayISO();
    const d = new Date(); d.setDate(d.getDate() - 6);
    return { start: d.toISOString().slice(0, 10), end };
  }
  function viewReports() {
    if (!reportRange) reportRange = defaultWeek();
    const r = store.rangeReport(reportRange.start, reportRange.end);
    let head = '<div class="page-head"><h1>Reports</h1><span class="sub">aggregate over a date range</span>' +
      '<div class="actions"><button class="btn" data-action="export-report-pdf">Export PDF</button></div></div>';
    const controls = '<div class="card flex gap center wrap" style="margin-bottom:20px">' +
      '<div class="field" style="margin:0"><label>From</label><input type="date" id="rep-start" value="' + esc(reportRange.start) + '"></div>' +
      '<div class="field" style="margin:0"><label>To</label><input type="date" id="rep-end" value="' + esc(reportRange.end) + '"></div>' +
      '<button class="btn primary" data-action="run-report" style="margin-top:18px">Run</button>' +
      '<button class="btn ghost" data-action="report-this-week" style="margin-top:18px">This week</button></div>';
    const strip = '<div class="totals-strip">' +
      totbox('Days', r.dayCount, '') +
      totbox('Scratch sales', money(r.scratchSales), 'green') +
      totbox('Register cash', money(r.register), 'green') +
      totbox('Sold-out packs', r.soldOutPackCount, '') +
      totbox('Sold-out value', money(r.soldOutPackValue), '') +
      totbox('Full-pack sales', money(r.fullPackAmount), '') + '</div>';
    const breakdown = '<div class="card">' +
      '<div class="kv"><span class="k">Total scratch sales</span><span class="v">' + money(r.scratchSales) + '</span></div>' +
      '<div class="kv"><span class="k">Online sales</span><span class="v">' + money(r.online) + '</span></div>' +
      '<div class="kv"><span class="k">Online cashes paid</span><span class="v">' + money(r.onlineCash) + '</span></div>' +
      '<div class="kv"><span class="k">Scratch cashes paid</span><span class="v">' + money(r.scratchCash) + '</span></div>' +
      '<div class="kv total"><span class="k">Register cash collected</span><span class="v">' + money(r.register) + '</span></div></div>';
    return head + controls + strip + breakdown;
  }
  function totbox(label, n, kind) {
    return '<div class="totbox ' + (kind || '') + '"><div class="n">' + esc(n) + '</div><div class="l">' + esc(label) + '</div></div>';
  }

  // ---- PDF export (via the browser's print -> "Save as PDF") --------------
  const PRINT_CSS =
    'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:32px;font-size:13px}' +
    'h1{font-size:20px;margin:0 0 2px}.meta{color:#666;margin-bottom:18px;font-size:12px}' +
    'table{width:100%;border-collapse:collapse;margin:10px 0 18px}' +
    'th,td{border-bottom:1px solid #ddd;padding:7px 9px;text-align:left}' +
    'th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#666}' +
    '.num{text-align:right;font-variant-numeric:tabular-nums}' +
    '.tot{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}' +
    '.tot.grand{font-weight:700;font-size:16px;border-bottom:none;border-top:2px solid #111;margin-top:6px;padding-top:10px}' +
    '.foot{margin-top:24px;color:#999;font-size:11px}@media print{body{margin:14px}}';
  function printReport(title, inner) {
    const w = window.open('', '_blank');
    if (!w) { toast('Popup blocked', 'Allow popups for this site to export PDF', 'warn'); return; }
    const store_ = store.getState().settings.storeName || 'Lottery POS';
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) +
      '</title><style>' + PRINT_CSS + '</style></head><body>' + inner +
      '<div class="foot">' + esc(store_) + ' · generated ' + esc(nowLocal().replace('T', ' ')) +
      ' · use your browser\'s "Save as PDF"</div></body></html>');
    w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 350);
  }
  function exportDayPDF(dayId) {
    const d = store.getDay(dayId); if (!d) return;
    const c = d.computed || engine.computeDay(d);
    let rows = '';
    store.listBins().forEach((bin) => {
      const bd = d.bins[bin.id]; if (!bd) return;
      bd.segments.forEach((seg, si) => {
        const sold = engine.segmentTicketsSold(seg);
        rows += '<tr><td>' + esc(bin.name) + (bd.segments.length > 1 ? ' #' + (si + 1) : '') + '</td><td>' + esc(seg.name || seg.gameNumber) +
          '</td><td class="num">' + seg.startIndex + '</td><td class="num">' + (seg.completed ? seg.ticketsPerPack + ' (out)' : seg.endIndex) +
          '</td><td class="num">' + sold + '</td><td class="num">$' + (sold * (seg.price || 0)) + '</td></tr>';
      });
    });
    const inner =
      '<h1>Daily Report — ' + esc(d.date) + '</h1>' +
      '<div class="meta">' + esc(store.getState().settings.storeName || '') + ' · hours ' + esc(dayHours(d)) + ' · ' + (d.state === 'closed' ? 'closed' : 'in-day') + '</div>' +
      '<table><thead><tr><th>Bin</th><th>Game</th><th class="num">Start</th><th class="num">End</th><th class="num">Tickets</th><th class="num">Amount</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="6">No bin activity.</td></tr>') + '</tbody></table>' +
      '<div class="tot"><span>Scratch ticket sales</span><span>' + money(c.scratchTicketAmount) + '</span></div>' +
      (c.fullPackAmount ? '<div class="tot"><span>Full-pack sales</span><span>' + money(c.fullPackAmount) + '</span></div>' : '') +
      '<div class="tot"><span>Online sales</span><span>' + money(c.onlineSales) + '</span></div>' +
      '<div class="tot"><span>Online cashes</span><span>-' + money(c.onlineCashes) + '</span></div>' +
      '<div class="tot"><span>Scratch cashes</span><span>-' + money(c.scratchCashes) + '</span></div>' +
      '<div class="tot grand"><span>Cash in register</span><span>' + money(c.registerCash) + '</span></div>';
    printReport('Daily Report ' + d.date, inner);
  }
  function exportRangePDF() {
    const r = store.rangeReport(reportRange.start, reportRange.end);
    let rows = '';
    r.days.forEach((d) => {
      const c = d.computed || engine.computeDay(d);
      rows += '<tr><td>' + esc(d.date) + '</td><td>' + esc(dayHours(d)) + '</td><td class="num">' + money(c.scratchSales) +
        '</td><td class="num">' + money(c.onlineSales) + '</td><td class="num">' + money(c.registerCash) + '</td></tr>';
    });
    const inner =
      '<h1>Sales Report</h1>' +
      '<div class="meta">' + esc(store.getState().settings.storeName || '') + ' · ' + esc(r.startISO) + ' to ' + esc(r.endISO) + ' · ' + r.dayCount + ' day(s)</div>' +
      '<table><thead><tr><th>Date</th><th>Hours</th><th class="num">Scratch $</th><th class="num">Online $</th><th class="num">Register $</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="5">No closed days in range.</td></tr>') + '</tbody></table>' +
      '<div class="tot"><span>Total scratch sales</span><span>' + money(r.scratchSales) + '</span></div>' +
      '<div class="tot"><span>Online sales</span><span>' + money(r.online) + '</span></div>' +
      '<div class="tot"><span>Online cashes</span><span>-' + money(r.onlineCash) + '</span></div>' +
      '<div class="tot"><span>Scratch cashes</span><span>-' + money(r.scratchCash) + '</span></div>' +
      '<div class="tot"><span>Sold-out packs</span><span>' + r.soldOutPackCount + ' (' + money(r.soldOutPackValue) + ')</span></div>' +
      '<div class="tot grand"><span>Register cash collected</span><span>' + money(r.register) + '</span></div>';
    printReport('Sales Report ' + r.startISO + ' to ' + r.endISO, inner);
  }

  // ---- SETTINGS ----------------------------------------------------------
  function viewSettings() {
    const s = store.getState().settings;
    const db = store.gameDb();
    const nums = db.allKnownNumbers();
    let head = '<div class="page-head"><h1>Settings</h1></div>';
    const general = '<div class="card" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Store</div>' +
      '<div class="field"><label>Store name</label><input id="set-store" value="' + esc(s.storeName) + '" placeholder="My Lottery Store"></div>' +
      '<div class="field-row"><div class="field"><label>Barcode game digits</label><input id="set-bw-game" class="mono" value="' + s.barcodeWidths.game + '"></div>' +
        '<div class="field"><label>Pack digits</label><input id="set-bw-pack" class="mono" value="' + s.barcodeWidths.pack + '"></div>' +
        '<div class="field"><label>Index digits</label><input id="set-bw-index" class="mono" value="' + s.barcodeWidths.index + '"></div></div>' +
      '<div class="field"><label>Online game database URL (optional)</label><input id="set-url" value="' + esc(s.remoteGamesUrl) + '" placeholder="https://…/games.json"><div class="hint">A JSON feed of game number → name & price. Leave blank to use the built-in catalog.</div></div>' +
      '<div class="flex gap"><button class="btn primary" data-action="save-settings">Save</button>' +
        (s.remoteGamesUrl ? '<button class="btn" data-action="refresh-games">Refresh from URL</button>' : '') + '</div></div>';

    const shownNums = nums.filter((n) => matchSearch(n) || matchSearch(db.lookup(n).name));
    const gamesRows = shownNums.map((n) => {
      const g = db.lookup(n);
      return '<tr><td class="mono">' + esc(n) + '</td><td>' + esc(g.name) + '</td><td class="num">' + money(g.price) + '</td>' +
        '<td class="num">' + g.ticketsPerPack + '</td>' +
        '<td class="num"><button class="btn sm" data-action="define-game" data-game="' + esc(n) + '">Edit</button></td></tr>';
    }).join('');
    const gamesCard = '<div class="card" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Game database — New Jersey (' + shownNums.length + (searchQuery ? ' of ' + nums.length : '') + ')</div>' +
      '<table class="tbl"><thead><tr><th>Game #</th><th>Name</th><th class="num">Price</th><th class="num">Tickets</th><th></th></tr></thead><tbody>' + gamesRows + '</tbody></table>' +
      '<div style="margin-top:12px"><button class="btn" data-action="define-game">+ Add game</button></div></div>';

    const backup = '<div class="card" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Backup &amp; data</div>' +
      '<p class="muted">Data is stored on this device. Export regularly to keep a safe copy. New here? Load a sample store to explore.</p>' +
      '<div class="flex gap wrap"><button class="btn primary" data-action="load-demo">Load sample data</button>' +
        '<button class="btn" data-action="export-backup">Export backup</button>' +
        '<button class="btn" data-action="import-backup">Import backup</button>' +
        '<button class="btn danger" data-action="reset-all">Reset all data</button></div></div>';

    return head + general + gamesCard + licenseCard() + backup;
  }

  function licenseCard() {
    const L = POS.license ? POS.license.status() : { mode: 'unlicensed', deviceId: '—' };
    const modeChip = {
      active: '<span class="chip green">Active</span>',
      grace: '<span class="chip amber">Active (offline)</span>',
      expired: '<span class="chip red">Expired</span>',
      invalid: '<span class="chip red">Invalid key</span>',
      unverified: '<span class="chip amber">Unverified</span>',
      unlicensed: '<span class="chip gray">Trial / unlicensed</span>',
    }[L.mode] || '';
    const until = L.validUntil ? new Date(L.validUntil).toISOString().slice(0, 10) : '—';
    return '<div class="card" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">License &amp; subscription</div>' +
      '<div class="kv"><span class="k">Status</span><span class="v">' + modeChip + '</span></div>' +
      '<div class="kv"><span class="k">Plan</span><span class="v">' + esc(L.plan || '—') + '</span></div>' +
      '<div class="kv"><span class="k">Valid until</span><span class="v">' + esc(until) + '</span></div>' +
      '<div class="kv"><span class="k">Device ID</span><span class="v mono">' + esc(L.deviceId) + '</span></div>' +
      '<div class="field" style="margin-top:14px"><label>License key</label><input id="lic-key" value="' + esc(L.key || '') + '" placeholder="LP-XXXX-XXXX"></div>' +
      '<div class="field"><label>License server URL</label><input id="lic-url" value="' + esc(L.serverUrl || '') + '" placeholder="https://your-server/validate (leave blank for trial)"><div class="hint">When set, the app verifies the subscription every 15 minutes and locks if it expires or is revoked.</div></div>' +
      '<div class="flex gap wrap"><button class="btn primary" data-action="save-license">Activate / verify</button>' +
        '<button class="btn" data-action="deactivate-license">Clear license</button></div></div>';
  }

  // ===================================================================== //
  //  ACTIONS                                                              //
  // ===================================================================== //
  function onClick(e) {
    const nav = e.target.closest('[data-nav]');
    if (nav) { go(nav.getAttribute('data-nav')); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.getAttribute('data-action');
    const d = el.dataset;
    try { dispatch(a, d, el, e); }
    catch (err) { toast('Error', err.message, 'err'); }
  }

  function dispatch(a, d, el) {
    switch (a) {
      case 'close-modal': return closeModal();
      case 'nav-history': openDayId = null; return go('history');
      case 'scan': return quickScanFlow();
      case 'show-help': return helpFlow();
      case 'show-notifications': return notificationsFlow();
      case 'relink-upc': return linkRetailModal(d.code, false);
      // day lifecycle
      case 'start-day': return startDayFlow();
      case 'end-day': return endDayFlow();
      // bins
      case 'add-bin': return addBinFlow();
      case 'rename-bin': return renameBinFlow(d.bin);
      case 'remove-bin': store.removeBin(d.bin); return toast('Bin removed', '', 'ok');
      case 'activate': return activateFlow(d.bin);
      case 'activate-pack': return activatePackFlow(d.pack);
      case 'move-pack': return movePackFlow(d.bin);
      case 'swap-bin': return swapBinFlow(d.bin);
      case 'update-index': return updateIndexFlow(d.bin);
      case 'reverse-activation': store.reverseActivation(d.pack); return toast('Activation undone', 'Pack returned to inventory', 'ok');
      case 'full-pack-active': return fullPackFlow(d.pack);
      case 'full-pack-inv': return fullPackFlow(d.pack);
      // inventory
      case 'add-inventory': return addInventoryFlow();
      case 'remove-inv': store.removePackFromInventory(d.pack); toast('Moved to Trash', 'Restore it from Trash if needed', 'ok'); return;
      case 'open-trash': return trashFlow();
      case 'restore-trash': store.restoreFromTrash(d.pack); toast('Restored', '', 'ok'); trashFlow(); return;
      case 'delete-forever': store.deletePackForever(d.pack); trashFlow(); return;
      case 'empty-trash': store.emptyTrash(); closeModal(); toast('Trash emptied', '', 'ok'); return;
      case 'define-game': return defineGameFlow(d.game);
      // soldout
      case 'reverse-soldout': store.reverseSoldOut(d.pack); return toast('Reversed', 'Pack restored', 'ok');
      // history
      case 'open-day': openDayId = d.day; return go('day');
      case 'edit-seg': return editSegFlow(d.day, d.bin, +d.seg, d.field, el);
      case 'recompute': store.recomputeAll(); return toast('Recomputed', 'All linked days updated', 'ok');
      // reports
      case 'run-report': reportRange = { start: $('#rep-start').value, end: $('#rep-end').value }; return render();
      case 'report-this-week': reportRange = defaultWeek(); return render();
      case 'export-report-pdf': return exportRangePDF();
      case 'export-day-pdf': return exportDayPDF(d.day);
      // settings
      case 'save-settings': return saveSettings();
      case 'refresh-games': return refreshGames();
      case 'save-license': return saveLicense();
      case 'deactivate-license': POS.license.deactivateLocal(); render(); return toast('License cleared', 'Running in trial mode', 'ok');
      case 'export-backup': store.exportBackup(); return toast('Exported', 'Backup downloaded', 'ok');
      case 'import-backup': return importBackupFlow();
      case 'load-demo': return loadDemoFlow();
      case 'reset-all': return resetFlow();
      default: console.warn('unknown action', a);
    }
  }

  // ---- quick scan --------------------------------------------------------
  function widths() { return store.getState().settings.barcodeWidths; }
  function fullMask() { const w = widths(); return [w.game, w.pack, w.index]; }
  function packMask() { const w = widths(); return [w.game, w.pack]; }
  // Restrict an input to digits (optionally capped) — for index/number fields.
  function onlyDigits(input, maxLen) {
    if (!input) return;
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '');
      if (maxLen) v = v.slice(0, maxLen);
      input.value = v;
    });
  }
  // Restrict to a money amount: digits and a single decimal point.
  function moneyInput(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      let v = input.value.replace(/[^0-9.]/g, '');
      const i = v.indexOf('.');
      if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
      input.value = v;
    });
  }

  async function quickScanFlow() {
    const raw = await POS.scanner.scanOnce({ title: 'Scan ticket', mask: fullMask() });
    if (raw) routeScan(raw);
  }

  // A USB hardware scanner fired from any screen (no camera) -> route it.
  function handleHardwareScan(raw) { routeScan(raw); }

  // For flows that need the long validation barcode (pack/index). Returns the
  // parsed ticket, or null after showing the right message for a retail/junk code.
  function requireTicket(raw) {
    const c = barcode.classify(raw, widths());
    if (c.kind === 'ticket') return c;
    if (c.kind === 'retail') toast('Use the long barcode', 'That is the small retail barcode — scan the long one (with the pack number)', 'warn');
    else toast('Not a valid ticket', c.error || 'Unrecognized barcode', 'err');
    return null;
  }

  // Single entry point for any scanned code: long validation barcode, small
  // retail (UPC) barcode, or junk — each handled with the right feedback.
  function routeScan(raw) {
    const c = barcode.classify(raw, widths());
    if (c.kind === 'ticket') return identify(c);
    if (c.kind === 'retail') return identifyRetail(c.code);
    invalidScanWarn(raw, c.error);
  }

  // Clear warning for a code that isn't a recognizable lottery barcode.
  function invalidScanWarn(raw, msg) {
    toast('Not a valid ticket', msg || 'Unrecognized barcode', 'err');
    openModal({
      title: 'Unrecognized barcode',
      bodyHTML:
        '<div class="warn-banner">This does not look like a valid NJ lottery ticket. ' +
        'It may be the wrong barcode, a damaged scan, or a non-lottery item.</div>' +
        '<div class="kv"><span class="k">Scanned</span><span class="v mono">' + esc(String(raw).slice(0, 40)) + '</span></div>' +
        '<div class="kv"><span class="k">Reason</span><span class="v">' + esc(msg || 'unrecognized') + '</span></div>' +
        '<p class="muted" style="margin-top:12px">Tip: the long barcode (with the pack number, e.g. <span class="mono">01967-012922-003</span>) is the one to scan for inventory and sales.</p>',
      footHTML: '<button class="btn primary" data-action="close-modal">OK</button>',
    });
  }

  // The small retail (UPC) barcode: identifies the game (if linked), but has no
  // pack/ticket number, so it can't be used for inventory/activation.
  function identifyRetail(code) {
    const g = store.resolveRetailCode(code);
    if (g && g._known) {
      openModal({
        title: 'Retail barcode',
        bodyHTML:
          '<div class="kv"><span class="k">Game</span><span class="v">' + esc(g.name) + ' · ' + money(g.price) + '</span></div>' +
          '<div class="kv"><span class="k">Retail code</span><span class="v mono">' + esc(code) + '</span></div>' +
          '<div class="warn-banner amber" style="margin-top:12px">This is the small <b>retail</b> barcode — it identifies the game but not the pack/ticket. ' +
          'To activate a pack or count sales, scan the <b>long</b> barcode.</div>',
        footHTML: '<button class="btn ghost" data-action="relink-upc" data-code="' + esc(code) + '">Re-link game</button>' +
          '<button class="btn primary" data-action="close-modal">OK</button>',
      });
    } else {
      linkRetailModal(code, true);
    }
  }

  // Modal to link/relink a retail barcode to a game.
  function linkRetailModal(code, unknown) {
    const cur = store.resolveRetailCode(code);
    const games = store.gameDb().allKnownNumbers().map((n) => {
      const gg = store.lookupGame(n);
      const sel = cur && cur.gameNumber === n ? ' selected' : '';
      return '<option value="' + n + '"' + sel + '>' + esc(gg.name) + ' (' + esc(n) + ', ' + money(gg.price) + ')</option>';
    }).join('');
    openModal({
      title: unknown ? 'Unrecognized retail barcode' : 'Re-link retail barcode',
      bodyHTML:
        (unknown ? '<div class="warn-banner">This retail barcode isn\'t linked to a game. If it\'s a real lottery ticket, link it once and future scans will resolve automatically. Otherwise it may not be a lottery item.</div>' : '') +
        '<div class="kv"><span class="k">Retail code</span><span class="v mono">' + esc(code) + '</span></div>' +
        '<div class="field" style="margin-top:14px"><label>Link to game</label><select id="lk-game">' + games + '</select></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">' + (unknown ? 'Not a ticket' : 'Cancel') + '</button>' +
        '<button class="btn primary" id="lk-save">Link to game</button>',
      onMount: (root) => {
        root.querySelector('#lk-save').onclick = () => {
          store.linkRetailCode(code, root.querySelector('#lk-game').value);
          closeModal(); toast('Linked', 'Retail barcode now resolves to that game', 'ok');
        };
      },
    });
  }

  function helpFlow() {
    openModal({
      title: 'Quick guide',
      bodyHTML:
        '<div class="list">' +
        helpRow('Scan', 'The gold Scan button (and every scan field) opens the camera QR / barcode scanner. No camera? Type or use a USB scanner.') +
        helpRow('Start Day', 'Copies yesterday\'s ending indexes to today\'s start automatically.') +
        helpRow('Sell &amp; replace', 'When a pack runs out, hit New pack on the bin and scan the replacement — the old one is marked sold out.') +
        helpRow('End Day', 'Scan each bin, enter the three figures from the lottery report, and see the register cash.') +
        helpRow('History', 'Edit any past index — totals cascade into later days.') +
        '</div>',
      footHTML: '<button class="btn primary" data-action="close-modal">Got it</button>',
    });
  }
  function helpRow(t, s) {
    return '<div class="list-item"><div class="grow"><div class="title">' + t + '</div><div class="sub">' + s + '</div></div></div>';
  }

  function identify(parsed) {
    const g = store.lookupGame(parsed.gameNumber);
    const pack = store.findPackByKey(parsed.packKey);
    const gameLine = g ? esc(g.name) + ' · ' + money(g.price) : '<span class="chip amber">unknown game ' + esc(parsed.gameNumber) + '</span>';
    let actions = '', body = '';
    body = '<div class="kv"><span class="k">Game</span><span class="v">' + gameLine + '</span></div>' +
      '<div class="kv"><span class="k">Pack #</span><span class="v mono">' + esc(parsed.packNumber) + '</span></div>' +
      '<div class="kv"><span class="k">Scanned index</span><span class="v mono">' + parsed.index + '</span></div>';

    if (!pack) {
      if (g && g._known) {
        actions = '<button class="btn primary" data-action="qs-add-inv" data-game="' + esc(parsed.gameNumber) + '" data-pack="' + esc(parsed.packNumber) + '">Add to inventory</button>';
        body += '<p class="muted">Not in the system yet.</p>';
      } else {
        // parsed as a ticket, but the game number isn't in the NJ catalog
        body = '<div class="warn-banner amber">Game <b>' + esc(parsed.gameNumber) + '</b> isn\'t in the New Jersey catalog. If this is a real ticket, add the game; if not, it may be the wrong barcode or a non-NJ / invalid ticket.</div>' + body;
        actions = '<button class="btn primary" data-action="define-game" data-game="' + esc(parsed.gameNumber) + '">Add this game</button>';
      }
    } else if (pack.status === 'active') {
      const bin = store.getBin(pack.binId);
      body += '<div class="kv"><span class="k">Status</span><span class="v"><span class="chip green">active in ' + esc(bin ? bin.name : '?') + '</span></span></div>';
      if (store.isInDay()) actions += '<button class="btn primary" data-action="qs-set-index" data-bin="' + pack.binId + '" data-idx="' + parsed.index + '">Set index to ' + parsed.index + '</button>';
      actions += '<button class="btn" data-action="full-pack-active" data-pack="' + pack.id + '">Sold-out (full)</button>';
    } else if (pack.status === 'inventory') {
      body += '<div class="kv"><span class="k">Status</span><span class="v"><span class="chip gray">in inventory</span></span></div>';
      actions += '<button class="btn primary" data-action="activate-pack" data-pack="' + pack.id + '">Activate → bin</button>';
      actions += '<button class="btn" data-action="full-pack-inv" data-pack="' + pack.id + '">Sell full pack</button>';
    } else if (pack.status === 'trash') {
      body += '<div class="kv"><span class="k">Status</span><span class="v"><span class="chip gray">in trash</span></span></div>';
      actions += '<button class="btn primary" data-action="restore-trash" data-pack="' + pack.id + '">Restore to inventory</button>';
    } else {
      body += '<div class="kv"><span class="k">Status</span><span class="v"><span class="chip red">sold out</span></span></div>';
      actions += '<button class="btn primary" data-action="reverse-soldout" data-pack="' + pack.id + '">Reverse sold-out</button>';
    }
    openModal({
      title: 'Scanned ticket',
      bodyHTML: body,
      footHTML: actions + '<button class="btn ghost" data-action="close-modal">Close</button>',
    });
    // intercept qs-* actions that need parsed context
    wireQs(parsed);
  }
  function wireQs(parsed) {
    const root = modalMount; if (!root) return;
    const add = root.querySelector('[data-action="qs-add-inv"]');
    if (add) add.onclick = () => {
      const res = store.addToInventory(parsed);
      if (!res.ok) toast('Not added', res.error, 'warn');
      else toast('Added to inventory', parsed.packKey, 'ok');
      closeModal();
    };
    const setIdx = root.querySelector('[data-action="qs-set-index"]');
    if (setIdx) setIdx.onclick = () => {
      store.recordEndScan(setIdx.dataset.bin, +setIdx.dataset.idx);
      toast('Index updated', 'Set to ' + setIdx.dataset.idx, 'ok');
      closeModal();
    };
  }

  // ---- bin flows ---------------------------------------------------------
  function addBinFlow() {
    openModal({
      title: 'Add bin',
      bodyHTML: '<div class="field"><label>Bin name / number</label><input id="bin-name" value="Bin ' + (store.listBins().length + 1) + '"></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="bin-save">Add bin</button>',
      onMount: (root) => {
        const inp = root.querySelector('#bin-name'); inp.focus(); inp.select();
        root.querySelector('#bin-save').onclick = () => { store.addBin(inp.value.trim() || undefined); closeModal(); toast('Bin added', '', 'ok'); };
      },
    });
  }
  function renameBinFlow(binId) {
    const b = store.getBin(binId);
    openModal({
      title: 'Rename bin',
      bodyHTML: '<div class="field"><label>Name</label><input id="bin-name" value="' + esc(b.name) + '"></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="bin-save">Save</button>',
      onMount: (root) => {
        const inp = root.querySelector('#bin-name'); inp.focus(); inp.select();
        root.querySelector('#bin-save').onclick = () => { store.renameBin(binId, inp.value.trim() || b.name); closeModal(); };
      },
    });
  }

  // Activate INTO a specific bin (scan or pick from inventory)
  function activateFlow(binId) {
    const bin = store.getBin(binId);
    const inv = store.listInventory().filter((p) => p.knownGame);
    const options = inv.map((p) => '<option value="' + p.id + '">' + esc(p.name) + ' — pack ' + esc(p.packNumber) + '</option>').join('');
    openModal({
      title: 'Activate pack into ' + esc(bin.name),
      bodyHTML:
        '<button class="btn primary block lg" id="act-scanbtn">' + ICON.cam + ' Scan new pack</button>' +
        '<div id="act-ready" class="muted" style="margin:12px 0 4px">Scan a pack — new packs are added to inventory automatically.</div>' +
        (options ? '<div class="field" style="margin-top:14px"><label>Or pick from inventory</label><select id="act-pick"><option value="">— choose —</option>' + options + '</select></div>' : '') +
        '<div class="field"><label>Starting index (tickets already sold)</label><input id="act-start" class="mono" value="0"></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="act-go">Activate</button>',
      onMount: (root) => {
        const startInp = root.querySelector('#act-start');
        const readyEl = root.querySelector('#act-ready');
        let scannedPackId = null;
        root.querySelector('#act-scanbtn').onclick = async () => {
          const raw = await POS.scanner.scanOnce({ title: 'Scan new pack', mask: fullMask() });
          if (!raw) return;
          const parsed = requireTicket(raw);
          if (!parsed) return;
          const g = store.lookupGame(parsed.gameNumber);
          if (!g || !g._known) { closeModal(); return defineGameFlow(parsed.gameNumber); }
          let pack = store.findPackByKey(parsed.packKey);
          if (!pack || pack.status === 'soldout') {
            const res = store.addToInventory(parsed);
            if (!res.ok) return toast('Cannot use pack', res.error, 'warn');
            pack = res.pack;
          }
          if (pack.status === 'active') return toast('Already active', 'That pack is already in a bin', 'warn');
          scannedPackId = pack.id;
          startInp.value = String(parsed.index || 0);
          readyEl.innerHTML = '<span class="chip green">Ready: ' + esc(g.name) + ' · pack ' + esc(parsed.packNumber) + '</span>';
          const pick = root.querySelector('#act-pick'); if (pick) pick.value = '';
        };
        root.querySelector('#act-go').onclick = () => {
          let packId = scannedPackId;
          const pick = root.querySelector('#act-pick');
          if (!packId && pick && pick.value) packId = pick.value;
          if (!packId) return toast('No pack', 'Scan or choose a pack first', 'warn');
          store.activatePack(packId, binId, parseInt(startInp.value, 10) || 0);
          closeModal(); toast('Activated', 'Pack is now selling in ' + bin.name, 'ok');
        };
      },
    });
  }

  // Activate a specific inventory pack -> choose destination bin
  function activatePackFlow(packId) {
    const pack = store.getPack(packId);
    if (!pack) return;
    const empties = store.listBins().filter((b) => store.isBinEmpty(b.id));
    const bins = store.listBins();
    const opts = bins.map((b) => '<option value="' + b.id + '">' + esc(b.name) + (store.isBinEmpty(b.id) ? '' : ' (will replace current pack)') + '</option>').join('');
    if (!bins.length) return toast('No bins', 'Add a bin first', 'warn');
    openModal({
      title: 'Activate ' + esc(pack.name),
      bodyHTML:
        '<div class="field"><label>Destination bin</label><select id="act-bin">' + opts + '</select></div>' +
        '<div class="field"><label>Starting index</label><input id="act-start" class="mono" value="0"></div>' +
        (empties.length ? '' : '<p class="muted">All bins are full — activating will mark the replaced pack as sold out.</p>'),
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="act-go">Activate</button>',
      onMount: (root) => {
        root.querySelector('#act-go').onclick = () => {
          store.activatePack(packId, root.querySelector('#act-bin').value, parseInt(root.querySelector('#act-start').value, 10) || 0);
          closeModal(); toast('Activated', '', 'ok');
        };
      },
    });
  }

  function movePackFlow(fromBinId) {
    const empties = store.listBins().filter((b) => b.id !== fromBinId && store.isBinEmpty(b.id));
    if (!empties.length) return toast('No empty bins', 'Need an empty bin to move into', 'warn');
    const opts = empties.map((b) => '<option value="' + b.id + '">' + esc(b.name) + '</option>').join('');
    openModal({
      title: 'Move pack',
      bodyHTML: '<div class="field"><label>Move to empty bin</label><select id="mv-to">' + opts + '</select></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="mv-go">Move</button>',
      onMount: (root) => {
        root.querySelector('#mv-go').onclick = () => { store.movePack(fromBinId, root.querySelector('#mv-to').value); closeModal(); toast('Moved', '', 'ok'); };
      },
    });
  }

  // Swap the entire contents of two bins (tickets of A and B exchange places).
  function swapBinFlow(fromBinId) {
    const from = store.getBin(fromBinId);
    const others = store.listBins().filter((b) => b.id !== fromBinId);
    if (!others.length) return toast('Need two bins', 'Add another bin first', 'warn');
    const opts = others.map((b) => {
      const p = store.activePackInBin(b.id);
      return '<option value="' + b.id + '">' + esc(b.name) + (p ? ' — ' + esc(p.name) : ' (empty)') + '</option>';
    }).join('');
    const fp = store.activePackInBin(fromBinId);
    openModal({
      title: 'Swap ' + esc(from.name),
      bodyHTML:
        '<p class="muted">Exchanges the entire contents of two bins — ' + esc(from.name) +
          (fp ? ' (' + esc(fp.name) + ')' : ' (empty)') + ' and the bin you pick below trade places.</p>' +
        '<div class="field"><label>Swap with</label><select id="sw-to">' + opts + '</select></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="sw-go">Swap bins</button>',
      onMount: (root) => {
        root.querySelector('#sw-go').onclick = () => {
          store.swapBins(fromBinId, root.querySelector('#sw-to').value);
          closeModal(); toast('Swapped', 'Bin contents exchanged', 'ok');
        };
      },
    });
  }

  function trashFlow() {
    const items = store.listTrash().slice().reverse();
    const body = items.length
      ? '<div class="list">' + items.map((p) =>
          '<div class="list-item"><div class="grow"><div class="title">' + esc(p.name) +
            ' <span class="muted mono">' + esc(p.packKey) + '</span></div>' +
            '<div class="sub">deleted ' + esc((p.trashedAt || '').slice(0, 10)) + '</div></div>' +
          '<button class="btn sm" data-action="restore-trash" data-pack="' + p.id + '">Restore</button>' +
          '<button class="btn danger sm" data-action="delete-forever" data-pack="' + p.id + '">Delete forever</button>' +
          '</div>').join('') + '</div>'
      : '<div class="empty-state" style="padding:30px"><div class="big">' + ICON.box + '</div><h3>Trash is empty</h3><p>Removed inventory packs land here so a misclick is recoverable.</p></div>';
    openModal({
      title: 'Trash',
      bodyHTML: body,
      footHTML: (items.length ? '<button class="btn danger" data-action="empty-trash">Empty trash</button>' : '') +
        '<button class="btn primary" data-action="close-modal">Done</button>',
    });
  }

  function updateIndexFlow(binId) {
    const pack = store.activePackInBin(binId);
    if (!pack) return;
    openModal({
      title: 'Update index — ' + esc(store.getBin(binId).name),
      bodyHTML:
        '<button class="btn primary block lg" id="ui-scanbtn">' + ICON.cam + ' Scan this bin\'s ticket</button>' +
        '<div class="field" style="margin-top:16px"><label>Current index (0–' + (pack.ticketsPerPack - 1) + ')</label><input id="ui-idx" class="mono" value="' + (pack.currentIndex || 0) + '"></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="ui-go">Save</button>',
      onMount: (root) => {
        const idx = root.querySelector('#ui-idx');
        onlyDigits(idx, 3);
        root.querySelector('#ui-scanbtn').onclick = async () => {
          const raw = await POS.scanner.scanOnce({ title: 'Scan ticket', mask: fullMask() });
          if (!raw) return;
          const parsed = requireTicket(raw);
          if (!parsed) return;
          if (parsed.packKey !== pack.packKey) return toast('Different pack', 'That ticket is not this bin\'s pack', 'warn');
          idx.value = String(parsed.index);
        };
        root.querySelector('#ui-go').onclick = () => { store.recordEndScan(binId, parseInt(idx.value, 10) || 0); closeModal(); toast('Index updated', '', 'ok'); };
      },
    });
  }

  function fullPackFlow(packId) {
    const pack = store.getPack(packId);
    if (!pack) return;
    const remaining = (pack.ticketsPerPack || 0) - (pack.currentIndex || 0);
    const value = remaining * (pack.price || 0);
    if (!store.isInDay()) toast('Heads up', 'No day is open — start a day to count this in today\'s totals', 'warn');
    openModal({
      title: 'Sell full pack',
      bodyHTML: '<p>Mark <b>' + esc(pack.name) + '</b> (pack ' + esc(pack.packNumber) + ') as a full-pack sale?</p>' +
        '<div class="kv"><span class="k">Remaining tickets</span><span class="v">' + remaining + '</span></div>' +
        '<div class="kv"><span class="k">Value added to today</span><span class="v">' + money(value) + '</span></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn green" id="fp-go">Confirm sale</button>',
      onMount: (root) => {
        root.querySelector('#fp-go').onclick = () => { store.sellFullPack(packId); closeModal(); toast('Full pack sold', money(value) + ' added to today', 'ok'); };
      },
    });
  }

  // ---- inventory flows ---------------------------------------------------
  function addInventoryFlow() {
    // Camera scanner stays open; each scanned pack is added & logged in-place.
    POS.scanner.openContinuous({
      title: 'Add delivery — scan each pack',
      hint: 'or type game-pack, then Enter',
      mask: packMask(), // game + pack only; no ticket index needed for inventory
      onResult: (raw) => {
        const c = barcode.classify(raw, widths());
        if (c.kind === 'retail') return { kind: 'warn', title: 'Retail barcode', msg: 'Scan the long barcode (with the pack number)' };
        if (c.kind !== 'ticket') return { kind: 'err', title: 'Not a valid ticket', msg: c.error || 'Unrecognized' };
        const parsed = barcode.parsePack(raw, widths());
        const g = store.lookupGame(parsed.gameNumber);
        const res = store.addToInventory(parsed);
        if (!res.ok) return { kind: 'warn', title: 'Duplicate skipped', msg: parsed.packKey };
        return {
          kind: 'ok',
          title: g && g._known ? g.name : 'Unknown game ' + parsed.gameNumber,
          msg: 'pack ' + parsed.packNumber + (g && g._known ? '' : ' — define it in Settings'),
        };
      },
    });
  }

  function defineGameFlow(gameNumber) {
    const db = store.gameDb();
    const existing = gameNumber ? db.lookup(gameNumber) : null;
    openModal({
      title: existing && existing._known ? 'Edit game' : 'Define game',
      bodyHTML:
        '<div class="field"><label>Game number (5 digits)</label><input id="g-num" class="mono" value="' + esc(gameNumber || '') + '" ' + (gameNumber ? 'readonly' : '') + ' placeholder="01975"></div>' +
        '<div class="field"><label>Game name</label><input id="g-name" value="' + esc(existing ? existing.name : '') + '" placeholder="500X The Cash"></div>' +
        '<div class="field"><label>Ticket price</label><select id="g-price">' +
          [1, 2, 3, 5, 10, 20, 25, 30, 40].map((p) => '<option value="' + p + '" ' + (existing && existing.price === p ? 'selected' : '') + '>' + money(p) + ' (' + engine.ticketsPerPack(p) + ' tickets/pack)</option>').join('') +
        '</select></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="g-go">Save game</button>',
      onMount: (root) => {
        onlyDigits(root.querySelector('#g-num'), widths().game);
        root.querySelector('#g-go').onclick = () => {
          const num = root.querySelector('#g-num').value.trim();
          const name = root.querySelector('#g-name').value.trim();
          const price = parseInt(root.querySelector('#g-price').value, 10);
          if (!num || !name) return toast('Missing info', 'Enter a game number and name', 'warn');
          store.upsertGame(num, { name, price });
          closeModal(); toast('Game saved', name, 'ok');
        };
      },
    });
  }

  // ---- history edit ------------------------------------------------------
  function editSegFlow(dayId, binId, segIndex, field, el) {
    const cur = el.textContent.replace(/\D.*$/, '').trim();
    openModal({
      title: 'Edit ' + (field === 'startIndex' ? 'start' : 'end') + ' index',
      bodyHTML: '<div class="field"><label>New value</label><input id="seg-val" class="mono" value="' + esc(cur) + '"></div>' +
        '<p class="muted">This recalculates the day and cascades the change into later days where the same pack continues.</p>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="seg-go">Save</button>',
      onMount: (root) => {
        const inp = root.querySelector('#seg-val'); onlyDigits(inp, 3); inp.focus(); inp.select();
        root.querySelector('#seg-go').onclick = () => {
          const patch = {}; patch[field] = parseInt(inp.value, 10) || 0;
          store.editSegment(dayId, binId, segIndex, patch);
          closeModal(); toast('Saved', 'Totals recalculated', 'ok');
        };
      },
    });
  }

  // ---- day lifecycle flows ----------------------------------------------
  function startDayFlow() {
    if (store.isInDay()) return;
    const bins = store.listBins();
    const active = store.listActive();
    if (!bins.length) {
      return openModal({
        title: 'First-time setup',
        bodyHTML: '<p>Before starting a day, set up your bins:</p><ol class="muted" style="line-height:1.9">' +
          '<li>Add a bin for each dispenser slot.</li><li>Activate a pack into each bin (scan it & set its current index).</li><li>Then start the day.</li></ol>',
        footHTML: '<button class="btn primary" data-action="add-bin">Add a bin</button>',
      });
    }
    const last = store.lastClosedDay();
    openModal({
      title: 'Start day',
      bodyHTML:
        '<div class="field"><label>Date &amp; time</label><input type="datetime-local" id="sd-date" value="' + nowLocal() + '"></div>' +
        '<p class="muted">' + (last ? 'Carrying over ending indexes from <b>' + esc(last.date) + '</b>. ' : '') +
          active.length + ' active pack' + (active.length === 1 ? '' : 's') + ' across ' + bins.length + ' bin' + (bins.length === 1 ? '' : 's') + '.</p>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn green" id="sd-go">Start day</button>',
      onMount: (root) => {
        root.querySelector('#sd-go').onclick = () => {
          store.startDay(root.querySelector('#sd-date').value || nowLocal());
          closeModal(); toast('Day started', 'Sell away — scan bins at end of day', 'ok'); go('bins');
        };
      },
    });
  }

  function endDayFlow() {
    const day = store.currentDay();
    if (!day) return;
    const bins = store.listBins().filter((b) => day.bins[b.id]);
    const binRows = bins.map((b) => {
      const segs = day.bins[b.id].segments;
      const open = segs[segs.length - 1];
      return '<div class="field"><label>' + esc(b.name) + ' — ' + esc(open.name || open.gameNumber) +
        ' <span class="muted">(start ' + open.startIndex + ', max ' + (open.ticketsPerPack - 1) + ')</span></label>' +
        '<input class="mono ed-end" data-bin="' + b.id + '" value="' + open.endIndex + '" placeholder="end index"></div>';
    }).join('');
    openModal({
      title: 'End day — ' + esc(day.date),
      wide: true,
      bodyHTML:
        '<div class="section-title" style="margin-top:0">1 · Scan each bin\'s ending ticket</div>' +
        '<button class="btn primary block" id="ed-scanbtn">' + ICON.cam + ' Scan bins (camera)</button>' +
        '<p class="muted" style="margin:10px 0 14px">Scan each bin\'s top ticket — the matching row fills in automatically. Or type the end index below.</p>' +
        (binRows || '<p class="muted">No active packs to scan.</p>') +
        '<div class="section-title">2 · Daily lottery report figures</div>' +
        '<div class="field-row">' +
          '<div class="field"><label>Online sales</label><input id="ed-os" class="mono" value="' + (day.report.onlineSales || 0) + '"></div>' +
          '<div class="field"><label>Online cashes</label><input id="ed-oc" class="mono" value="' + (day.report.onlineCashes || 0) + '"></div>' +
          '<div class="field"><label>Scratch cashes</label><input id="ed-sc" class="mono" value="' + (day.report.scratchCashes || 0) + '"></div>' +
        '</div>' +
        '<div class="section-title">3 · Register</div>' +
        '<div id="ed-preview" class="card"></div>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn green lg" id="ed-go">Close day</button>',
      onMount: (root) => {
        root.querySelectorAll('.ed-end').forEach((inp) => onlyDigits(inp, 3));
        ['#ed-os', '#ed-oc', '#ed-sc'].forEach((s) => moneyInput(root.querySelector(s)));
        const recompute = () => {
          // write end indexes into the live day for preview
          root.querySelectorAll('.ed-end').forEach((inp) => {
            try { store.recordEndScan(inp.dataset.bin, parseInt(inp.value, 10) || 0); } catch (e) { /* ignore preview errors */ }
          });
          const c = store.setReport({
            onlineSales: root.querySelector('#ed-os').value,
            onlineCashes: root.querySelector('#ed-oc').value,
            scratchCashes: root.querySelector('#ed-sc').value,
          });
          root.querySelector('#ed-preview').innerHTML =
            '<div class="kv"><span class="k">Total scratch sales</span><span class="v">' + money(c.scratchSales) + '</span></div>' +
            '<div class="kv"><span class="k">+ Online sales</span><span class="v">' + money(c.onlineSales) + '</span></div>' +
            '<div class="kv"><span class="k">− Online cashes</span><span class="v">' + money(c.onlineCashes) + '</span></div>' +
            '<div class="kv"><span class="k">− Scratch cashes</span><span class="v">' + money(c.scratchCashes) + '</span></div>' +
            '<div class="kv total ' + (c.registerCash < 0 ? 'negative' : '') + '"><span class="k">Cash in register</span><span class="v">' + money(c.registerCash) + '</span></div>';
        };
        root.querySelector('#ed-scanbtn').onclick = () => {
          POS.scanner.openContinuous({
            title: 'Scan bins',
            mask: fullMask(),
            onResult: (raw) => {
              const c2 = barcode.classify(raw, widths());
              if (c2.kind === 'retail') return { kind: 'warn', title: 'Retail barcode', msg: 'Scan the long barcode' };
              if (c2.kind !== 'ticket') return { kind: 'err', title: 'Not a valid ticket', msg: c2.error || 'Unrecognized' };
              const parsed = c2;
              let matched = null, binName = '';
              root.querySelectorAll('.ed-end').forEach((inp) => {
                const segs = day.bins[inp.dataset.bin].segments;
                if (segs[segs.length - 1].packKey === parsed.packKey) {
                  matched = inp; const b = store.getBin(inp.dataset.bin); binName = b ? b.name : '';
                }
              });
              if (!matched) return { kind: 'warn', title: 'No match', msg: 'Not an active bin pack' };
              matched.value = String(parsed.index);
              recompute();
              return { kind: 'ok', title: binName, msg: 'end index ' + parsed.index };
            },
          });
        };
        root.querySelectorAll('.ed-end, #ed-os, #ed-oc, #ed-sc').forEach((inp) => inp.addEventListener('input', recompute));
        recompute();
        root.querySelector('#ed-go').onclick = () => {
          recompute();
          const c = store.endDay();
          closeModal();
          toast('Day closed', 'Register cash: ' + money(c.registerCash), 'ok');
          go('history');
        };
      },
    });
  }

  // ---- settings flows ----------------------------------------------------
  function saveSettings() {
    store.setSettings({
      storeName: $('#set-store').value.trim(),
      barcodeWidths: {
        game: parseInt($('#set-bw-game').value, 10) || 5,
        pack: parseInt($('#set-bw-pack').value, 10) || 7,
        index: parseInt($('#set-bw-index').value, 10) || 3,
      },
      remoteGamesUrl: $('#set-url').value.trim(),
    });
    toast('Settings saved', '', 'ok');
  }
  function refreshGames() {
    const url = store.getState().settings.remoteGamesUrl;
    POS.games.fetchCatalog(url).then((cat) => {
      if (cat) { store.setCatalog(cat); toast('Catalog updated', Object.keys(cat.games).length + ' games', 'ok'); }
      else toast('Refresh failed', 'Could not load that URL', 'err');
    });
  }
  function saveLicense() {
    POS.license.setConfig($('#lic-url').value, $('#lic-key').value);
    POS.license.check().then((r) => {
      render();
      if (!r.serverUrl) toast('Trial mode', 'No server set — enforcement off', 'ok');
      else if (r.locked) toast('Not verified', r.lastError || 'Key/server rejected', 'err');
      else toast('Verified', 'Subscription active', 'ok');
    });
  }
  function importBackupFlow() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      if (!inp.files[0]) return;
      store.importBackup(inp.files[0]).then(() => toast('Imported', 'Backup restored', 'ok')).catch((e) => toast('Import failed', e.message, 'err'));
    };
    inp.click();
  }
  function resetFlow() {
    openModal({
      title: 'Reset all data?',
      bodyHTML: '<p>This permanently deletes all bins, packs, inventory and day history on this device. Export a backup first if you might need it.</p>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger" id="rs-go">Delete everything</button>',
      onMount: (root) => { root.querySelector('#rs-go').onclick = () => { store.resetAll(); closeModal(); go('bins'); toast('Reset', 'All data cleared', 'ok'); }; },
    });
  }

  function loadDemoFlow() {
    openModal({
      title: 'Load sample data?',
      bodyHTML: '<p>This replaces everything on this device with a sample store (4 bins, active packs, one closed day, and some inventory) so you can explore the app quickly.</p>',
      footHTML: '<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" id="dm-go">Load sample</button>',
      onMount: (root) => { root.querySelector('#dm-go').onclick = () => { seedDemoData(); closeModal(); go('bins'); toast('Sample loaded', 'Explore away — Reset all data to clear it', 'ok'); }; },
    });
  }

  // Builds a realistic sample store (used by the "Load sample data" button).
  function seedDemoData() {
    const P = POS.barcode;
    store.resetAll();
    store.setSettings({ storeName: 'Maple Street Mart' });
    const b1 = store.addBin('Bin 1'), b2 = store.addBin('Bin 2'), b3 = store.addBin('Bin 3');
    store.addBin('Bin 4');
    store.activatePack(store.addToInventory(P.parse('01960-1000001-000')).pack.id, b1.id, 0); // 100X $20
    store.activatePack(store.addToInventory(P.parse('01967-2000001-000')).pack.id, b2.id, 0); // Goooalll $5
    store.activatePack(store.addToInventory(P.parse('01902-3000001-000')).pack.id, b3.id, 0); // Super Hot 7's $10
    // a closed day for history/reports
    store.startDay('2026-06-18');
    store.recordEndScan(b1.id, 4); store.recordEndScan(b2.id, 30); store.recordEndScan(b3.id, 9);
    store.setReport({ onlineSales: 300, onlineCashes: 120, scratchCashes: 150 });
    store.endDay();
    // today, open, with sales in progress
    store.startDay('2026-06-19');
    store.recordEndScan(b1.id, 6); store.recordEndScan(b2.id, 41); store.recordEndScan(b3.id, 12);
    // some inventory waiting to be activated
    store.addToInventory(P.parse('01862-4000001-000')); // Crossword $3
    store.addToInventory(P.parse('01941-5000001-000')); // Jackpot Millions $30
  }

  // ---- go --------------------------------------------------------------
  let booted = false;
  function bootOnce() { if (booted) return; booted = true; boot(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootOnce);
  else bootOnce();
})();

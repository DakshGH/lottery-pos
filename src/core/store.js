/*
 * store.js — application state + all business actions.
 *
 * Holds bins, packs (inventory / active / sold-out archive), day records, and
 * settings. Exposes intention-revealing actions used by the UI, persists after
 * every change, and notifies subscribers to re-render.
 *
 * Depends on window.POS.{engine, games, storage, barcode}.
 * Browser global: window.POS.store (a factory `createStore()`).
 */
(function (root) {
  'use strict';
  const P = (root.POS = root.POS || {});
  const engine = P.engine;
  const gamesLib = P.games;
  const storage = P.storage;
  const barcode = P.barcode;

  const STATE_VERSION = 1;

  function uid(prefix) {
    return (
      (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    );
  }
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  // Local "YYYY-MM-DDTHH:MM" (not UTC) so dates/times match the clerk's clock.
  function nowLocalISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  function defaultState(seedCatalog) {
    return {
      version: STATE_VERSION,
      settings: {
        storeName: '',
        barcodeWidths: Object.assign({}, barcode.DEFAULT_WIDTHS),
        remoteGamesUrl: '',
        currency: 'USD',
      },
      catalog: seedCatalog || { games: {} },
      gameOverrides: {},
      bins: [], // [{id,name}]
      packs: {}, // id -> pack
      days: [], // ordered oldest -> newest
      currentDayId: null,
    };
  }

  function createStore(seedCatalog) {
    let state = storage.load();
    if (!state) state = defaultState(seedCatalog);
    // The bundled catalog is the source of truth (the "online DB"); user edits
    // live in gameOverrides. Adopt the newest bundled seed on boot so existing
    // installs pick up catalog updates. A remote URL (fetched after boot) wins.
    if (seedCatalog && (seedCatalog.version || 0) >= ((state.catalog && state.catalog.version) || 0)) {
      state.catalog = seedCatalog;
    } else if (!state.catalog || !state.catalog.games || !Object.keys(state.catalog.games).length) {
      state.catalog = seedCatalog || { games: {} };
    }
    // Migration: early builds defaulted the pack field to 7 digits, but real NJ
    // packs are 6 (game5 + pack6 + index3 = 14). Correct old installs in place.
    const bw = state.settings && state.settings.barcodeWidths;
    if (bw && bw.game === 5 && bw.pack === 7 && bw.index === 3) {
      bw.pack = 6;
      storage.save(state);
    }

    const subscribers = new Set();
    function subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
    function emit() {
      for (const fn of subscribers) fn(state);
    }
    function persist() {
      storage.save(state);
      emit();
    }

    // ---- game db ---------------------------------------------------------
    function gameDb() {
      return gamesLib.create(state.catalog, state.gameOverrides);
    }
    function lookupGame(gameNumber) {
      return gameDb().lookup(gameNumber);
    }

    // ---- bins ------------------------------------------------------------
    function listBins() {
      return state.bins.slice();
    }
    function getBin(binId) {
      return state.bins.find((b) => b.id === binId) || null;
    }
    function addBin(name) {
      const bin = { id: uid('bin'), name: name || 'Bin ' + (state.bins.length + 1) };
      state.bins.push(bin);
      persist();
      return bin;
    }
    function renameBin(binId, name) {
      const b = getBin(binId);
      if (b) {
        b.name = name;
        persist();
      }
    }
    function removeBin(binId) {
      if (activePackInBin(binId)) throw new Error('Empty the bin before removing it.');
      state.bins = state.bins.filter((b) => b.id !== binId);
      persist();
    }
    function activePackInBin(binId) {
      return Object.values(state.packs).find(
        (p) => p.status === 'active' && p.binId === binId
      ) || null;
    }
    function isBinEmpty(binId) {
      return !activePackInBin(binId);
    }

    // ---- packs / inventory ----------------------------------------------
    function listInventory() {
      return Object.values(state.packs).filter((p) => p.status === 'inventory');
    }
    function listActive() {
      return Object.values(state.packs).filter((p) => p.status === 'active');
    }
    function listSoldOut() {
      return Object.values(state.packs).filter((p) => p.status === 'soldout');
    }
    function listTrash() {
      return Object.values(state.packs).filter((p) => p.status === 'trash');
    }
    function getPack(id) {
      return state.packs[id] || null;
    }
    // Prefer the "live" pack for a key (active > inventory > soldout > trash) so
    // identify/dedupe behave correctly even if a pack number was reused.
    function findPackByKey(packKey) {
      const rank = { active: 0, inventory: 1, soldout: 2, trash: 3 };
      let best = null;
      for (const p of Object.values(state.packs)) {
        if (p.packKey !== packKey) continue;
        if (!best || (rank[p.status] != null ? rank[p.status] : 9) < (rank[best.status] != null ? rank[best.status] : 9)) best = p;
      }
      return best;
    }

    /**
     * Add a scanned pack to inventory. Dedupe: a (game,pack) key must be unique
     * among packs that still exist (inventory or active). Returns {ok, pack?, error?}.
     */
    function addToInventory(parsed) {
      const g = lookupGame(parsed.gameNumber);
      const existing = findPackByKey(parsed.packKey);
      if (existing && existing.status !== 'soldout' && existing.status !== 'trash') {
        return { ok: false, error: 'Duplicate: that pack is already in ' +
          (existing.status === 'active' ? 'a bin.' : 'inventory.') };
      }
      const pack = {
        id: uid('pack'),
        gameNumber: parsed.gameNumber,
        packNumber: parsed.packNumber,
        packKey: parsed.packKey,
        name: g ? g.name : 'Unknown game ' + parsed.gameNumber,
        price: g ? g.price : null,
        ticketsPerPack: g ? g.ticketsPerPack : null,
        status: 'inventory', // inventory | active | soldout
        activated: false,
        soldOut: false,
        binId: null,
        currentIndex: 0, // tickets sold so far in this pack
        addedAt: new Date().toISOString(),
        knownGame: !!(g && g._known),
      };
      state.packs[pack.id] = pack;
      persist();
      return { ok: true, pack: pack };
    }

    // Soft-delete: an inventory pack goes to Trash (recoverable), not gone.
    function removePackFromInventory(packId) {
      const p = getPack(packId);
      if (p && p.status === 'inventory') {
        p._prevStatus = 'inventory';
        p.status = 'trash';
        p.trashedAt = new Date().toISOString();
        persist();
      }
    }
    function restoreFromTrash(packId) {
      const p = getPack(packId);
      if (p && p.status === 'trash') {
        // only restore if its (game,pack) isn't live again
        const live = Object.values(state.packs).find(
          (q) => q.packKey === p.packKey && q.id !== p.id && (q.status === 'inventory' || q.status === 'active')
        );
        if (live) throw new Error('That pack number is already active again.');
        p.status = 'inventory';
        delete p.trashedAt;
        persist();
      }
    }
    function deletePackForever(packId) {
      const p = getPack(packId);
      if (p && p.status === 'trash') { delete state.packs[packId]; persist(); }
    }
    function emptyTrash() {
      listTrash().forEach((p) => { delete state.packs[p.id]; });
      persist();
    }

    /**
     * Activate a pack into a bin. If the bin already has an active pack it is
     * marked sold out (a normal rollover) and its current day-segment completed.
     * A new day-segment is opened for the incoming pack (only if a day is open).
     *
     * @param packId   pack already in inventory (or freshly added)
     * @param binId    destination bin
     * @param startIdx tickets already sold in the new pack (usually 0)
     * @param replaceMode  what happens to a pack already in the bin:
     *   'soldout' (default) — it ran out; count its remaining tickets as sold.
     *   'inventory'         — swap; move it back to inventory, count only sold.
     */
    function activatePack(packId, binId, startIdx, replaceMode) {
      const pack = getPack(packId);
      if (!pack) throw new Error('Pack not found.');
      if (!getBin(binId)) throw new Error('Bin not found.');
      if (pack.status === 'active') throw new Error('Pack is already active.');
      if (!pack.knownGame || pack.ticketsPerPack == null) {
        throw new Error('This game is unknown — add its price/size in Settings → Games first.');
      }
      startIdx = clampIndex(startIdx, pack.ticketsPerPack);

      // handle whatever is currently in the bin
      const current = activePackInBin(binId);
      if (current) {
        if (replaceMode === 'inventory') returnActivePackToInventory(current.id);
        else markSoldOut(current.id, { reason: 'replaced' });
      }

      pack.status = 'active';
      pack.activated = true;
      pack.soldOut = false;
      pack.binId = binId;
      pack.currentIndex = startIdx;
      pack.activatedAt = new Date().toISOString();

      // open a day-segment for it
      const day = currentDay();
      if (day) {
        const bd = (day.bins[binId] = day.bins[binId] || { segments: [] });
        bd.segments.push(makeSegment(pack, startIdx));
      }
      persist();
      return pack;
    }

    /**
     * Mark a pack sold out. Two cases:
     *   - normal rollover (reason 'replaced'): complete its open segment.
     *   - full-pack sale (reason 'fullpack'): record a full-pack sale for the
     *     day and (if active) free the bin.
     */
    function markSoldOut(packId, opts) {
      opts = opts || {};
      const pack = getPack(packId);
      if (!pack) throw new Error('Pack not found.');
      if (pack.status === 'soldout') return pack;

      const day = currentDay();
      const wasActive = pack.status === 'active';
      const binId = pack.binId;

      if (opts.reason === 'fullpack') {
        // a customer bought the whole (remaining) pack
        if (day) {
          day.fullPacks = day.fullPacks || [];
          day.fullPacks.push({
            packId: pack.id,
            packKey: pack.packKey,
            gameNumber: pack.gameNumber,
            name: pack.name,
            price: pack.price,
            ticketsPerPack: pack.ticketsPerPack,
            indexAtSale: pack.currentIndex || 0,
          });
        }
      }

      // close the open day-segment for this pack, if any
      if (day && binId && day.bins[binId]) {
        const segs = day.bins[binId].segments;
        const open = segs[segs.length - 1];
        if (open && open.packId === pack.id && !open.completed) {
          if (opts.reason === 'fullpack') {
            // Customer bought the REMAINING tickets as a lump (counted in
            // fullPacks above). The segment should count only what was sold
            // loose today (start -> currentIndex), not the whole pack, or the
            // remainder would be double-counted.
            open.endIndex = clampIndex(pack.currentIndex || open.startIndex, open.ticketsPerPack);
          } else {
            // normal rollover: pack ran to the end through loose sales
            open.completed = true;
          }
        }
      }

      // archive snapshot (for reversal)
      pack._prev = {
        status: pack.status,
        binId: pack.binId,
        currentIndex: pack.currentIndex,
        activated: pack.activated,
      };
      pack.status = 'soldout';
      pack.soldOut = true;
      pack.activated = false;
      pack.binId = null;
      pack.soldOutAt = new Date().toISOString();
      pack.soldOutReason = opts.reason || 'manual';
      pack.soldOutDayId = day ? day.id : null;
      pack.soldOutBinId = wasActive ? binId : pack.soldOutBinId;
      persist();
      return pack;
    }

    /** Full-pack sale of an inventory or active pack. */
    function sellFullPack(packId) {
      const pack = getPack(packId);
      if (!pack) throw new Error('Pack not found.');
      if (!pack.knownGame) throw new Error('Unknown game — add its details first.');
      return markSoldOut(packId, { reason: 'fullpack' });
    }

    /**
     * Take the active pack out of a bin and back to inventory, counting only the
     * tickets it actually sold today (start -> currentIndex). The unsold
     * remainder is kept with the pack, never counted as sales. Used when a pack
     * is swapped out (not sold out).
     */
    function returnActivePackToInventory(packId) {
      const pack = getPack(packId);
      if (!pack || pack.status !== 'active') return;
      const day = currentDay();
      const binId = pack.binId;
      if (day && binId && day.bins[binId]) {
        const segs = day.bins[binId].segments;
        const open = segs[segs.length - 1];
        if (open && open.packId === pack.id && !open.completed) {
          // close at currentIndex so it counts (currentIndex - startIndex) only
          open.endIndex = clampIndex(pack.currentIndex || open.startIndex, open.ticketsPerPack);
        }
      }
      pack._prev = { status: 'active', binId: binId, currentIndex: pack.currentIndex, activated: true };
      pack.status = 'inventory';
      pack.activated = false;
      pack.binId = null;
      // keep currentIndex so the pack's progress is preserved for re-activation
      persist();
    }

    /** Reverse an accidental activation: active pack -> back to inventory. */
    function reverseActivation(packId) {
      const pack = getPack(packId);
      if (!pack || pack.status !== 'active') throw new Error('Pack is not active.');
      const day = currentDay();
      if (day && pack.binId && day.bins[pack.binId]) {
        const segs = day.bins[pack.binId].segments;
        // drop the segment we opened for this pack
        if (segs.length && segs[segs.length - 1].packId === pack.id) {
          segs.pop();
          if (!segs.length) delete day.bins[pack.binId];
        }
      }
      pack.status = 'inventory';
      pack.activated = false;
      pack.binId = null;
      pack.currentIndex = 0;
      persist();
      return pack;
    }

    /**
     * Reverse a sold-out pack, restoring its original state and undoing its
     * sales impact. For a rollover replacement, this also sends whatever pack
     * replaced it back to inventory (undoing the whole replacement) and restores
     * this pack to its bin.
     */
    function reverseSoldOut(packId) {
      const pack = getPack(packId);
      if (!pack || pack.status !== 'soldout') throw new Error('Pack is not sold out.');
      const day = pack.soldOutDayId ? getDay(pack.soldOutDayId) : null;

      // drop any full-pack record tied to this pack in its day
      if (day && day.fullPacks) {
        day.fullPacks = day.fullPacks.filter((fp) => fp.packId !== pack.id);
      }

      const prev = pack._prev || {};
      const wantBin = pack.soldOutBinId;
      const cur = currentDay();
      const isCurrentDay = !!(day && cur && day.id === cur.id);

      // If a different pack now occupies the bin (it replaced this one), undo
      // that activation so this pack can return to its slot — but only within
      // the same open day, otherwise we'd disturb a later day's bin.
      if (wantBin && isCurrentDay) {
        const occupant = activePackInBin(wantBin);
        if (occupant && occupant.id !== pack.id) reverseActivation(occupant.id);
      }

      const canRestore = prev.status === 'active' && wantBin && isBinEmpty(wantBin);
      if (canRestore) {
        pack.status = 'active';
        pack.activated = true;
        pack.binId = wantBin;
        pack.currentIndex = prev.currentIndex || 0;
        // re-open this pack's day segment so it counts only its actual sales
        if (day && day.bins[wantBin]) {
          const seg = day.bins[wantBin].segments.find((s) => s.packId === pack.id);
          if (seg) { seg.completed = false; seg.endIndex = clampIndex(pack.currentIndex, seg.ticketsPerPack); }
        }
      } else {
        pack.status = 'inventory';
        pack.activated = false;
        pack.binId = null;
        // remove this pack's (inflated) segment contribution from the day
        if (day && wantBin && day.bins[wantBin]) {
          const segs = day.bins[wantBin].segments;
          const i = segs.findIndex((s) => s.packId === pack.id);
          if (i !== -1) segs.splice(i, 1);
          if (!segs.length) delete day.bins[wantBin];
        }
      }
      pack.soldOut = false;
      delete pack._prev;
      if (day) day.computed = engine.computeDay(day);
      persist();
      return pack;
    }

    /** Move the active pack from one bin into an empty bin. */
    function movePack(fromBinId, toBinId) {
      const pack = activePackInBin(fromBinId);
      if (!pack) throw new Error('Source bin is empty.');
      if (!isBinEmpty(toBinId)) throw new Error('Destination bin is not empty.');
      pack.binId = toBinId;
      const day = currentDay();
      if (day && day.bins[fromBinId]) {
        day.bins[toBinId] = day.bins[fromBinId];
        delete day.bins[fromBinId];
      }
      persist();
      return pack;
    }

    /** Swap the entire contents (pack + today's segments) of two bins. */
    function swapBins(aId, bId) {
      if (aId === bId) return;
      if (!getBin(aId) || !getBin(bId)) throw new Error('Bin not found.');
      const a = activePackInBin(aId);
      const b = activePackInBin(bId);
      if (!a && !b) throw new Error('Both bins are empty.');
      if (a) a.binId = bId;
      if (b) b.binId = aId;
      const day = currentDay();
      if (day) {
        const da = day.bins[aId];
        const db = day.bins[bId];
        if (db) day.bins[aId] = db; else delete day.bins[aId];
        if (da) day.bins[bId] = da; else delete day.bins[bId];
      }
      persist();
    }

    function makeSegment(pack, startIdx) {
      return {
        packId: pack.id,
        packKey: pack.packKey,
        gameNumber: pack.gameNumber,
        name: pack.name,
        price: pack.price,
        ticketsPerPack: pack.ticketsPerPack,
        startIndex: startIdx == null ? pack.currentIndex || 0 : startIdx,
        endIndex: startIdx == null ? pack.currentIndex || 0 : startIdx,
        completed: false,
      };
    }

    // ---- day lifecycle ---------------------------------------------------
    function currentDay() {
      if (!state.currentDayId) return null;
      return state.days.find((d) => d.id === state.currentDayId) || null;
    }
    function isInDay() {
      return !!currentDay();
    }
    function lastClosedDay() {
      for (let i = state.days.length - 1; i >= 0; i--) {
        if (state.days[i].state === 'closed') return state.days[i];
      }
      return null;
    }

    /**
     * Start a new day. Copies each bin's active pack + its carried index into a
     * fresh day record as the starting segment.
     */
    function startDay(whenLocal) {
      if (isInDay()) throw new Error('A day is already open. End it first.');
      const w = (whenLocal && whenLocal.length >= 16) ? whenLocal : nowLocalISO();
      const day = {
        id: uid('day'),
        date: w.slice(0, 10),
        startTime: w.slice(11, 16),
        state: 'in-day',
        bins: {},
        fullPacks: [],
        report: { onlineSales: 0, onlineCashes: 0, scratchCashes: 0 },
        computed: null,
        startedAt: new Date().toISOString(),
      };
      for (const bin of state.bins) {
        const pack = activePackInBin(bin.id);
        if (pack) {
          day.bins[bin.id] = { segments: [makeSegment(pack, pack.currentIndex || 0)] };
        }
      }
      state.days.push(day);
      state.currentDayId = day.id;
      persist();
      return day;
    }

    /** Record an end-of-day scan for a bin (sets the open segment's endIndex). */
    function recordEndScan(binId, endIndex) {
      const day = currentDay();
      if (!day) throw new Error('No open day.');
      const bd = day.bins[binId];
      if (!bd || !bd.segments.length) throw new Error('That bin has no active pack today.');
      const open = bd.segments[bd.segments.length - 1];
      const idx = clampIndex(endIndex, open.ticketsPerPack);
      if (idx < open.startIndex) {
        throw new Error('End index ' + idx + ' is below the start index ' + open.startIndex + '.');
      }
      open.endIndex = idx;
      // keep the live pack position in sync
      const pack = getPack(open.packId);
      if (pack) pack.currentIndex = idx;
      persist();
      return open;
    }

    /** Save the daily lottery-report figures (online sales/cashes, scratch cashes). */
    function setReport(fields) {
      const day = currentDay();
      if (!day) throw new Error('No open day.');
      day.report = {
        onlineSales: num(fields.onlineSales),
        onlineCashes: num(fields.onlineCashes),
        scratchCashes: num(fields.scratchCashes),
      };
      day.computed = engine.computeDay(day);
      persist();
      return day.computed;
    }

    /** Close the open day (after end scans + report entered). */
    function endDay() {
      const day = currentDay();
      if (!day) throw new Error('No open day.');
      day.computed = engine.computeDay(day);
      day.state = 'closed';
      day.closedAt = new Date().toISOString();
      day.endTime = nowLocalISO().slice(11, 16);
      // carry each bin's ending index onto its pack for tomorrow
      for (const binId of Object.keys(day.bins)) {
        const segs = day.bins[binId].segments;
        const last = segs[segs.length - 1];
        if (last && !last.completed) {
          const pack = getPack(last.packId);
          if (pack) pack.currentIndex = num(last.endIndex);
        }
      }
      state.currentDayId = null;
      persist();
      return day.computed;
    }

    // ---- history & cascade ----------------------------------------------
    function listDays() {
      return state.days.slice();
    }
    function getDay(dayId) {
      return state.days.find((d) => d.id === dayId) || null;
    }

    /**
     * Manually edit a segment's start/end index on a past day. Cascades the
     * change to linked future days and recomputes all affected day totals.
     */
    function editSegment(dayId, binId, segIndex, patch) {
      const day = getDay(dayId);
      if (!day) throw new Error('Day not found.');
      const bd = day.bins[binId];
      if (!bd || !bd.segments[segIndex]) throw new Error('Segment not found.');
      const seg = bd.segments[segIndex];
      if (patch.startIndex != null) seg.startIndex = clampIndex(patch.startIndex, seg.ticketsPerPack);
      if (patch.endIndex != null) seg.endIndex = clampIndex(patch.endIndex, seg.ticketsPerPack);
      recomputeFrom(dayId);
      persist();
      return day;
    }

    /** Re-link and recompute every day from a given day onward. */
    function recomputeFrom() {
      // order is already oldest->newest; cascade across the whole set is safe & simple
      engine.cascadeAll(state.days);
      for (const d of state.days) {
        if (d.state === 'closed' || d.id === state.currentDayId) {
          d.computed = engine.computeDay(d);
        }
      }
    }

    function recomputeAll() {
      recomputeFrom();
      persist();
    }

    // ---- weekly / range report ------------------------------------------
    function rangeReport(startISO, endISO) {
      const days = state.days.filter(
        (d) => d.state === 'closed' && d.date >= startISO && d.date <= endISO
      );
      let scratchSales = 0,
        online = 0,
        onlineCash = 0,
        scratchCash = 0,
        register = 0,
        fullPackAmount = 0,
        fullPacksCount = 0;
      for (const d of days) {
        const c = d.computed || engine.computeDay(d);
        scratchSales += c.scratchSales;
        online += c.onlineSales;
        onlineCash += c.onlineCashes;
        scratchCash += c.scratchCashes;
        register += c.registerCash;
        fullPackAmount += c.fullPackAmount;
        fullPacksCount += c.fullPacksCount;
      }
      // sold-out pack statistics in range (from the archive)
      const soldPacks = listSoldOut().filter((p) => {
        const dayId = p.soldOutDayId;
        if (!dayId) return false;
        const d = getDay(dayId);
        return d && d.date >= startISO && d.date <= endISO;
      });
      return {
        startISO,
        endISO,
        dayCount: days.length,
        scratchSales,
        online,
        onlineCash,
        scratchCash,
        register,
        fullPackAmount,
        fullPacksCount,
        soldOutPackCount: soldPacks.length,
        soldOutPackValue: soldPacks.reduce(
          (s, p) => s + (p.ticketsPerPack || 0) * (p.price || 0),
          0
        ),
        days,
      };
    }

    // ---- settings / games / backup --------------------------------------
    function setSettings(patch) {
      state.settings = Object.assign({}, state.settings, patch);
      persist();
    }
    function upsertGame(gameNumber, entry) {
      state.gameOverrides[String(gameNumber)] = entry;
      // retro-fill packs that referenced this unknown game
      const g = lookupGame(gameNumber);
      for (const p of Object.values(state.packs)) {
        if (p.gameNumber === String(gameNumber) && g) {
          p.name = g.name;
          p.price = g.price;
          p.ticketsPerPack = g.ticketsPerPack;
          p.knownGame = !!g._known;
        }
      }
      persist();
    }
    function setCatalog(catalog) {
      if (catalog && catalog.games) {
        state.catalog = catalog;
        persist();
      }
    }
    function exportBackup() {
      storage.exportToFile(state);
    }
    async function importBackup(file) {
      const next = await storage.importFromFile(file);
      if (!next || !next.version) throw new Error('Unrecognized backup file.');
      state = next;
      persist();
    }
    function resetAll() {
      state = defaultState(state.catalog);
      persist();
    }

    function getState() {
      return state;
    }

    return {
      subscribe,
      getState,
      // games
      gameDb,
      lookupGame,
      upsertGame,
      setCatalog,
      // bins
      listBins,
      getBin,
      addBin,
      renameBin,
      removeBin,
      isBinEmpty,
      activePackInBin,
      // packs
      listInventory,
      listActive,
      listSoldOut,
      listTrash,
      getPack,
      findPackByKey,
      addToInventory,
      removePackFromInventory,
      restoreFromTrash,
      deletePackForever,
      emptyTrash,
      activatePack,
      markSoldOut,
      sellFullPack,
      reverseActivation,
      reverseSoldOut,
      movePack,
      swapBins,
      // day
      currentDay,
      isInDay,
      lastClosedDay,
      startDay,
      recordEndScan,
      setReport,
      endDay,
      // history
      listDays,
      getDay,
      editSegment,
      recomputeAll,
      rangeReport,
      // settings/backup
      setSettings,
      exportBackup,
      importBackup,
      resetAll,
    };
  }

  function clampIndex(v, ticketsPerPack) {
    let n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (ticketsPerPack && n > ticketsPerPack) n = ticketsPerPack;
    return n;
  }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  P.store = { createStore, defaultState };
})(typeof window !== 'undefined' ? window : this);

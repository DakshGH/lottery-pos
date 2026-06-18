/*
 * engine.js — pure calculation logic for scratch-off sales & cash reconciliation.
 *
 * No DOM, no storage — just math on plain data, so it can be unit-tested in Node.
 * Works in both Node (require) and the browser (window.POS.engine).
 *
 * Key concepts
 * ------------
 * Index = number of tickets sold so far in a pack (a fresh pack is at index 0).
 *   A $5 pack of 60 tickets has indexes 0..59; after the last ticket the pack
 *   is empty and a new pack is scanned (rollover detected by pack-number change).
 *
 * A bin's activity for one day is a list of "segments" — one per pack that was
 * active in that bin during the day:
 *   { packKey, gameNumber, price, ticketsPerPack, startIndex, endIndex,
 *     completed }
 *   completed=true means the pack was sold out / replaced during the day, so it
 *   ran from startIndex to the end of the pack.
 *
 * Full-pack sales (a customer buys an entire pack) are tracked separately and
 * add (ticketsPerPack - indexAtSale) * price to the day.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.POS = window.POS || {};
    window.POS.engine = mod;
  }
})(this, function () {
  'use strict';

  // Price -> tickets per pack (NJ scratch-off conventions).
  // $3 (100) and $40 (20) extend the original spec for NJ's price tiers; both
  // can be overridden per game in the game database if a book differs.
  const PRICE_TO_TICKETS = {
    1: 200,
    2: 150,
    3: 100,
    5: 60,
    10: 30,
    20: 20,
    25: 20,
    30: 20,
    40: 20,
  };

  /** Tickets per pack for a given ticket price. Falls back to 0 if unknown. */
  function ticketsPerPack(price) {
    const p = Number(price);
    if (PRICE_TO_TICKETS.hasOwnProperty(p)) return PRICE_TO_TICKETS[p];
    return 0;
  }

  /** Highest valid index for a price (ticketsPerPack - 1). */
  function maxIndex(price) {
    const n = ticketsPerPack(price);
    return n > 0 ? n - 1 : 0;
  }

  /**
   * Tickets sold within a single segment.
   *   completed segment: pack ran to the end  -> ticketsPerPack - startIndex
   *   open segment (active at day end)         -> endIndex - startIndex
   */
  function segmentTicketsSold(seg) {
    const tpp = seg.ticketsPerPack || ticketsPerPack(seg.price);
    if (seg.completed) {
      const sold = tpp - num(seg.startIndex);
      return clampNonNeg(sold);
    }
    const sold = num(seg.endIndex) - num(seg.startIndex);
    return clampNonNeg(sold);
  }

  /** Dollar value of loose-ticket sales for one segment. */
  function segmentSales(seg) {
    return segmentTicketsSold(seg) * Number(seg.price || 0);
  }

  /**
   * Sum the loose-ticket sales for a bin's day (all segments).
   * Returns { tickets, amount }.
   */
  function binTicketSales(binDay) {
    let tickets = 0;
    let amount = 0;
    const segs = (binDay && binDay.segments) || [];
    for (const seg of segs) {
      const t = segmentTicketsSold(seg);
      tickets += t;
      amount += t * Number(seg.price || 0);
    }
    return { tickets, amount };
  }

  /** Value of one full-pack sale. */
  function fullPackValue(fp) {
    const tpp = fp.ticketsPerPack || ticketsPerPack(fp.price);
    const remaining = tpp - num(fp.indexAtSale); // whole pack if indexAtSale=0
    return clampNonNeg(remaining) * Number(fp.price || 0);
  }

  /**
   * Compute a full day's totals.
   * day = {
   *   bins: { [binId]: { segments:[...] } },
   *   fullPacks: [ {price, ticketsPerPack, indexAtSale} ],
   *   report: { onlineSales, onlineCashes, scratchCashes }
   * }
   * Returns a `computed` object.
   */
  function computeDay(day) {
    const perBin = {};
    let scratchTickets = 0;
    let scratchTicketAmount = 0;

    const bins = (day && day.bins) || {};
    for (const binId of Object.keys(bins)) {
      const bd = bins[binId];
      const s = binTicketSales(bd);
      perBin[binId] = {
        tickets: s.tickets,
        ticketAmount: s.amount,
        startIndex: firstStart(bd),
        endIndex: lastEnd(bd),
        packsChanged: ((bd && bd.segments) || []).length > 1,
      };
      scratchTickets += s.tickets;
      scratchTicketAmount += s.amount;
    }

    const fullPacks = (day && day.fullPacks) || [];
    let fullPackAmount = 0;
    for (const fp of fullPacks) fullPackAmount += fullPackValue(fp);

    const scratchSales = scratchTicketAmount + fullPackAmount;

    const report = (day && day.report) || {};
    const onlineSales = num(report.onlineSales);
    const onlineCashes = num(report.onlineCashes);
    const scratchCashes = num(report.scratchCashes);

    const registerCash =
      scratchSales + onlineSales - onlineCashes - scratchCashes;

    return {
      perBin,
      scratchTickets,
      scratchTicketAmount,
      fullPackAmount,
      fullPacksCount: fullPacks.length,
      scratchSales,
      onlineSales,
      onlineCashes,
      scratchCashes,
      registerCash,
    };
  }

  // ---- cascade helpers ---------------------------------------------------

  /**
   * Link days for one bin: the end index of a continuing pack on day N becomes
   * the start index of day N+1. Given an ordered list of day records (oldest
   * first) and a binId, propagate edits forward where the pack is unchanged.
   *
   * This mutates the provided days array and returns the list of day indexes
   * that changed (so callers can recompute & persist them).
   */
  function cascadeBin(days, binId) {
    const changed = [];
    for (let i = 1; i < days.length; i++) {
      const prev = days[i - 1];
      const cur = days[i];
      const prevBin = prev.bins && prev.bins[binId];
      const curBin = cur.bins && cur.bins[binId];
      if (!prevBin || !curBin) continue;
      const prevLastSeg = lastSeg(prevBin);
      const curFirstSeg = firstSeg(curBin);
      if (!prevLastSeg || !curFirstSeg) continue;
      // Only link when the same physical pack continues across the day boundary.
      if (prevLastSeg.packKey && prevLastSeg.packKey === curFirstSeg.packKey) {
        const desiredStart = num(prevLastSeg.endIndex);
        if (num(curFirstSeg.startIndex) !== desiredStart) {
          curFirstSeg.startIndex = desiredStart;
          if (changed[changed.length - 1] !== i) changed.push(i);
        }
      }
    }
    return changed;
  }

  /** Cascade across every bin that appears in the day set. */
  function cascadeAll(days) {
    const binIds = new Set();
    for (const d of days) {
      for (const b of Object.keys((d && d.bins) || {})) binIds.add(b);
    }
    const changed = new Set();
    for (const binId of binIds) {
      for (const i of cascadeBin(days, binId)) changed.add(i);
    }
    return Array.from(changed).sort((a, b) => a - b);
  }

  // ---- small utils -------------------------------------------------------

  function firstSeg(binDay) {
    const s = (binDay && binDay.segments) || [];
    return s.length ? s[0] : null;
  }
  function lastSeg(binDay) {
    const s = (binDay && binDay.segments) || [];
    return s.length ? s[s.length - 1] : null;
  }
  function firstStart(binDay) {
    const s = firstSeg(binDay);
    return s ? num(s.startIndex) : 0;
  }
  function lastEnd(binDay) {
    const s = lastSeg(binDay);
    if (!s) return 0;
    return s.completed ? (s.ticketsPerPack || ticketsPerPack(s.price)) : num(s.endIndex);
  }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function clampNonNeg(n) {
    return n < 0 ? 0 : n;
  }

  return {
    PRICE_TO_TICKETS,
    ticketsPerPack,
    maxIndex,
    segmentTicketsSold,
    segmentSales,
    binTicketSales,
    fullPackValue,
    computeDay,
    cascadeBin,
    cascadeAll,
  };
});

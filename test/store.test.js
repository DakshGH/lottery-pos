/*
 * store.test.js — store-level regression tests (rollover / replace / reverse).
 * Runs in Node by faking just enough of the browser (window + localStorage),
 * then loading the same source files the browser uses.
 *
 *   node test/store.test.js
 */
const assert = require('assert');

// --- minimal browser shims so the source modules load unchanged ---
global.window = global;
const _ls = {};
global.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
};

// Load in dependency order; each attaches to window.POS (=global.POS).
require('../src/core/engine');
require('../src/core/barcode');
require('../src/core/games');
require('../src/core/storage');
require('../src/core/store');
const POS = global.POS;
const E = POS.engine, B = POS.barcode;

const SEED = { version: 2, games: {
  '01960': { name: '100X', price: 20 },          // 20 tickets
  '01941': { name: 'Jackpot Millions', price: 30 }, // 20 tickets ($600 pack)
  '01967': { name: 'Goooalll', price: 5 },        // 60 tickets
} };

let passed = 0;
function test(name, fn) {
  // fresh store per test
  localStorage.removeItem('pos.lottery.state.v1');
  try { fn(POS.store.createStore(SEED)); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}
const scratch = (s) => E.computeDay(s.currentDay()).scratchSales;
function activate(s, code, binId, idx) {
  const p = s.addToInventory(B.parse(code)).pack;
  return s.activatePack(p.id, binId, idx || 0);
}

// ---- replacing a pack in an occupied bin (rollover) ----------------------

test('replacing an occupied bin marks the old pack sold out (counts remaining)', (s) => {
  const b1 = s.addBin('1'), b2 = s.addBin('2');
  activate(s, '01960-1000001-000', b1.id, 0);     // 100X
  activate(s, '01941-5000001-000', b2.id, 0);     // Jackpot
  s.startDay('2026-06-19T09:00');
  s.recordEndScan(b1.id, 9);                        // $180 baseline
  assert.strictEqual(scratch(s), 180);
  activate(s, '01967-2000001-000', b2.id, 0);       // Jackpot rolled over (+$600)
  assert.strictEqual(scratch(s), 780);
  assert.strictEqual(s.listSoldOut().length, 1);
});

test('reversing a rollover restores the bin and reverts earnings', (s) => {
  const b1 = s.addBin('1'), b2 = s.addBin('2');
  activate(s, '01960-1000001-000', b1.id, 0);
  activate(s, '01941-5000001-000', b2.id, 0);
  s.startDay('2026-06-19T09:00');
  s.recordEndScan(b1.id, 9);
  activate(s, '01967-2000001-000', b2.id, 0);       // +$600
  assert.strictEqual(scratch(s), 780);
  s.reverseSoldOut(s.listSoldOut()[0].id);
  assert.strictEqual(scratch(s), 180, 'earnings reverted');
  assert.strictEqual(s.activePackInBin(b2.id).name, 'Jackpot Millions', 'Jackpot restored to bin');
  assert.ok(s.listInventory().some((p) => p.packKey === '01967-2000001'), 'replacer back in inventory');
});

test('full-pack sale of an active partial pack reverses cleanly', (s) => {
  const b1 = s.addBin('1');
  const p = activate(s, '01960-1000001-000', b1.id, 0); // 100X $20
  s.startDay('2026-06-19T09:00');
  s.recordEndScan(b1.id, 5);                              // $100 loose
  s.sellFullPack(p.id);                                   // + remaining 15*20 = $300
  assert.strictEqual(scratch(s), 400);
  s.reverseSoldOut(s.listSoldOut()[0].id);
  assert.strictEqual(scratch(s), 100, 'full-pack value removed');
  assert.ok(s.activePackInBin(b1.id), 'pack restored to bin');
});

console.log('\n' + passed + ' store tests passed.');

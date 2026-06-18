/*
 * engine.test.js — zero-dependency tests. Run with: node test/engine.test.js
 * Verifies the engine against the Day 1 / Day 2 worked example from the spec.
 */
const assert = require('assert');
const engine = require('../src/core/engine');
const barcode = require('../src/core/barcode');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('FAIL  ' + name + '\n      ' + e.message);
    process.exitCode = 1;
  }
}

// ---- barcode -------------------------------------------------------------

test('parses dashed barcode', () => {
  const r = barcode.parse('01967-1032738-033');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.gameNumber, '01967');
  assert.strictEqual(r.packNumber, '1032738');
  assert.strictEqual(r.index, 33);
  assert.strictEqual(r.packKey, '01967-1032738');
});

test('parses continuous 15-digit barcode', () => {
  const r = barcode.parse('019671032738033');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.gameNumber, '01967');
  assert.strictEqual(r.packNumber, '1032738');
  assert.strictEqual(r.index, 33);
});

test('rejects wrong-length scan', () => {
  const r = barcode.parse('12345');
  assert.strictEqual(r.ok, false);
});

// ---- engine basics -------------------------------------------------------

test('price -> tickets per pack', () => {
  assert.strictEqual(engine.ticketsPerPack(1), 200);
  assert.strictEqual(engine.ticketsPerPack(2), 150);
  assert.strictEqual(engine.ticketsPerPack(5), 60);
  assert.strictEqual(engine.ticketsPerPack(10), 30);
  assert.strictEqual(engine.ticketsPerPack(20), 20);
  assert.strictEqual(engine.ticketsPerPack(30), 20);
});

test('open segment sells end-start', () => {
  const sold = engine.segmentTicketsSold({ price: 5, startIndex: 0, endIndex: 23 });
  assert.strictEqual(sold, 23);
});

test('completed segment sells to end of pack', () => {
  // crossword $10, 30 tickets, started at 24 and rolled over
  const sold = engine.segmentTicketsSold({
    price: 10, startIndex: 24, completed: true,
  });
  assert.strictEqual(sold, 6); // 30 - 24
});

// ---- Day 1 from the spec -------------------------------------------------
// BIN1 500X $5: 0 -> 23  (23 tickets, $115)
// BIN2 CW   $10: 24 -> rollover -> 2  (8 tickets, $80)
// scratch 195, online sale 200, online cash 100, scratch cash 100 => register 195

test('Day 1 totals match spec', () => {
  const day = {
    bins: {
      bin1: { segments: [{ packKey: '500X-A', price: 5, startIndex: 0, endIndex: 23 }] },
      bin2: {
        segments: [
          { packKey: 'CW-A', price: 10, startIndex: 24, completed: true }, // 6
          { packKey: 'CW-B', price: 10, startIndex: 0, endIndex: 2 },        // 2
        ],
      },
    },
    fullPacks: [],
    report: { onlineSales: 200, onlineCashes: 100, scratchCashes: 100 },
  };
  const c = engine.computeDay(day);
  assert.strictEqual(c.perBin.bin1.ticketAmount, 115, 'bin1 $115');
  assert.strictEqual(c.perBin.bin2.tickets, 8, 'bin2 8 tickets');
  assert.strictEqual(c.perBin.bin2.ticketAmount, 80, 'bin2 $80');
  assert.strictEqual(c.scratchSales, 195, 'scratch 195');
  assert.strictEqual(c.registerCash, 195, 'register 195');
});

// ---- Day 2 from the spec -------------------------------------------------
// BIN1 500X $5: 23 -> 27 (4 tickets $20) + 1 FULL PACK ($300) => $320
// BIN2 CW   $10: 2 -> 7 (5 tickets $50)
// scratch 370, online sale 100, online cash 120, scratch cash 250 => register 100

test('Day 2 totals match spec (incl. full pack)', () => {
  const day = {
    bins: {
      bin1: { segments: [{ packKey: '500X-A', price: 5, startIndex: 23, endIndex: 27 }] },
      bin2: { segments: [{ packKey: 'CW-B', price: 10, startIndex: 2, endIndex: 7 }] },
    },
    fullPacks: [{ price: 5, ticketsPerPack: 60, indexAtSale: 0 }], // 500X full pack = $300
    report: { onlineSales: 100, onlineCashes: 120, scratchCashes: 250 },
  };
  const c = engine.computeDay(day);
  assert.strictEqual(c.perBin.bin1.ticketAmount, 20, 'bin1 loose $20');
  assert.strictEqual(c.fullPackAmount, 300, 'full pack $300');
  assert.strictEqual(c.scratchSales, 370, 'scratch 370');
  assert.strictEqual(c.registerCash, 100, 'register 100');
});

// ---- cascade -------------------------------------------------------------

test('editing day1 end cascades into day2 start', () => {
  const days = [
    { bins: { b: { segments: [{ packKey: 'P1', price: 5, startIndex: 0, endIndex: 10 }] } } },
    { bins: { b: { segments: [{ packKey: 'P1', price: 5, startIndex: 10, endIndex: 20 }] } } },
  ];
  // user edits day1 end to 12
  days[0].bins.b.segments[0].endIndex = 12;
  const changed = engine.cascadeAll(days);
  assert.deepStrictEqual(changed, [1]);
  assert.strictEqual(days[1].bins.b.segments[0].startIndex, 12, 'day2 start now 12');
});

console.log('\n' + passed + ' tests passed.');

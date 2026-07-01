# Lottery POS — Architecture & Handbook

A complete technical explainer of how this app is built and how it works, so any
developer or AI can pick it up cold. For the change history and roadmap see
[CHANGELOG.md](CHANGELOG.md); for business/pricing see [PRICING.md](PRICING.md)
and [LICENSING.md](LICENSING.md).

---

## 1. What it is

A point-of-sale helper for convenience stores that sell **scratch-off lottery
tickets** (built for **New Jersey**). It virtualizes the physical ticket bins,
tracks how many tickets each pack sells per day from barcode scans, manages
delivery inventory and sold-out packs, and **auto-calculates the cash that
should be in the register** from the daily lottery report.

It is **local-first**: a static web app with no backend, no build step, no
account. Data lives in the browser (`localStorage`). It runs by opening
`index.html`, via the bundled `node server.js`, on GitHub Pages, or wrapped as a
desktop app (Electron, in `desktop/`).

- **Live:** https://dakshgh.github.io/lottery-pos/
- **Run locally:** `node server.js` → http://localhost:5173
- **Tests:** `npm test` (engine + store regression suites)

---

## 2. Architecture at a glance

Plain ES5-ish JavaScript loaded via `<script>` tags (no bundler). Pure-logic
modules use a UMD wrapper so they also `require()` in Node for testing.

```
index.html              loads everything in dependency order
server.js               zero-dependency static file server
styles/app.css          all styling (dark, flat, neutral, one blue accent)

src/core/   (no DOM — pure logic, testable)
  engine.js     sales & cash math, history cascade            [unit-tested]
  barcode.js    parse / classify scanned codes                [unit-tested]
  games.js      game catalog lookup (game number -> name/price/size)
  storage.js    localStorage load/save + JSON backup import/export
  store.js      THE BRAIN: app state + every business action   [store-tested]
  license.js    subscription heartbeat / lock scaffold (off by default)

src/ui/     (DOM)
  scanner.js        camera scanner: native BarcodeDetector -> ZXing -> manual
  hardware-scan.js  global USB keyboard-wedge capture
  app.js            views, modals, flows, wiring (the controller)

vendor/zxing.js     vendored ZXing barcode library (offline camera decoding)
data/games.seed.js  bundled NJ catalog (window.POS_SEED_CATALOG)
test/               engine.test.js + store.test.js (zero-dependency, Node)
```

Everything hangs off one global namespace: `window.POS.{engine,barcode,games,
storage,store,license,scanner,hardwareScan}`. The UI subscribes to the store and
re-renders on every change.

---

## 3. Data model (the store's state)

`storage` persists one JSON object under `pos.lottery.state.v1`:

```js
state = {
  version,
  settings: { storeName, barcodeWidths:{game,pack,index}, remoteGamesUrl, currency },
  catalog:  { version, games: { [gameNumber]: { name, price, ticketsPerPack? } } },
  gameOverrides: { [gameNumber]: {...} },   // user edits, win over catalog
  bins:  [ { id, name } ],
  packs: { [id]: Pack },                     // all packs, by internal id
  days:  [ Day ],                            // oldest -> newest
  currentDayId,                              // the open in-day day, or null
}
```

### Pack
```js
{ id, gameNumber, packNumber, packKey:"GAME-PACK", name, price, ticketsPerPack,
  status: 'inventory' | 'active' | 'soldout' | 'trash',
  binId, currentIndex,        // currentIndex = tickets sold so far in this pack
  knownGame, addedAt,
  _prev,                      // snapshot for reversal (status, binId, currentIndex)
  soldOutReason: 'replaced' | 'fullpack' | 'manual', soldOutBinId, soldOutDayId }
```
A pack moves through statuses: **inventory** (delivered, not in a bin) →
**active** (in a bin, selling) → **soldout** (archived) — or **trash** (a
soft-deleted inventory pack, restorable).

### Day & segments — the heart of the model
A `Day` records each bin's activity as a list of **segments**. One segment per
pack that was active in that bin during the day:

```js
Day = {
  id, date:"YYYY-MM-DD", startTime:"HH:MM", endTime, state:'in-day'|'closed',
  bins: { [binId]: { segments: [ Segment ] } },
  fullPacks: [ { packId, price, ticketsPerPack, indexAtSale } ],
  report: { onlineSales, onlineCashes, scratchCashes },
  computed,                  // cached engine.computeDay(day) for closed days
}
Segment = { packId, packKey, gameNumber, name, price, ticketsPerPack,
            startIndex, endIndex, completed }
```
- A bin gets a **new segment** whenever a pack is activated into it.
- `completed: true` means the pack ran to the end (sold out), so it counts
  `ticketsPerPack − startIndex`.
- `completed: false` (the normal/open case) counts `endIndex − startIndex`.

---

## 4. The index, and the sales math (engine.js)

**Index = the number of tickets already sold from a pack.** A fresh pack is at
index 0. A $5 pack of 60 tickets has valid indexes 0..59. **Pack size comes from
price:** `$1→200, $2→150, $3→100, $5→60, $10→30, $20/$25/$30/$40→20`.

Tickets sold in a segment:
- open segment:      `endIndex − startIndex`
- completed segment: `ticketsPerPack − startIndex`  (ran to the end)

A whole day:
```
scratch ticket sales = Σ (segment tickets × price)        over all bins/segments
full-pack sales      = Σ (ticketsPerPack − indexAtSale) × price   over fullPacks
scratch sales        = scratch ticket sales + full-pack sales
REGISTER CASH        = scratch sales + onlineSales − onlineCashes − scratchCashes
```
This is verified against the brief's Day 1 / Day 2 example (register $195 / $100)
in `engine.test.js`.

### History cascade
Editing a past day's index re-links the days: the **end index of a continuing
pack on day N becomes the start index of day N+1** (`engine.cascadeAll`), then
every affected day is recomputed. So correcting one number ripples forward.

---

## 5. Day lifecycle

- **Start Day** (`startDay`): snapshots each bin's active pack + carried index
  into a fresh day as the first segment. The new day's start index = the prior
  day's end index automatically. Captures date + time.
- **During the day:** scans/edits update `currentIndex` and segment `endIndex`;
  activations create new segments; full-pack sales append to `fullPacks`.
- **End Day** (`endDay`): records each bin's ending index, takes the 3 report
  figures, computes & caches the register cash, marks the day `closed`, and
  carries each active pack's end index onto the pack for tomorrow.

---

## 6. Key operations (and the subtle ones)

| Action | What happens |
|---|---|
| **Add delivery** | scan packs into inventory; duplicate (game+pack) is rejected |
| **Activate → bin** | inventory pack becomes active in a bin; opens a segment |
| **New pack (into occupied bin)** | see *Replace* below |
| **Update index** | scan/enter the bin's current ticket index |
| **Sold-out (full)** | a customer buys a whole pack: adds `(size − index)×price`, frees the bin |
| **Move** | move the active pack to an **empty** bin (sales follow) |
| **Swap** | exchange the entire contents of two bins |
| **Undo activate** | active pack → back to inventory, drops its segment |
| **Reverse (sold-out)** | see *Reverse* below |
| **Trash / Restore** | inventory delete is soft (recoverable in Trash) |

### Replace (activating into an occupied bin) — important
When a bin already has a pack, activating a new one is a **rollover**: the old
pack is marked sold out via `markSoldOut(reason:'replaced')`, its segment marked
`completed` (its remaining tickets counted as sold). This matches real operation
— you replace a pack when it has run out. The activate dialog shows a note of
exactly how much this adds (e.g. *"marks it sold out … +$600"*) so it's never a
surprise. If it was a mistake, use **Reverse** on the sold-out pack (below),
which fully undoes it.

### Reverse a sold-out pack — important
`reverseSoldOut` fully undoes a sale:
- removes any `fullPacks` record for the pack;
- if a different pack replaced it **in the same open day**, sends that replacer
  back to inventory (`reverseActivation`) so the slot frees up;
- restores the pack to its bin (re-opening its segment to count only real
  sales) when possible, else returns it to inventory and removes its segment;
- recomputes the affected day. Earnings revert correctly.
Cross-day reversals correct the *past* day's totals without disturbing later
days (the pack returns to inventory rather than reclaiming a now-busy bin).

### Confirmations (money safety)
Actions that change sales or are hard to undo route through a reusable
`confirm({ title, message, impact, onConfirm })` dialog that shows the dollar
impact before committing: rollover-activate (sell-out + $N), reverse sold-out,
undo activate, quick-scan set-index, sell full pack, remove-from-inventory,
delete-forever, empty-trash. Nothing money-related commits on a single click.

---

## 7. Barcodes & scanning

Tickets have **two** barcodes:
- **Long (validation)** — `GAME(5)-PACK(6)-INDEX(3)` = 14 digits, e.g.
  `01967-012922-003 (057)`. The `(057)` is a check digit and is ignored. This is
  the one used for everything (identity, inventory, sales). `barcode.parse`.
- **Small (retail UPC-A)** — e.g. `8 14605 02661 3`. A 12/13-digit retail code
  with **no pack/ticket number**. The app recognizes it (`barcode.classify` →
  `retail`) and tells the clerk to scan the long one; it does **not** guess a
  game (no reliable UPC→game table).

`barcode.classify(raw)` returns `kind: 'ticket' | 'retail' | 'invalid'`, which
drives the scan UX: identify the ticket, redirect retail codes, or warn on junk
("not a valid lottery ticket"). Widths are configurable in Settings for other
states.

**Scanning paths:**
1. **USB scanner** (`hardware-scan.js`) — a keyboard-wedge listener active on
   every screen; scan from anywhere without focusing a field.
2. **Camera** (`scanner.js`) — picks an engine at runtime: native
   `BarcodeDetector` (Chrome/Edge/Android) → **ZXing** (`vendor/zxing.js`, for
   Safari/iOS/Firefox) → manual entry. High-res + autofocus + torch help the
   wide 1D (ITF) barcode. `POS.scanner.engine()` reports which is active.
3. **Manual entry** — digits-only with auto-inserted dashes, in every scan
   dialog (also catches hardware scanners).

---

## 8. Licensing scaffold (off by default)

`license.js` is the client half of subscription enforcement: every 15 minutes it
POSTs `{ app, key, deviceId, ts, usage }` to a configurable license server and
**locks the app** if the subscription is invalid/expired, with a 7-day offline
grace. It is **inert until a server URL + key are set** (Settings → License), so
demos/trials run freely. A browser app can't be made truly theft-proof — real
protection needs the server (and ideally a hosted-SaaS model). See
[LICENSING.md](LICENSING.md) for the server contract.

---

## 9. Testing

- `test/engine.test.js` — barcode parsing/classify + the sales/cash math + the
  history cascade. Pure functions, zero deps.
- `test/store.test.js` — store-level regressions (rollover, replace-modes,
  reverse, full-pack reverse) using a tiny in-memory `window`/`localStorage`
  shim so the real source loads in Node.
- Run both with `npm test`.

When changing money logic, add/extend these. The invariant to protect:
**sales only ever count tickets that were actually recorded as sold** (index
movement) or an explicit full-pack/sold-out choice — never unsold tickets.

---

## 10. Glossary

- **Bin** — a physical dispenser slot; holds one active pack.
- **Pack / book** — a roll of identical-game scratch tickets (e.g. 60 × $5).
- **Index** — tickets sold so far from a pack (0-based).
- **Segment** — one pack's stint in a bin during one day.
- **Rollover** — a pack sells out and the next is loaded in the same bin.
- **Register cash** — what should be in the drawer after the shift.
- **packKey** — `"GAME-PACK"`, the unique id for a physical pack.

---

## 11. Known limitations & next steps

Data is per-device (no cloud sync yet); no clerk accounts/audit log; client-side
licensing only; small UPC→game lookup intentionally disabled; phone cameras are
imperfect at the wide ITF barcode (a USB scanner is the reliable counter setup).
Full roadmap in [CHANGELOG.md](CHANGELOG.md#roadmap-upcoming).

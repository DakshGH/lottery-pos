# 🎟️ Lottery POS — Scratch-Off Inventory & Cash Tracker

A simple app for store owners who sell lottery scratch-offs. It virtualizes your
physical bins, tracks how many tickets each pack sells per day, manages
inventory and sold-out packs, and **auto-calculates how much cash should be in
the register** from your daily lottery report.

Runs on **any Windows or Linux device** — it's a self-contained local app, no
account needed. Seeded with the **New Jersey Lottery** game catalog. Scanning is
**camera-first** (QR / barcode), and USB hardware scanners + manual entry work
everywhere too.

---

## Run it

**Option A — open it directly (simplest)**
Double-click `index.html`. That's it. Everything works offline, data is saved on
the device.

**Option B — local server (recommended for daily use)**
```bash
node server.js          # then open http://localhost:5173
```
A clean URL avoids browser quirks and makes the optional online game-database
feature work.

**Option C — native desktop app (installer for Windows/Linux)**
See [Packaging as a desktop app](#packaging-as-a-desktop-app) below.

**Run the tests**
```bash
npm test                # verifies the math against the spec examples
```

---

## How a store owner uses it (daily)

1. **Start Day** (top-right). The app copies yesterday's ending indexes into
   today's starting indexes automatically.
2. **Sell tickets all day.** When a pack runs out, hit **New pack** on that bin,
   scan the replacement, set its start index → the old pack is auto-marked sold
   out. If a customer buys a whole pack, use **Sold-out (full)**.
3. **Receive a delivery?** Go to **Inventory → Add delivery** and scan each pack.
   Duplicates are rejected automatically.
4. **End Day.** Scan each bin to record its ending index, type the three figures
   from your lottery terminal report (online sales, online cashes, scratch
   cashes), and the app shows the **cash that should be in the register**. Close
   the day.
5. **History** lets you go back and fix any start/end index — changes cascade
   into later days and recalculate totals. **Reports** aggregates a week (or any
   range).

The **Scan any ticket** box at the top works anywhere: scan a ticket and the app
tells you what game/pack it is and what you can do with it.

---

## How the numbers work (verified against the spec)

- **Barcode** `GGGGG-PPPPPP-III` → game (5) / pack (6) / index (3) = 14 digits,
  e.g. real NJ ticket `01967-012922-003 (057)`. The `(057)` is a check digit and
  is ignored. The index is how many tickets have sold from that pack (fresh = 0).
  Widths are adjustable in **Settings** for other states.
- **Pack size** comes from price: `$1→200, $2→150, $3→100, $5→60, $10→30, $20/$25/$30/$40→20`
  (NJ price tiers; `$3` defaults to 100 tickets — overridable per game).
- **Daily sale per bin** = `end − start`. If a pack sold out and was replaced
  mid-day, the old pack counts `size − start` and the new pack counts `0 → end`.
- **Full-pack sale** adds `size × price` on top.
- **Register cash** = `scratch sales + online sales − online cashes − scratch cashes`.

These are checked by `npm test` and were validated live against the Day 1 / Day 2
example in the brief (Day 1 register = $195, Day 2 = $100).

---

## Project layout

```
index.html              app shell (loads everything)
server.js               zero-dependency static server (Option B)
styles/app.css          UI styling
data/games.seed.js      bundled "online" game catalog (game # → name, price)
data/games.seed.json    same data, JSON form (for a remote feed)
src/core/
  barcode.js            parse & validate scanned barcodes
  engine.js             pure sales/cash math + history cascade  (unit-tested)
  games.js              game-database lookup (local + remote)
  storage.js            localStorage persistence + backup export/import
  store.js              app state + every business action (the brain)
  license.js            subscription heartbeat / lock scaffold
src/ui/
  scanner.js            camera scanner: native BarcodeDetector -> ZXing -> manual
  hardware-scan.js      global USB keyboard-wedge scanner capture
  app.js                UI: views, day flows, scan wiring
vendor/zxing.js         vendored ZXing barcode library (offline camera decoding)
data/gen-nj-seed.js     regenerates the NJ catalog from the source game list
test/engine.test.js     zero-dependency tests
```

The math (`engine.js`) is isolated and tested, so the risky part is provable and
the UI stays thin.

---

## Scanning — two paths

Both the camera and a USB barcode scanner work everywhere.

**1. USB barcode scanner (keyboard-wedge)** — `src/ui/hardware-scan.js`.
A USB scanner "types" the barcode + Enter. This listens **app-wide**, so a clerk
can scan from any screen without clicking into a field first; the scanned ticket
is identified instantly. It stays out of the way when you're typing in a real
field or when the camera dialog is open. Tune `MAX_GAP_MS` / `MIN_LENGTH` there.

**2. Camera** — `src/ui/scanner.js`. The decoding engine is chosen at runtime:
1. native **`BarcodeDetector`** (Chrome / Edge / Android — fastest), else
2. **ZXing** — the common barcode library, vendored offline at `vendor/zxing.js`
   (`@zxing/library` UMD), used on Safari / iOS / Firefox, else
3. camera preview with **manual entry** if no decoder, or text/USB entry if no
   camera at all.
ZXing is hinted to the 1D formats on lottery tickets (ITF, Code 128, Code 39,
Codabar, EAN/UPC) plus QR. `POS.scanner.engine()` reports which is active.

Every scan point — the top **Scan** button, *Add delivery*, *New pack*, *Update
index*, *End day* — uses this. Camera access needs a secure context:
`http://localhost` (bundled server), the HTTPS GitHub Pages link, or the desktop
build all qualify.

> Updating the library: `curl -fsSL https://unpkg.com/@zxing/library@0.18.6/umd/index.min.js -o vendor/zxing.js`

## Game database — New Jersey

Seeded from the **NJ Lottery active scratch-offs** (`data/games.seed.js`, 120+
games). Game numbers are stored 5-digit to match the barcode game field (NJ game
`1967` → `01967`). Regenerate from the source list any time:

```bash
node data/gen-nj-seed.js
```

You can also **add/edit games** in **Settings → Game database** (you're prompted
the first time an unknown game is scanned), or point **Settings → Online game
database URL** at a JSON feed shaped like `data/games.seed.json` and hit
**Refresh**. The bundled catalog auto-updates on launch; your manual edits are
kept separately and always win.

> ⚠️ Verify prices and `$3` book sizes against your actual packs before relying
> on the totals for accounting.

## Fonts

The UI uses Bricolage Grotesque + Hanken Grotesk + JetBrains Mono from Google
Fonts (loaded once, then cached). Offline, it falls back to clean system fonts —
the app stays fully functional.

---

## Data & backups

Data lives on the device (browser local storage). It's private and offline.
Because clearing browser data would erase it, **use Settings → Export backup**
regularly (and **Import backup** to restore or move to another machine). The
desktop build (below) stores data in its own app profile.

---

## Packaging as a desktop app

The app is plain HTML/JS, so wrapping it in [Electron](https://electronjs.org)
gives you real Windows `.exe` and Linux `AppImage/.deb` installers. A ready
wrapper is in `desktop/`:

```bash
cd desktop
npm install            # installs electron + electron-builder
npm start              # run the desktop app locally
npm run dist           # build an installer for your current OS
```

Build Windows installers from Windows and Linux installers from Linux (or use a
CI matrix) for best results. Tauri is an alternative if you prefer tiny
binaries.

---

## Status & roadmap

**Working now:** camera QR/barcode scanning (with hardware-scanner & manual
fallback), barcode parsing, bins, inventory with duplicate detection, activate /
move / full-pack sale / reverse, sold-out archive with reversal, start/end day
with carry-over, register-cash calculation, history editing with forward
cascade, weekly/range reports, NJ game database (manual + remote), search,
backup export/import, desktop packaging path.

**Natural next steps:** multi-register / cloud sync across devices, role-based
PINs for clerks vs. owner, printable end-of-day & weekly PDF, a real
state-lottery data feed, and an IndexedDB/SQLite backend for very large
histories.

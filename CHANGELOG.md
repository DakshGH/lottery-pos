# Lottery POS — Changelog & Roadmap

Scratch-off lottery inventory & cash-reconciliation app for New Jersey stores.
Local-first web app (no build step), deployable as a static site or desktop app.

- **Live demo:** https://dakshgh.github.io/lottery-pos/
- **Repo:** https://github.com/DakshGH/lottery-pos
- **Related docs:** [README.md](README.md) · [PRICING.md](PRICING.md) · [LICENSING.md](LICENSING.md)

Versioning is informal (one entry per shipped milestone). Newest first.

---

## Shipped

### v0.11 — Simpler replace (swap option removed) · 2026-06-22
- Per store feedback, removed the "swap out" choice when replacing a pack.
  Activating into an occupied bin is now always a **rollover** (old pack → sold
  out). The activate dialog shows a note of exactly what it adds (e.g. *"+$600"*)
  so it's explicit, and **Reverse** cleanly undoes it if it was a mistake.

### v0.10 — Rollover / replace / reverse fixes · 2026-06-22
A reported bug surfaced a cluster of defects in the replace flow:
- **Phantom revenue:** activating a pack into an occupied bin marked the old
  pack's segment "completed", counting *all* its remaining tickets as sold —
  e.g. a fresh $30 pack added a fake **+$600**. (v0.10 added a "sold out" vs
  "swap" choice; v0.11 simplified this back to rollover-only with a clear note.)
- **Broken reverse:** reversing a sold-out pack dumped it to inventory and left
  earnings inflated. `reverseSoldOut` now **undoes the replacement** (sends the
  replacer back to inventory, restores the pack to its bin) and **reverts the
  sales**. Cross-day reversals correct the past day without disturbing later days.
- Added a Node store-test harness (`test/store.test.js`).
- See [ARCHITECTURE.md](ARCHITECTURE.md) for the full data model & flows.

### v0.9 — Small-barcode handling corrected · 2026-06-22
- Removed game-guessing from the small **retail (UPC)** barcode. There's no
  reliable public UPC→game table and one seeded mapping led to **wrong games**
  (e.g. showing "Power 10X" for a Goooalll ticket after a stray link). The small
  barcode now just identifies itself as the retail code and points the clerk to
  the **long** barcode, which identifies every game correctly — right for all games.
- `classify()` still recognizes retail vs ticket vs invalid; the long barcode
  remains the source of truth for game / pack / inventory / sales.

### v0.8 — Two-barcode awareness + fake-ticket safety · 2026-06-22
Tickets carry **two** barcodes: the long **validation** code (game-pack-index)
and a small **UPC-A retail** code; they hold different data.
- `barcode.classify()` routes any scan to **ticket / retail / invalid** by length.
- The retail code has **no pack number**, so inventory / activate / update /
  end-day tell the clerk to scan the long barcode instead.
- **Warnings:** a clear modal for unrecognized / likely-fake barcodes, and an
  amber warning when a scanned ticket's game isn't in the NJ catalog.
- (A learnable UPC→game alias was tried here and reverted in v0.9 — see above.)

### v0.7 — Mobile camera hardening · 2026-06-22
- High-resolution rear camera (1920×1080 ideal) + **continuous autofocus** to
  resolve the thin bars of the Interleaved-2-of-5 barcode.
- **Torch/flashlight** toggle when the device supports it.
- iOS autoplay fix; faster decode cadence; clearer on-screen guidance.

### v0.6 — Barcode format fix (the big one) · 2026-06-22
- Real NJ barcode is **game(5) + pack(6) + index(3) = 14 digits**; the printed
  `(NNN)` is a check digit, not a field. Default was 7-digit pack, so every real
  ticket failed to parse. Fixed widths to 5-6-3; parser now ignores trailing
  check digits; **existing installs auto-migrate** from 5-7-3.

### v0.5 — Cross-browser scanning · 2026-06-21
- Vendored **ZXing** (`vendor/zxing.js`) so the camera works on Safari / iOS /
  Firefox (native `BarcodeDetector` still used on Chrome/Edge/Android).
- New **USB hardware-scanner** capture (`src/ui/hardware-scan.js`) — scan from
  any screen, no field focus needed; ignores normal typing.

### v0.4 — QA pass & fixes · 2026-06-20
- **Fixed money bug:** selling an active, partly-sold pack as a "full pack"
  double-counted the remainder (segment now closes at currentIndex).
- Scanning a trashed pack mislabeled it "sold out" → now "in trash" + restore.
- `findPackByKey` prefers the live pack; money fields restricted to number+decimal.
- License lock screen has a trial-mode escape only when never verified.

### v0.3 — Operations & business features · 2026-06-19
- Digits-only masked entry with auto-dashes; inventory add is game+pack only.
- **Inventory Trash** (soft-delete / restore / empty).
- **Swap** two bins' contents.
- Day **start/end times** captured and shown in History.
- **PDF export** of daily and weekly/range reports (browser print).
- **License scaffold** (`src/core/license.js`): 15-min heartbeat, device id,
  usage telemetry, lockout w/ 7-day offline grace — OFF until a server is set.
- "Load sample data" in Settings; global search; notification bell with alerts.

### v0.2 — Design & deploy · 2026-06-19
- UI iterated to a **professional, flat, neutral** desktop-tool look (after
  trying gold / blue / vibrant); system fonts; no emojis.
- Deployed free on **GitHub Pages**.

### v0.1 — Core build · 2026-06-19
- Engine (barcode parse, sales/cash math, history cascade) — pure & unit-tested;
  verified against the Day 1 / Day 2 worked example (register $195 / $100).
- Store (bins, inventory, sold-out, day lifecycle), localStorage persistence,
  camera scanner (native), zero-dep server, Electron wrapper, **real NJ catalog**
  (120+ games incl. $3 and $40 tiers).

---

## Known limitations (today)
- **Data is per-device** (browser storage). Clearing data or switching devices
  loses history → export backups; cloud sync is the real fix (roadmap).
- **No clerk accounts / audit log** — anyone on the device can edit history.
- **Camera vs. ITF:** phone cameras are imperfect at this wide 1D barcode; a USB
  scanner or manual entry is the reliable counter setup.
- **License enforcement is client-side only** until the server is built — see
  [LICENSING.md](LICENSING.md). Not theft-proof yet.
- **Small-UPC scope unconfirmed:** need to verify the retail code is stable
  per-game (vs per-price) across multiple tickets before relying on it.
- **$3 pack size (100)** is an estimate — confirm against a real $3 pack.

---

## Roadmap (upcoming)

**Next up**
- [ ] Confirm small-UPC behavior across tickets; map per-game or per-price accordingly.
- [ ] **Cloud sync / accounts** so data survives device loss and works on multiple registers (highest-value for real use).
- [ ] **Clerk PINs + audit log** of who changed what (theft accountability).

**Licensing / business**
- [ ] Build the **license server** (heartbeat validate + admin to issue/revoke keys, view active installs) per [LICENSING.md](LICENSING.md).
- [ ] Move toward a **hosted SaaS** model for real anti-piracy + recurring revenue.
- [ ] Wire subscription plans (6-month / yearly) to the license server.

**Product**
- [ ] Auto-updating NJ catalog from a remote feed (Settings → URL already supported).
- [ ] Branded / printable end-of-day & weekly PDF with store logo.
- [ ] Multi-store dashboard for chains.
- [ ] Native installers (Windows `.exe`, Linux AppImage) via the `desktop/` Electron wrapper.
- [ ] Low-stock & end-of-game alerts; reorder suggestions.

**Polish**
- [ ] Tap-to-focus / scan-region box for faster camera reads.
- [ ] Expand other states beyond NJ (barcode widths already configurable).

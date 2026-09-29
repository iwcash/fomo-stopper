# FOMO Stopper

**A behavioral-finance pre-trade interception tool by Investor Cognition Lab.**

> Study the investor, not just the market.

When you click a Buy/Sell order button on TradingView, FOMO Stopper holds the
click *before the order fires* and asks three questions:

1. **What emotion is pushing this decision?** (FOMO / Fear / panic /
   Revenge (making back a loss) / Boredom / Conviction — my plan says so).
   Choosing FOMO or Revenge shows a short warning note.
2. **Would I still take this trade 10 minutes from now?** (Yes / No)
3. **What would prove me wrong?** (free text: at least 10 characters, or 5
   if it contains Chinese/Japanese/Korean). Non-answers such as "idk",
   "我不知道", repeated characters, or keyboard mashing are rejected with a
   nudge; the list lives in `isNonAnswer()` in `content.js`.

Two buttons:

- **Cancel this order** (the default, highlighted) — also triggered by ✕ and
  Esc. Logs a cancelled decision and shows a short "You just beat FOMO"
  screen.
- **Place it anyway** — locked until all three answers are valid, then a
  10-second countdown (can be turned off in settings). It re-dispatches your
  original click; the order proceeds exactly as if the extension didn't
  exist.

Every interception is logged locally, and the popup shows your stats: total
interceptions, % cancelled, emotion breakdown, and your current streak of
answered prompts — plus a "Share my stats" button that renders a downloadable
image card (nothing is ever posted anywhere).

---

## What it never does

This extension runs on financial pages, so it is built to be trivially
auditable. Read the source — it's short and unminified. Specifically:

- **No network requests. Ever.** No analytics, no telemetry, no external
  scripts, no fonts, no CDNs. There is no code path that talks to any server.
  The modal links to the Investor Cognition Lab YouTube channel (footer link
  and the "See what your brain was doing" button, both from `YOUTUBE_URL` in
  `content.js`); they open in a new tab only when *you* click them, send no
  data, and are hidden if the constant is empty.
- **No reading of account data.** It never reads, scrapes, or touches your
  balances, positions, order history, or any other page content. The only
  page data it inspects is the element you clicked (and its ancestors), to
  decide whether the click was an order button.
- **No broad permissions.** Manifest V3 with exactly one permission
  (`storage`) and a content script scoped to `https://*.tradingview.com/*`
  only. No `<all_urls>`, no background service worker, no tabs/history/
  cookies access. The two bundled images (logo and cat photo) are exposed to
  tradingview.com via
  `web_accessible_resources` (not a permission) with `use_dynamic_url`, so
  pages can't use a fixed URL to detect that the extension is installed.
- **All data stays in `chrome.storage.local`** on your machine. "Share my
  stats" draws a PNG on a local canvas and triggers a download — it never
  uploads or auto-posts.

## Fail-open by design

If TradingView ships an update that breaks our button detection, the
extension **silently does nothing** — it will never block you from trading.
Every detection and interception path is wrapped so an internal error lets
the click pass through untouched. Two extra safety valves:

- After you confirm a trade, an ~8-second grace window lets TradingView's own
  "Confirm order" dialog through without a second prompt.
- If the original button was re-rendered away while the modal was open (so
  the click can't be re-dispatched), the same grace window lets your next
  manual click go straight through.

## How interception works

1. A single `click` listener on `document` in the **capture phase** sees
   clicks before TradingView's handlers do.
2. The clicked element is matched against three tiers of detection:
   known TradingView `data-name` submit-button identifiers → a
   `type="submit"` button inside an order-ticket container → a button whose
   text starts with "Buy"/"Sell" inside an order-ticket container. Buttons
   with `role="tab"` or `aria-selected` are never matched, so the Buy/Sell
   *side* tabs are left alone — only the final submit is gated.
3. On a match: `preventDefault()` + `stopImmediatePropagation()`, then the
   modal opens (in a shadow root, so page CSS can't interfere). Keyboard
   and text-input events are stopped at the modal, and focus is pulled back
   if the page grabs it, so typing never triggers TradingView hotkeys such
   as "type anywhere to open Symbol Search".
4. On "Place it anyway": a one-shot bypass flag is set for that exact
   element and `button.click()` re-dispatches the original action.

Known limitation: interception hooks the `click` event. If a broker panel
fires orders on `mousedown` instead, that panel won't be intercepted (fail
open, never fail closed).

## Install (unpacked, dev mode)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this `fomo-stopper/` folder.
4. The FOMO Cat icon appears in your toolbar.

## Testing against TradingView paper trading

1. Go to `https://www.tradingview.com/chart/` (a free account is fine).
2. Open the **Trading Panel** tab at the bottom of the chart and connect
   **Paper Trading** (TradingView's built-in simulator — no real broker, no
   real money).
3. Click **Buy** or **Sell** on the order panel to open the order ticket,
   set a quantity, and click the final submit button (e.g. "Buy 100 AAPL MKT").
4. The FOMO Stopper modal should appear **instead of** the order firing.
   Answer the three questions and wait out the countdown on
   **Place it anyway**.
5. Click **Place it anyway**: the paper order should now execute in the
   panel (TradingView may show its own confirm dialog first — that click
   passes through thanks to the grace window).
6. Repeat and click **Cancel this order** (or ✕, or Esc): the "You just
   beat FOMO" screen appears and the order should *not* execute.
7. Open the extension popup: your interceptions, cancel rate, emotion
   breakdown, and streak should be there. Try **Share my stats** to download
   the image card.
8. In popup **Settings**, toggle the countdown off and verify
   **Place it anyway** unlocks as soon as the answers are valid; toggle **Extension enabled** off and verify orders
   fire with no modal at all.

There is also a self-contained offline harness in [`test/harness.html`](test/harness.html)
that simulates order buttons and a stubbed `chrome.storage` — useful for
verifying the interception flow without touching TradingView at all.

## Publishing to the Chrome Web Store

- `./package.sh` checks the manifest against store limits (description ≤ 132
  characters, icon sizes, every referenced file present, no network APIs) and
  builds `dist/fomo-stopper-<version>.zip` from an allowlist of files.
- `store/shoot.sh` renders the five 1280×800 screenshots and the 440×280 promo
  tile from the real extension code.
- `store/LISTING.md` has every dashboard field ready to paste, including the
  privacy-tab answers and permission justifications.
- `PRIVACY.md` is the privacy policy; the store needs it at a public URL.

## Data schema

`chrome.storage.local`:

```
fomo_settings: { enabled: boolean, countdownEnabled: boolean }
fomo_log: [
  {
    timestamp:    ISO-8601 string,
    emotion:      string,
    tenMinAnswer: "Yes" | "No",
    wrongIf:      string,
    answered:     boolean,   // all three answers were valid at decision time
    outcome:      "placed" | "cancelled"
  }, ...
]
```

Cancelling without valid answers (`answered: false`) breaks the answer
streak. Logs from before v2 may contain `outcome: "dismissed"` (closed with
Escape), which is treated the same way. The log is capped at 5,000 entries.

## Contributing and reporting problems

Issues and pull requests are welcome. The most useful report is "the pause
stopped appearing" after a TradingView update, with the order button's HTML
(right-click the button → Inspect → copy the element). The bar for merging is
that the code stays short, readable, and obviously local: no network
requests, no new permissions, no minified code.

Privacy or security questions: fomo_cat@investorcognitionlab.com

## License

The **code** is MIT-licensed — see [LICENSE](LICENSE).

The **brand assets are not** covered by the MIT license. They are © Investor
Cognition Lab, all rights reserved, and may not be reused in forks or other
products:

- the names "FOMO Stopper", "FOMO Cat" and "Investor Cognition Lab"
- the FOMO Cat photos and icons: `icons/icon16.png`, `icons/icon32.png`,
  `icons/icon48.png`, `icons/icon128.png`, `icons/cat.jpg`
- the Investor Cognition Lab logo: `icons/icl-logo.png`
- everything under `store/screenshots/` and `store/brand/`, plus
  `store/promo-tile-440x280.png` and `store/og-fomo-stopper-1200x630.png`

If you publish a fork, give it a different name and replace these files with
your own.

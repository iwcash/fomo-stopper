# Chrome Web Store submission — copy/paste sheet

Everything to type into the Chrome Web Store Developer Dashboard, field by
field.

Upload: `dist/fomo-stopper-<version>.zip`, built by `./package.sh`.

---

## Store listing tab

**Name** (from manifest): FOMO Stopper

**Summary** (from manifest, 131/132 chars):
Stop FOMO trades on TradingView. Answer 3 quick questions before your order goes through. 100% local, no tracking, no account data.

**Category:** Productivity → Workflow & Planning

**Language:** English (add Chinese (Traditional) below as a second listing language)

**Description — English** (plain text; the store does not render Markdown):

```
Most bad trades start with a feeling, not a plan.

FOMO Stopper puts a pause between your click and your broker. When you press Buy or Sell on TradingView, the order is held, and you answer three questions first:

1. What emotion is pushing this decision?
2. Would I still take this trade 10 minutes from now?
3. What would prove me wrong?

Then you choose: cancel the order, or place it anyway after a 10-second countdown.

HOW IT HELPS
- Names the emotion. Picking "FOMO" or "Revenge" out loud is often enough to stop the trade.
- Asks for an exit before the entry. If you can't say what would prove you wrong, you don't have a thesis yet. Answers like "idk" or keyboard mashing are not accepted.
- Keeps score. The popup shows how many orders you paused, how many you cancelled, your most common trigger, and your answer streak. Download a stats card to share your progress.

PRIVATE BY DESIGN
- 100% local. Your answers are stored only in your own browser. No servers, no accounts, no analytics, no tracking.
- Never reads your account. It does not read balances, positions, orders, or anything else on the page. It only checks whether the button you clicked is an order button.
- Minimal permissions. Runs only on tradingview.com. Uses local storage and nothing else.
- Fails open. If TradingView changes its page and the extension can't recognize a button, your trading is never blocked.
- Open source under the MIT license. Read every line: https://github.com/iwcash/fomo-stopper

Works with TradingView's order panel, including Paper Trading.

FOMO Stopper is an educational tool from Investor Cognition Lab. It is not investment advice. Not affiliated with or endorsed by TradingView.

Study the investor, not just the market.
```

**Description — 繁體中文:**

```
大多數的爛交易，都是從一種感覺開始，而不是一個計畫。

FOMO Stopper 在你的點擊和券商之間加上一次暫停。當你在 TradingView 按下 Buy 或 Sell，訂單會先被攔住，你要先回答三個問題：

1. 是什麼情緒在推動這個決定？
2. 十分鐘後，我還會做這筆交易嗎？
3. 什麼情況會證明我錯了？

接著由你決定：取消這筆單，或在 10 秒倒數後照樣送出。

它怎麼幫你
- 說出情緒。親手選出「FOMO」或「報復性交易」，往往就足以讓你停手。
- 進場前先想好出場。說不出什麼會證明你錯，代表你還沒有論點，只有感覺。「不知道」或亂打的答案不會被接受。
- 記錄成績。彈出視窗會顯示你暫停了幾筆單、取消了幾筆、最常見的情緒觸發點，以及連續認真作答的次數，還能下載成績圖卡分享。

隱私優先
- 100% 在本機運作。你的答案只存在你自己的瀏覽器裡。沒有伺服器、沒有帳號、沒有分析、沒有追蹤。
- 絕不讀取你的帳戶。不讀餘額、持倉、訂單或頁面上的任何資料，只判斷你點的按鈕是不是下單按鈕。
- 最少權限。只在 tradingview.com 上執行，只使用本機儲存空間。
- 失效時放行。如果 TradingView 改版導致無法辨識按鈕，絕不會擋住你的交易。
- 以 MIT 授權開放原始碼，每一行程式碼都能檢查：https://github.com/iwcash/fomo-stopper

支援 TradingView 的下單面板，包含模擬交易（Paper Trading）。

FOMO Stopper 是 Investor Cognition Lab 的教育工具，不構成投資建議。與 TradingView 無關聯，亦未獲其背書。

Study the investor, not just the market.
```

**Graphic assets:**

| Field | Size | File |
|---|---|---|
| Store icon | 128×128 PNG | `icons/icon128.png` (in the zip) |
| Screenshots (max 5) | 1280×800 PNG | `store/screenshots/1-pause.png` … `5-privacy.png` |
| Small promo tile | 440×280 PNG | `store/promo-tile-440x280.png` |
| Marquee (optional) | 1400×560 PNG | not needed |

Screenshots and the promo tile are rendered from the real extension code by
`store/shoot.sh` (headless Chrome over `store/stage.html`). Re-run it after
any UI change. `SHOTS="pause fomo countdown cancelled stats" store/shoot.sh`
picks a different set of five.

**Official URL:** none (leave empty unless you verify a domain in Search Console)
**Homepage URL:** https://www.investorcognitionlab.com/fomo-stopper
**Support URL:** https://www.investorcognitionlab.com/fomo-stopper#support (contact: fomo_cat@investorcognitionlab.com)

---

## Privacy tab

**Single purpose description:**

```
FOMO Stopper pauses Buy/Sell order clicks on TradingView and asks the user three reflective questions before the order is sent, then lets the user cancel or place the order.
```

**Permission justifications:**

`storage`:
```
Saves the user's answers, decision (placed or cancelled), and two on/off settings in chrome.storage.local so the popup can show the user's own statistics. Nothing is transmitted anywhere.
```

Host permission (`https://*.tradingview.com/*`, from the content script):
```
The content script detects clicks on TradingView's order buttons so it can pause the order and show the three questions. It only inspects the clicked button and never reads account data, balances, positions, or other page content. It runs on no other site.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage — what user data do you collect?** Check nothing. (Answers are stored
locally in the user's browser and never collected or transmitted, which is not
"collection" under the store's definition.)

**Certify all three:**
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://www.investorcognitionlab.com/fomo-stopper/privacy

---

## Distribution tab

**Visibility:** start with Unlisted (only people with the link can install),
switch to Public after a round of feedback.

**Regions:** All regions.

**Trader / non-trader declaration (EU):** required by the dashboard. Choose
"trader" if you distribute it as part of a business (Investor Cognition Lab
promotes a channel, so this is likely "trader"; the store then shows your
contact details to EU users). This is your call.

---

## Before each release

1. Bump `version` in `manifest.json` (the store rejects a re-used version).
2. Run `./package.sh` (fails if anything would be rejected).
3. Load `dist/` contents unpacked once and click through the modal.
4. Upload the new zip under Package → Upload new package.

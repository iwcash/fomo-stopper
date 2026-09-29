/*
 * FOMO Stopper — content script
 * Investor Cognition Lab
 *
 * Intercepts Buy/Sell order-button clicks on TradingView (capture phase),
 * asks three reflective questions, then either re-dispatches the original
 * click or logs a cancelled decision.
 *
 * Design rules (non-negotiable):
 *  - 100% local. The only browser API used is chrome.storage.local.
 *  - Never reads account data, balances, or positions. The only page data
 *    touched is the clicked element and its ancestors, to decide whether
 *    the click was an order button.
 *  - Fail open: every detection path is wrapped so that an exception can
 *    never block a click. If selectors stop matching, nothing happens.
 */

(() => {
  'use strict';

  if (window.__fomoStopperActive) return;
  window.__fomoStopperActive = true;

  const COUNTDOWN_SECONDS = 10;
  const MIN_WRONGIF_CHARS = 10;
  const MIN_WRONGIF_CHARS_CJK = 5;
  const MAX_LOG_ENTRIES = 5000;

  // Grace window after a confirmed trade so TradingView's own
  // "Confirm order" dialog (whose button also says "Buy ...") is not
  // double-prompted, and so a failed re-dispatch never traps the user.
  const POST_CONFIRM_GRACE_MS = 8000;

  // The only outbound link in the extension (Screen 1 footer and the
  // Screen 3 button). It is opened solely by the user's own click, in a
  // new tab; leave empty to hide both.
  const YOUTUBE_URL = 'https://www.youtube.com/channel/UCsiYoLj8YIiQdOii0s1QRqA';
  const FOOTER_HOOK = 'Your brain just tried to trade. See why →';

  const EMOTIONS = [
    'FOMO',
    'Fear / panic',
    'Revenge (making back a loss)',
    'Boredom',
    'Conviction — my plan says so',
  ];
  const NUDGE_EMOTIONS = ['FOMO', 'Revenge (making back a loss)'];

  const DEFAULT_SETTINGS = { enabled: true, countdownEnabled: true };
  let settings = { ...DEFAULT_SETTINGS };

  // ------------------------------------------------------------------
  // Settings (storage errors leave defaults in place — never throw)
  // ------------------------------------------------------------------
  try {
    chrome.storage.local.get({ fomo_settings: DEFAULT_SETTINGS }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && typeof res.fomo_settings === 'object') {
        settings = { ...DEFAULT_SETTINGS, ...res.fomo_settings };
      }
    });
    chrome.storage.local.onChanged.addListener((changes) => {
      if (changes.fomo_settings && typeof changes.fomo_settings.newValue === 'object') {
        settings = { ...DEFAULT_SETTINGS, ...changes.fomo_settings.newValue };
      }
    });
  } catch (_) {
    /* fail open: run with defaults */
  }

  // ------------------------------------------------------------------
  // Order-button detection
  // ------------------------------------------------------------------

  // Tier 1: known TradingView data-name identifiers for the order-ticket
  // submit button. These are the most specific and least likely to
  // false-positive.
  const SUBMIT_SELECTORS = [
    'button[data-name="place-and-modify-button"]',
    'button[data-name="place-order-button"]',
    'button[data-name*="submit-order"]',
  ];

  // Tier 2/3 require the button to live inside an order-ticket-like
  // container, so ordinary page buttons whose text happens to start with
  // "Buy" are never touched.
  const CONTEXT_SELECTORS = [
    '[data-name="order-ticket"]',
    '[data-name="trading-order-panel"]',
    '[data-dialog-name*="order"]',
    '[class*="orderTicket"]',
    '[class*="order-ticket"]',
    '[class*="orderPanel"]',
    '[class*="order-panel"]',
    '[class*="orderForm"]',
    '[class*="order-form"]',
  ];

  const BUY_SELL_TEXT = /^\s*(buy|sell)\b/i;

  function matchOrderButton(target) {
    try {
      if (!(target instanceof Element)) return null;
      const btn = target.closest('button, [role="button"]');
      if (!btn) return null;

      // Never gate side tabs / toggles — only the final submit action.
      if (btn.getAttribute('role') === 'tab' || btn.hasAttribute('aria-selected')) return null;
      if (btn.disabled) return null;

      for (const sel of SUBMIT_SELECTORS) {
        if (btn.matches(sel)) return btn;
      }

      const inOrderContext = CONTEXT_SELECTORS.some((sel) => btn.closest(sel) !== null);
      if (!inOrderContext) return null;

      if (btn.type === 'submit') return btn;

      const text = (btn.textContent || '').trim();
      if (text && BUY_SELL_TEXT.test(text)) return btn;

      return null;
    } catch (_) {
      return null; // fail open
    }
  }

  // ------------------------------------------------------------------
  // Click interception
  // ------------------------------------------------------------------
  let bypassTarget = null; // exact element allowed through once
  let bypassUntil = 0;
  let globalBypassUntil = 0; // grace window (post-confirm / re-dispatch failure)
  let modalOpen = false;

  function onClickCapture(event) {
    try {
      if (!settings.enabled) return;
      if (modalOpen) return;

      const now = Date.now();
      if (now < globalBypassUntil) return;

      if (bypassTarget && now < bypassUntil) {
        const t = event.target;
        const sameButton =
          t === bypassTarget ||
          bypassTarget.contains(t) ||
          (t instanceof Element && t.closest('button, [role="button"]') === bypassTarget);
        if (sameButton) {
          bypassTarget = null;
          bypassUntil = 0;
          return; // let the re-dispatched click through
        }
      }

      const btn = matchOrderButton(event.target);
      if (!btn) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      openModal(btn);
    } catch (_) {
      /* fail open: never block a click on our own error */
    }
  }

  document.addEventListener('click', onClickCapture, true);

  // ------------------------------------------------------------------
  // Local log (the only data ever written; the only key ever read is ours)
  // ------------------------------------------------------------------
  function saveLogEntry(entry) {
    try {
      chrome.storage.local.get({ fomo_log: [] }, (res) => {
        if (chrome.runtime.lastError) return;
        try {
          const log = Array.isArray(res.fomo_log) ? res.fomo_log : [];
          log.push(entry);
          if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES);
          chrome.storage.local.set({ fomo_log: log });
        } catch (_) {}
      });
    } catch (_) {}
  }

  // ------------------------------------------------------------------
  // Q3 validation: minimum length and non-answer detection
  // ------------------------------------------------------------------
  const NON_ANSWER_PHRASES = [
    'idk', "i don't know", "don't know", 'dont know', 'no idea', 'not sure',
    'nothing', 'n/a', '不知道', '不確定', '不清楚', '沒有', '隨便',
  ];
  const MASH_SEQUENCES = ['asdf', 'qwer', 'zxcv', 'jkl'];
  const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

  function isNonAnswer(raw) {
    const text = raw.trim().toLowerCase().replace(/[‘’]/g, "'");
    if (!text) return false;
    if (NON_ANSWER_PHRASES.some((p) => text.includes(p))) return true;
    // Digits are excluded so price levels like 10000 are not flagged.
    if (/([^\d\s])\1{3,}/u.test(text)) return true;
    if (/^[a-z]{8,}$/.test(text) && !/[aeiou]/.test(text)) return true;
    const compact = text.replace(/\s+/g, '');
    return MASH_SEQUENCES.some((s) => compact.includes(s));
  }

  function minWrongIfLength(text) {
    return CJK.test(text) ? MIN_WRONGIF_CHARS_CJK : MIN_WRONGIF_CHARS;
  }

  // ------------------------------------------------------------------
  // Modal (isolated in a shadow root so page CSS can't leak in or out)
  // ------------------------------------------------------------------
  let host = null;
  let shadow = null;
  let countdownTimer = null;

  const FONT_DISPLAY = "'Newsreader', Georgia, serif";
  const FONT_BODY = "'IBM Plex Sans', 'Helvetica Neue', system-ui, sans-serif";
  const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

  const MODAL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(5, 7, 12, 0.72);
      display: flex; align-items: center; justify-content: center;
      font-family: ${FONT_BODY};
      -webkit-font-smoothing: antialiased;
    }
    .card {
      position: relative;
      width: min(440px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      background: #121829;
      border: 1px solid #262E45;
      border-radius: 14px;
      padding: 28px;
      color: #ECEAE3;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      display: flex; flex-direction: column; gap: 22px;
    }
    .eyebrow {
      font-family: ${FONT_MONO}; font-size: 11px; font-weight: 600;
      letter-spacing: 0.18em; color: #D8B45A; text-transform: uppercase;
    }
    .head { padding-right: 48px; }
    .head .eyebrow { margin-bottom: 6px; }
    h1, h2 { font-family: ${FONT_DISPLAY}; font-weight: 500; color: #F3F1EA; }
    h1 { font-size: 28px; line-height: 1.15; }
    h2 { font-size: 32px; line-height: 1.15; }
    .sub { font-size: 14px; line-height: 1.5; color: #A9AFC0; margin-top: 10px; }
    .close {
      position: absolute; top: 24px; right: 24px;
      width: 36px; height: 36px; min-height: 0;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid #2C3550; border-radius: 8px;
      color: #A9AFC0; cursor: pointer;
    }
    .close:hover { color: #F3F1EA; border-color: #A9AFC0; }
    .field { display: flex; flex-direction: column; gap: 10px; border: 0; }
    .q-label { font-size: 14px; font-weight: 600; color: #ECEAE3; }
    select, textarea {
      width: 100%; background: #0B1020; color: #ECEAE3;
      border: 1px solid #2C3550; border-radius: 8px;
      font: inherit; font-size: 14px;
    }
    select { height: 44px; padding: 0 12px; cursor: pointer; }
    select:invalid { color: #8990A3; }
    select option { color: #ECEAE3; background: #0B1020; }
    textarea { padding: 12px; line-height: 1.5; resize: vertical; min-height: 88px; }
    textarea::placeholder { color: #8990A3; }
    select:focus-visible, textarea:focus-visible { outline: none; border-color: #D8B45A; }
    select.gold { border-color: #D8B45A; }
    textarea.warn { border-color: #E7B45C; }
    .note { font-size: 13px; line-height: 1.4; color: #E7B45C; }
    .helper { font-size: 12px; color: #8990A3; }
    .radio-row { display: flex; gap: 12px; }
    .radio-row label {
      flex: 1; height: 44px;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      border: 1px solid #2C3550; border-radius: 8px;
      font-size: 14px; cursor: pointer; user-select: none;
    }
    .radio-row input { accent-color: #D8B45A; width: 16px; height: 16px; margin: 0; }
    .radio-row label:has(input:checked) { background: #1C1D22; border-color: #D8B45A; }
    .radio-row label:has(input:focus-visible) { outline: 2px solid #D8B45A; outline-offset: 2px; }
    .nudge {
      background: #221E12; border: 1px solid #5A4A22; border-radius: 8px;
      padding: 14px; display: flex; flex-direction: column; gap: 8px;
    }
    .nudge-quote { font-family: ${FONT_DISPLAY}; font-size: 17px; line-height: 1.35; color: #F3F1EA; }
    .nudge-sub { font-size: 12px; color: #A9AFC0; }
    .actions { display: flex; flex-direction: column; gap: 12px; }
    button, .btn {
      font: inherit; font-size: 15px; font-weight: 600;
      width: 100%; min-height: 44px; border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      text-decoration: none; border: 1px solid transparent;
    }
    .primary { height: 48px; background: #D8B45A; color: #16130A; border-color: #D8B45A; }
    .primary:hover { background: #EBCB78; border-color: #EBCB78; }
    .secondary { height: 48px; background: transparent; color: #ECEAE3; border-color: #2C3550; }
    .secondary:not(:disabled):hover { border-color: #A9AFC0; }
    .secondary:disabled { color: #8990A3; cursor: not-allowed; }
    button:focus-visible, .btn:focus-visible, a:focus-visible {
      outline: 2px solid #D8B45A; outline-offset: 2px;
    }
    .footer {
      border-top: 1px solid #262E45; padding-top: 20px;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      text-align: center;
    }
    .brand-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #A9AFC0; }
    .brand-row img { width: 20px; height: 20px; object-fit: contain; }
    .footer a { font-size: 12px; font-weight: 600; color: #D8B45A; text-decoration: none; }
    .footer a:hover { color: #EBCB78; }
    .done { text-align: center; align-items: center; padding-top: 36px; }
    .cat { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .cat img {
      width: 112px; height: 112px; border-radius: 50%;
      border: 2px solid #D8B45A; object-fit: cover;
    }
    .caption { font-size: 12px; font-style: italic; color: #A9AFC0; }
    .done .sub { margin-top: -8px; }
    .done .actions, .done .footer { align-self: stretch; }
    .helper-line { font-size: 12px; color: #8990A3; margin-top: -4px; }
    [hidden] { display: none !important; }
  `;

  const CLOSE_ICON =
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const PLAY_ICON =
    '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="3.5" width="17" height="13" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7.2v5.6l4.8-2.8z" fill="currentColor"/></svg>';

  function assetURL(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch (_) {
      return '';
    }
  }

  function footerHTML(withLink) {
    return `
      <div class="footer">
        <div class="brand-row">
          <img class="brand-logo" alt="Investor Cognition Lab logo">
          <span>Study the investor, not just the market.</span>
        </div>
        ${withLink ? `<a class="yt-link" target="_blank" rel="noopener noreferrer">${FOOTER_HOOK}</a>` : ''}
      </div>`;
  }

  // Assets and links are wired after render so a missing extension
  // context (or empty URL) simply hides them instead of throwing.
  function wireAssetsAndLinks() {
    const logoURL = assetURL('icons/icl-logo.png');
    shadow.querySelectorAll('.brand-logo').forEach((img) => {
      if (logoURL) img.src = logoURL;
      else img.hidden = true;
    });
    const catImg = shadow.querySelector('.cat img');
    if (catImg) {
      const catURL = assetURL('icons/cat.jpg');
      if (catURL) catImg.src = catURL;
      else shadow.querySelector('.cat').hidden = true;
    }
    shadow.querySelectorAll('.yt-link').forEach((a) => {
      if (YOUTUBE_URL) a.href = YOUTUBE_URL;
      else a.hidden = true;
    });
  }

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('div');
    host.id = 'fomo-stopper-host';
    shadow = host.attachShadow({ mode: 'open' });

    // Typing inside the shadow root is retargeted to the host <div>, so
    // page-level hotkeys (TradingView opens Symbol Search on any letter
    // typed outside an input) think the user is typing on the chart.
    // Keep every keyboard/text event from leaving the modal.
    for (const type of [
      'keydown', 'keyup', 'keypress', 'beforeinput', 'input',
      'compositionstart', 'compositionupdate', 'compositionend',
    ]) {
      host.addEventListener(type, (e) => e.stopPropagation());
    }

    shadow.addEventListener('keydown', trapTab);
    document.documentElement.appendChild(host);
  }

  function focusables() {
    const card = shadow && shadow.querySelector('.card');
    if (!card) return [];
    return [...card.querySelectorAll('button, select, textarea, input, a[href]')].filter(
      (el) => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0
    );
  }

  function trapTab(e) {
    if (e.key !== 'Tab' || !modalOpen) return;
    const els = focusables();
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    const active = shadow.activeElement;
    if (e.shiftKey && (active === first || !active)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !active)) {
      e.preventDefault();
      first.focus();
    }
  }

  // If the page moves focus out of the modal anyway, pull it back.
  let lastFocused = null;
  function onFocusIn(e) {
    if (!modalOpen) return;
    if (e.target === host) {
      lastFocused = shadow.activeElement || lastFocused;
      return;
    }
    try {
      if (e.target && e.target.blur) e.target.blur();
      const target = lastFocused && shadow.contains(lastFocused) ? lastFocused : focusables()[0];
      if (target) target.focus();
    } catch (_) {}
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function closeModal() {
    modalOpen = false;
    lastFocused = null;
    escapeHandler = null;
    stopCountdown();
    if (shadow) shadow.innerHTML = '';
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('focusin', onFocusIn, true);
  }

  let escapeHandler = null;
  function onKeydown(e) {
    if (e.key === 'Escape' && modalOpen) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (escapeHandler) escapeHandler();
    }
  }

  // ------------------------------------------------------------------
  // Screen 1: Pause (with inline nudge states)
  // ------------------------------------------------------------------
  function openModal(orderButton) {
    ensureHost();
    modalOpen = true;

    const emotionOptions = EMOTIONS.map((e) => `<option value="${e}">${e}</option>`).join('');

    shadow.innerHTML = `
      <style>${MODAL_CSS}</style>
      <div class="overlay">
        <div class="card" role="dialog" aria-modal="true" aria-labelledby="fs-title" aria-describedby="fs-sub">
          <button class="close" id="close" type="button" aria-label="Close and cancel order">${CLOSE_ICON}</button>
          <div class="head">
            <div class="eyebrow">FOMO Stopper</div>
            <h1 id="fs-title">Pause before this order</h1>
            <p class="sub" id="fs-sub">Your click was held — nothing has been sent. Answer three questions, then decide.</p>
          </div>

          <div class="field">
            <label class="q-label" for="emotion">1. What emotion is pushing this decision?</label>
            <select id="emotion" required>
              <option value="" selected disabled>Select one…</option>
              ${emotionOptions}
            </select>
            <p class="note" id="emotion-note" aria-live="polite" hidden>Most FOMO trades look different 10 minutes later.</p>
          </div>

          <fieldset class="field">
            <legend class="q-label" style="margin-bottom:10px">2. Would I still take this trade 10 minutes from now?</legend>
            <div class="radio-row">
              <label><input type="radio" name="tenmin" value="Yes"> Yes</label>
              <label><input type="radio" name="tenmin" value="No"> No</label>
            </div>
          </fieldset>

          <div class="field">
            <label class="q-label" for="wrongif">3. What would prove me wrong?</label>
            <textarea id="wrongif" rows="3" placeholder="Name the price, event, or signal that would mean this idea is wrong."></textarea>
            <p class="helper" id="wrongif-helper" aria-live="polite" hidden></p>
            <div class="nudge" id="nudge" role="status" hidden>
              <p class="nudge-quote">If you can't name what would prove you wrong, you don't have a thesis yet — you have a feeling.</p>
              <p class="nudge-sub">Try once more, or cancel and come back with a plan.</p>
            </div>
          </div>

          <div class="actions">
            <button class="primary" id="cancel" type="button">Cancel this order</button>
            <button class="secondary" id="place" type="button" disabled>Place it anyway</button>
          </div>

          ${footerHTML(true)}
        </div>
      </div>
    `;
    wireAssetsAndLinks();

    const $ = (sel) => shadow.querySelector(sel);
    const emotionEl = $('#emotion');
    const emotionNote = $('#emotion-note');
    const wrongifEl = $('#wrongif');
    const helperEl = $('#wrongif-helper');
    const nudgeEl = $('#nudge');
    const placeBtn = $('#place');

    const answers = { emotion: '', tenMinAnswer: '', wrongIf: '' };
    let allValid = false;
    let unlocked = false;
    let remaining = COUNTDOWN_SECONDS;

    function lockPlace() {
      stopCountdown();
      unlocked = false;
      placeBtn.disabled = true;
      placeBtn.textContent = 'Place it anyway';
    }

    function unlockPlace() {
      stopCountdown();
      unlocked = true;
      placeBtn.disabled = false;
      placeBtn.textContent = 'Place it anyway';
    }

    function startCountdown() {
      if (!settings.countdownEnabled) {
        unlockPlace();
        return;
      }
      remaining = COUNTDOWN_SECONDS;
      placeBtn.textContent = `Place it anyway · available in ${remaining}s`;
      countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) unlockPlace();
        else placeBtn.textContent = `Place it anyway · available in ${remaining}s`;
      }, 1000);
    }

    function validate() {
      answers.emotion = emotionEl.value || '';
      const checked = shadow.querySelector('input[name="tenmin"]:checked');
      answers.tenMinAnswer = checked ? checked.value : '';
      answers.wrongIf = (wrongifEl.value || '').trim();

      const warnEmotion = NUDGE_EMOTIONS.includes(answers.emotion);
      emotionEl.classList.toggle('gold', warnEmotion);
      emotionNote.hidden = !warnEmotion;

      const nonAnswer = isNonAnswer(answers.wrongIf);
      const minLen = minWrongIfLength(answers.wrongIf);
      const len = [...answers.wrongIf].length;
      const q3Valid = !nonAnswer && len >= minLen;

      nudgeEl.hidden = !nonAnswer;
      wrongifEl.classList.toggle('warn', nonAnswer);
      const tooShort = !nonAnswer && len > 0 && len < minLen;
      helperEl.hidden = !tooShort;
      if (tooShort) helperEl.textContent = `A little more detail — at least ${minLen} characters (${len}/${minLen}).`;

      allValid = Boolean(answers.emotion && answers.tenMinAnswer && q3Valid);
      if (!allValid) lockPlace();
      else if (!unlocked && !countdownTimer) startCountdown();
    }

    emotionEl.addEventListener('change', validate);
    wrongifEl.addEventListener('input', validate);
    shadow.querySelectorAll('input[name="tenmin"]').forEach((r) => r.addEventListener('change', validate));

    function log(outcome) {
      saveLogEntry({
        timestamp: new Date().toISOString(),
        emotion: answers.emotion,
        tenMinAnswer: answers.tenMinAnswer,
        wrongIf: answers.wrongIf,
        answered: allValid,
        outcome,
      });
    }

    function cancelOrder() {
      log('cancelled');
      showCancelled();
    }

    escapeHandler = cancelOrder;
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('focusin', onFocusIn, true);

    $('#close').addEventListener('click', cancelOrder);
    $('#cancel').addEventListener('click', cancelOrder);

    placeBtn.addEventListener('click', () => {
      if (!allValid || !unlocked) return;
      log('placed');
      closeModal();
      try {
        globalBypassUntil = Date.now() + POST_CONFIRM_GRACE_MS;
        if (orderButton && document.contains(orderButton)) {
          bypassTarget = orderButton;
          bypassUntil = Date.now() + 2000;
          orderButton.click();
        }
        // If the button was re-rendered away while the modal was open,
        // the grace window above lets the user's own next click through.
      } catch (_) {
        /* fail open: grace window already set */
      }
    });

    try {
      emotionEl.focus();
    } catch (_) {}
  }

  // ------------------------------------------------------------------
  // Screen 3: After cancel
  // ------------------------------------------------------------------
  function showCancelled() {
    stopCountdown();
    const card = shadow.querySelector('.card');
    if (!card) return closeModal();

    card.classList.add('done');
    card.setAttribute('aria-labelledby', 'fs-done-title');
    card.setAttribute('aria-describedby', 'fs-done-body');
    card.innerHTML = `
      <div class="eyebrow">FOMO Stopper · Order cancelled</div>
      <div class="cat">
        <img alt="A grumpy long-haired grey cat staring at the camera">
        <p class="caption">The cat approves. Reluctantly.</p>
      </div>
      <h2 id="fs-done-title">You just beat FOMO.</h2>
      <p class="sub" id="fs-done-body">Nothing was sent to your broker. The urge you felt a minute ago is one of the most studied mistakes in investing.</p>
      <div class="actions">
        <a class="btn primary yt-link" target="_blank" rel="noopener noreferrer">${PLAY_ICON}<span>See what your brain was doing</span></a>
        <p class="helper-line">60-second videos on YouTube · Investor Cognition Lab</p>
        <button class="secondary" id="back" type="button">Back to chart</button>
      </div>
      ${footerHTML(false)}
    `;
    wireAssetsAndLinks();

    escapeHandler = closeModal;
    const back = shadow.querySelector('#back');
    back.addEventListener('click', closeModal);
    try {
      back.focus();
    } catch (_) {}
  }
})();

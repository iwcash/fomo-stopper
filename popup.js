/*
 * FOMO Stopper — popup (stats, settings, share card)
 * Investor Cognition Lab
 *
 * Reads only this extension's own chrome.storage.local keys.
 * The "share" button renders a canvas image and downloads it locally —
 * nothing is ever posted or uploaded anywhere.
 */

'use strict';

const DEFAULT_SETTINGS = { enabled: true, countdownEnabled: true };

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------
function computeStats(log) {
  const total = log.length;
  const decided = log.filter((e) => e.outcome === 'placed' || e.outcome === 'cancelled');
  const cancelled = decided.filter((e) => e.outcome === 'cancelled').length;
  const cancelledPct = decided.length ? Math.round((cancelled / decided.length) * 100) : 0;

  // Streak: consecutive most-recent prompts with all three questions
  // answered. Older entries have no `answered` flag; `dismissed` was the
  // pre-v2 outcome for closing without answering.
  let streak = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].outcome === 'dismissed' || log[i].answered === false) break;
    streak++;
  }

  const emotions = {};
  for (const e of log) {
    if (e.emotion) emotions[e.emotion] = (emotions[e.emotion] || 0) + 1;
  }

  return { total, cancelledPct, streak, emotions };
}

let currentStats = { total: 0, cancelledPct: 0, streak: 0, emotions: {} };

function render(log) {
  currentStats = computeStats(log);
  $('stat-total').textContent = String(currentStats.total);
  $('stat-cancelled').textContent = `${currentStats.cancelledPct}%`;
  $('stat-streak').textContent = String(currentStats.streak);

  const barsEl = $('emotion-bars');
  barsEl.innerHTML = '';
  const entries = Object.entries(currentStats.emotions).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No interceptions logged yet.';
    barsEl.appendChild(p);
    return;
  }

  const max = entries[0][1];
  for (const [emotion, count] of entries) {
    const row = document.createElement('div');
    row.className = 'bar-row';

    const meta = document.createElement('div');
    meta.className = 'bar-meta';
    const name = document.createElement('span');
    name.textContent = emotion;
    const num = document.createElement('span');
    num.textContent = String(count);
    meta.append(name, num);

    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.max(6, Math.round((count / max) * 100))}%`;
    track.appendChild(fill);

    row.append(meta, track);
    barsEl.appendChild(row);
  }
}

function refresh() {
  chrome.storage.local.get({ fomo_log: [] }, (res) => {
    render(Array.isArray(res.fomo_log) ? res.fomo_log : []);
  });
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
function loadSettings() {
  chrome.storage.local.get({ fomo_settings: DEFAULT_SETTINGS }, (res) => {
    const s = { ...DEFAULT_SETTINGS, ...(res.fomo_settings || {}) };
    $('set-enabled').checked = !!s.enabled;
    $('set-countdown').checked = !!s.countdownEnabled;
  });
}

function saveSettings() {
  chrome.storage.local.set({
    fomo_settings: {
      enabled: $('set-enabled').checked,
      countdownEnabled: $('set-countdown').checked,
    },
  });
}

$('set-enabled').addEventListener('change', saveSettings);
$('set-countdown').addEventListener('change', saveSettings);

$('reset').addEventListener('click', () => {
  if (!confirm('Delete all FOMO Stopper data (log and settings)? This cannot be undone.')) return;
  chrome.storage.local.remove(['fomo_log', 'fomo_settings'], () => {
    loadSettings();
    refresh();
  });
});

// ---------------------------------------------------------------------
// Share card (local canvas render + download; never uploaded)
// ---------------------------------------------------------------------
function drawShareCard() {
  const canvas = $('share-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const NAVY = '#0B1020';
  const PANEL = '#121829';
  const GOLD = '#D8B45A';
  const TEXT = '#F3F1EA';
  const MUTED = '#A9AFC0';
  const FAINT = '#8990A3';

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(216, 180, 90, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  const sans = "'IBM Plex Sans', 'Helvetica Neue', system-ui, sans-serif";
  const serif = "'Newsreader', Georgia, serif";
  const mono = "'IBM Plex Mono', ui-monospace, monospace";

  ctx.fillStyle = GOLD;
  ctx.font = `600 20px ${mono}`;
  ctx.textBaseline = 'top';
  ctx.fillText('I N V E S T O R   C O G N I T I O N   L A B', 80, 78);

  ctx.fillStyle = TEXT;
  ctx.font = `500 62px ${serif}`;
  ctx.fillText('FOMO Stopper', 80, 122);

  ctx.fillStyle = MUTED;
  ctx.font = `400 24px ${sans}`;
  ctx.fillText('My pre-trade discipline, on the record.', 80, 196);

  // Stat tiles
  const stats = [
    { value: String(currentStats.total), label: 'TRADES INTERCEPTED' },
    { value: `${currentStats.cancelledPct}%`, label: 'CANCELLED AFTER PAUSING' },
    { value: String(currentStats.streak), label: 'PROMPTS ANSWERED IN A ROW' },
  ];
  const tileW = 330;
  const tileH = 170;
  const gap = 25;
  const startX = 80;
  const tileY = 260;

  stats.forEach((s, i) => {
    const x = startX + i * (tileW + gap);
    ctx.fillStyle = PANEL;
    ctx.fillRect(x, tileY, tileW, tileH);
    ctx.strokeStyle = '#262E45';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, tileY, tileW, tileH);

    ctx.fillStyle = GOLD;
    ctx.font = `500 68px ${serif}`;
    ctx.fillText(s.value, x + 28, tileY + 30);

    ctx.fillStyle = MUTED;
    ctx.font = `500 17px ${sans}`;
    ctx.fillText(s.label, x + 28, tileY + 116);
  });

  // Top emotion
  const top = Object.entries(currentStats.emotions).sort((a, b) => b[1] - a[1])[0];
  ctx.fillStyle = MUTED;
  ctx.font = `400 24px ${sans}`;
  ctx.fillText(
    top ? `Most common trigger: ${top[0]} (${top[1]}×)` : 'No trades intercepted yet.',
    80,
    482
  );

  ctx.strokeStyle = '#262E45';
  ctx.beginPath();
  ctx.moveTo(80, 560);
  ctx.lineTo(W - 80, 560);
  ctx.stroke();

  ctx.fillStyle = FAINT;
  ctx.font = `400 22px ${sans}`;
  ctx.fillText('Study the investor, not just the market.', 80, 586);

  return canvas;
}

$('share').addEventListener('click', () => {
  const canvas = drawShareCard();
  const link = document.createElement('a');
  link.download = `fomo-stopper-stats-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ---------------------------------------------------------------------
loadSettings();
refresh();

// Minivindu under opptak: et lite vindu som ligger over andre apper (Bilde-i-bilde for dokumenter).
// Finnes i Chrome og Edge på datamaskin. Knappene virker mens du skriver i en annen app.

import { clock } from './text.js';

export const miniSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

let pip = null;
let parts = null;

const ICONS = {
  flag: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 21V4h9l.6 2H20v10h-7l-.6-2H7v7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  lap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
};

export async function openMini({ onAction, onClose }) {
  if (!miniSupported) return false;
  if (pip) { pip.focus?.(); return true; }
  pip = await window.documentPictureInPicture.requestWindow({ width: 430, height: 64 });
  const doc = pip.document;
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const copy = doc.createElement('link');
    copy.rel = 'stylesheet';
    copy.href = link.href;
    doc.head.appendChild(copy);
  }
  doc.title = 'Transkriber';
  doc.body.className = 'mini-body';
  doc.body.innerHTML = `
    <div class="mini" role="group" aria-label="Opptak">
      <div class="status">
        <span class="dot"></span>
        <div>
          <div class="time">00:00</div>
          <div class="sub">Runde 1 · 00:00</div>
        </div>
      </div>
      <div class="meter">${'<span></span>'.repeat(14)}</div>
      <span class="sep"></span>
      <div class="buttons">
        <button class="flag" data-mini="flag" title="Sett flagg (pil opp)" aria-label="Sett flagg">${ICONS.flag}</button>
        <button class="pause" data-mini="pause" title="Pause (mellomrom)" aria-label="Pause">${ICONS.pause}</button>
        <button class="lap" data-mini="lap" title="Ny runde (Enter)" aria-label="Ny runde">${ICONS.lap}</button>
        <button data-mini="stop" title="Avslutt opptaket" aria-label="Avslutt opptaket">${ICONS.stop}</button>
      </div>
      <span class="sep"></span>
      <button class="subtle" data-mini="expand" title="Tilbake til det store vinduet" aria-label="Tilbake til det store vinduet">${ICONS.expand}</button>
    </div>`;
  parts = {
    dot: doc.querySelector('.dot'),
    time: doc.querySelector('.time'),
    sub: doc.querySelector('.sub'),
    bars: [...doc.querySelectorAll('.meter span')],
    meter: doc.querySelector('.meter'),
    pause: doc.querySelector('[data-mini="pause"]'),
  };
  doc.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mini]');
    if (button) onAction(button.dataset.mini);
  });
  doc.addEventListener('keydown', (event) => {
    const map = { ' ': 'pause', Enter: 'lap', ArrowUp: 'flag' };
    if (map[event.key]) { event.preventDefault(); onAction(map[event.key]); }
  });
  pip.addEventListener('pagehide', () => {
    pip = null;
    parts = null;
    onClose?.();
  });
  return true;
}

export function updateMini(recorder, flagShown) {
  if (!parts) return;
  const paused = recorder.state === 'paused';
  const countdown = recorder.state === 'countdown';
  parts.dot.classList.toggle('paused', paused || countdown);
  parts.time.textContent = countdown ? `Starter om ${recorder.countdown}` : clock(recorder.totalTime);
  if (flagShown) {
    parts.sub.textContent = `🚩 Flagg ved ${clock(recorder.lastFlagTime)}`;
    parts.sub.classList.add('flag');
  } else {
    parts.sub.textContent = countdown ? recorder.sessionName : `${paused ? 'Pause' : `Runde ${recorder.lapNumber}`} · ${clock(recorder.lapTime)}`;
    parts.sub.classList.remove('flag');
  }
  parts.meter.classList.toggle('off', paused || countdown);
  const levels = recorder.levels.slice(-14);
  parts.bars.forEach((bar, i) => { bar.style.height = `${Math.max(3, levels[i] * 20)}px`; });
  const icon = paused ? ICONS.mic : ICONS.pause;
  if (parts.pause.dataset.icon !== (paused ? 'mic' : 'pause')) {
    parts.pause.innerHTML = icon;
    parts.pause.dataset.icon = paused ? 'mic' : 'pause';
    parts.pause.setAttribute('aria-label', paused ? 'Fortsett' : 'Pause');
  }
}

export function closeMini() {
  pip?.close();
  pip = null;
  parts = null;
}

export const isMiniOpen = () => Boolean(pip);

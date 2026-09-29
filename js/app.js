// Transkriber på nett. Samme funksjoner som Mac-appen: opptak i runder med flagg,
// transkribering med Whisper i nettleseren, personer, oppsummering og titler, og lagring av filer.
// Laget av Georg Ferdinand Nilsen.

import { Recorder } from './recorder.js';
import * as store from './store.js';
import { MODELS, LANGUAGES, SPEAKER_CHOICES, modelFor } from './models.js';
import { decodeToMono16k, splitPoints } from './audio.js';
import * as T from './text.js';
import * as files from './files.js';
import * as ai from './ai.js';
import { miniSupported, openMini, updateMini, closeMini, isMiniOpen } from './mini.js';

// MARK: Hjelpere

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const hasGPU = 'gpu' in navigator;
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const ICON = {
  mic: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 12v0M6 9v6M9 5v14M12 8v8M15 4v16M18 9v6M21 12v0"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  tray: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 1.5 21h21zM11 9h2v6h-2zm0 8h2v2h-2z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 21V4h9l.6 2H20v10h-7l-.6-2H7v7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  lap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/></svg>',
  pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6zM18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9z"/></svg>',
  redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
};

// MARK: Tilstand

const defaultModel = isTouch || !hasGPU ? 'nb-base' : 'nb-small';

const state = {
  items: [],
  screen: 'home', // home | result
  resultId: null,
  resultTab: 'text',
  banner: null,
  error: null,
  job: null,
  summarizing: new Set(),
  summaryQueue: Promise.resolve(),
  folder: null,
  aiReason: undefined,
  aiProgress: null,
  flagToast: false,
  settings: {
    language: store.readSetting('language', 'no'),
    model: store.readSetting('model', defaultModel),
    speakers: store.readSetting('speakers', -1),
    aiEnabled: store.readSetting('aiEnabled', false),
  },
};
if (!MODELS.some((m) => m.id === state.settings.model)) state.settings.model = defaultModel;
if (!LANGUAGES.some((l) => l.code === state.settings.language)) state.settings.language = 'no';

const findItem = (id) => state.items.find((i) => i.id === id);
const drafts = () => state.items.filter((i) => !i.transcript);
const sortItems = () => state.items.sort((a, b) => b.createdAt - a.createdAt);

async function persist(item) {
  await store.putItem(JSON.parse(JSON.stringify(item)));
}

// MARK: Opptak

const recorder = new Recorder({
  onChange: () => {
    render();
    if (!recorder.isActive && isMiniOpen()) closeMini();
  },
  onTick: () => {
    updateRecordingLive();
    updateMini(recorder, state.flagToast);
  },
  onLap: async (item, blob) => {
    await store.putAudio(item.id, blob);
    state.items.unshift(item);
    await persist(item);
    store.requestPersistence();
    syncFiles(item);
  },
  onError: (message) => showMessage('Opptak', message),
});

function startRecording() {
  if (state.job) return;
  state.banner = null;
  state.screen = 'home';
  recorder.begin();
}

let toastTimer = null;
function addFlag() {
  if (!recorder.isRecordingOrPaused) return;
  recorder.addFlag();
  state.flagToast = true;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.flagToast = false; render(); }, 1400);
}

async function showMini() {
  try {
    await openMini({
      onAction: (action) => {
        if (action === 'flag') addFlag();
        else if (action === 'pause') recorder.togglePause();
        else if (action === 'lap') recorder.newLap();
        else if (action === 'stop') recorder.finish();
        else if (action === 'expand') { closeMini(); window.focus(); }
      },
      onClose: () => render(),
    });
    updateMini(recorder, state.flagToast);
  } catch (error) {
    showMessage('Minivindu', `Klarte ikke å åpne minivinduet.\n\n${error?.message || error}`);
  }
}

// MARK: Import av lydfiler

function audioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const media = document.createElement('audio');
    media.preload = 'metadata';
    media.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(media.duration) ? media.duration : 0); };
    media.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    media.src = url;
  });
}

async function importFiles(list) {
  const chosen = [...list].filter((f) => /^(audio|video)\//.test(f.type) || /\.(m4a|mp3|wav|aac|ogg|opus|flac|webm|mp4|mov|m4v)$/i.test(f.name));
  if (!chosen.length || state.job || recorder.isActive) return;
  const now = Date.now();
  const ids = [];
  for (const file of chosen) {
    const ext = (file.name.split('.').pop() || 'm4a').toLowerCase();
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      subtitle: `Lydfil · ${T.displayDate(now)}`,
      createdAt: now,
      duration: await audioDuration(file),
      flags: [],
      source: 'file',
      audioType: file.type,
      audioExt: ext,
      titleIsCustom: false,
      speakerNames: [],
      transcript: null,
      files: {},
    };
    await store.putAudio(item.id, file);
    await persist(item);
    state.items.push(item);
    ids.push(item.id);
  }
  sortItems();
  store.requestPersistence();
  transcribe(ids);
}

// MARK: Transkribering

let worker = null;
let forceWasm = false;

function getWorker() {
  if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  return worker;
}

function runWorker(payload, job) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    w.onmessage = (event) => {
      if (state.job !== job) return;
      const msg = event.data;
      if (msg.type === 'status') {
        job.stage = msg.stage;
        job.progress = msg.progress ?? 0;
        if (msg.device) job.device = msg.device;
        updateRunning();
      } else if (msg.type === 'lines') {
        job.live.push(...msg.lines);
        job.progress = msg.progress;
        updateRunning(true);
      } else if (msg.type === 'warning') {
        job.warnings.push(msg.message);
      } else if (msg.type === 'done') {
        clearTimeout(watchdog);
        resolve(msg.lines);
        return;
      } else if (msg.type === 'error') {
        // Workeren kan være i en ødelagt tilstand etter en feil: start en ny neste gang
        w.terminate();
        if (worker === w) worker = null;
        const error = new Error(msg.message);
        error.webgpuFailed = msg.webgpuFailed;
        clearTimeout(watchdog);
        reject(error);
        return;
      }
      clearTimeout(watchdog);
      watchdog = setTimeout(stalled, 10 * 60 * 1000);
    };
    // Blir workeren stoppet av nettleseren (for lite minne), kommer det ingen melding
    const stalled = () => {
      w.terminate();
      if (worker === w) worker = null;
      reject(new Error('Transkriberingen stoppet opp. Enheten kan ha gått tom for minne. Prøv en mindre modell, eller del opptaket opp.'));
    };
    let watchdog = setTimeout(stalled, 10 * 60 * 1000);
    w.onerror = (event) => {
      clearTimeout(watchdog);
      event.preventDefault?.();
      worker?.terminate();
      worker = null;
      reject(new Error(event.message
        ? `Transkriberingen stoppet.\n\nDetaljer: ${event.message}`
        : 'Transkriberingen stoppet. Sjekk at du er på nett første gang (modellen må lastes ned), eller at enheten har nok minne. Prøv NB-Whisper Base på mobil.'));
    };
    w.postMessage(payload, [payload.audio.buffer]);
  });
}

function transcribe(ids) {
  if (state.job || !ids.length) return;
  state.banner = null;
  state.error = null;
  state.screen = 'home';
  state.job = { queue: [...ids], total: ids.length, position: 0, finished: [], warnings: [], stage: 'preparing', progress: 0, live: [], title: '' };
  render();
  runNextJob(state.job);
}

async function runNextJob(job) {
  if (state.job !== job) return;
  if (!job.queue.length) return finishQueue(job);
  const id = job.queue.shift();
  const item = findItem(id);
  if (!item) return runNextJob(job);
  job.position += 1;
  job.title = item.title;
  job.live = [];
  job.stage = 'reading';
  job.progress = 0;
  render();
  try {
    const blob = await store.getAudio(id);
    if (!blob) throw new Error('Fant ikke lyden. Den kan ha blitt ryddet bort av nettleseren.');
    let samples;
    try {
      samples = await decodeToMono16k(blob);
    } catch (error) {
      throw new Error(`Klarte ikke å lese lyden. Prøv å lagre den som m4a, mp3 eller wav først.\n\nDetaljer: ${error?.message || error}`);
    }
    if (state.job !== job) return;
    const model = modelFor(state.settings.model);
    const payload = (audio) => ({
      type: 'transcribe',
      audio,
      chunks: splitPoints(audio),
      model: { ...model },
      language: state.settings.language,
      speakers: Number(state.settings.speakers),
      forceWasm,
    });
    let lines;
    try {
      lines = await runWorker(payload(samples), job);
    } catch (error) {
      if (!error.webgpuFailed || state.job !== job) throw error;
      // WebGPU virket ikke her: prøv igjen med vanlig prosessor resten av økten
      forceWasm = true;
      job.stage = 'reading';
      updateRunning();
      lines = await runWorker(payload(await decodeToMono16k(blob)), job);
    }
    if (state.job !== job) return;
    if (!lines.length) {
      throw new Error('Fant ingen tale.\n\nSjekk at opptaket har lyd, og at riktig språk er valgt i innstillingene.');
    }
    await storeTranscript(item, lines);
    job.finished.push(id);
    runNextJob(job);
  } catch (error) {
    if (state.job !== job) return;
    state.job = null;
    state.error = `«${item.title}»\n\n${error?.message || error}`;
    render();
  }
}

function cancelJob() {
  if (!state.job) return;
  state.job = null;
  worker?.terminate();
  worker = null;
  render();
}

function finishQueue(job) {
  state.job = null;
  if (job.finished.length === 1) {
    openResult(job.finished[0]);
  } else {
    state.banner = `${job.finished.length} opptak er transkribert.`;
    render();
  }
  const warnings = [...new Set(job.warnings)];
  if (warnings.length) showMessage('Personer', warnings.join('\n\n'));
}

async function storeTranscript(item, lines) {
  item.transcript = {
    lines,
    flagged: T.flaggedIndices(lines, item.flags),
    summary: null,
    summaryError: null,
  };
  // Ny transkribering: personene kan få en annen rekkefølge
  item.speakerNames = [];
  await persist(item);
  await syncFiles(item);
  enqueueSummary(item.id);
}

// MARK: Oppsummering og titler

function enqueueSummary(id) {
  const item = findItem(id);
  if (!item?.transcript || state.summarizing.has(id)) return;
  if (!state.settings.aiEnabled) {
    item.transcript.summaryError = 'Slå på «Oppsummering og titler med AI» i innstillingene for å få oppsummering og tittel.';
    persist(item);
    return;
  }
  if (state.aiReason) {
    item.transcript.summaryError = state.aiReason;
    persist(item);
    return;
  }
  state.summarizing.add(id);
  item.transcript.summaryError = null;
  render();
  state.summaryQueue = state.summaryQueue.then(() => runSummary(id)).catch(() => {});
}

async function runSummary(id) {
  while (state.job) await new Promise((r) => setTimeout(r, 1000));
  const item = findItem(id);
  if (!item?.transcript) { state.summarizing.delete(id); return; }
  try {
    // Lages alltid med «Person 1», «Person 2» …, så navnene kan byttes senere
    const text = T.renderText(item.transcript, []);
    const output = await ai.summarize(text, (progress) => {
      state.aiProgress = progress < 1 ? progress : null;
      updateAIProgress();
    });
    item.transcript.summary = output.summary;
    item.transcript.summaryError = null;
    if (!item.titleIsCustom && output.title) item.title = output.title;
  } catch (error) {
    item.transcript.summaryError = `Klarte ikke å lage oppsummering.\n\nDetaljer: ${error?.message || error}`;
  } finally {
    state.aiProgress = null;
    state.summarizing.delete(id);
    await persist(item);
    await syncFiles(item);
    render();
  }
}

async function toggleAI(enabled) {
  if (!enabled) {
    state.settings.aiEnabled = false;
    store.writeSetting('aiEnabled', false);
    render();
    return;
  }
  state.aiReason = await ai.aiUnavailableReason();
  if (state.aiReason) {
    showMessage('Oppsummering og titler', state.aiReason);
    state.settings.aiEnabled = false;
    render();
    return;
  }
  state.settings.aiEnabled = true;
  store.writeSetting('aiEnabled', true);
  state.aiProgress = 0;
  render();
  try {
    await ai.prepareAI((progress) => {
      state.aiProgress = progress < 1 ? progress : null;
      updateAIProgress();
    });
  } catch (error) {
    showMessage('Oppsummering og titler', `Klarte ikke å laste ned AI-modellen.\n\nDetaljer: ${error?.message || error}`);
    state.settings.aiEnabled = false;
    store.writeSetting('aiEnabled', false);
  }
  state.aiProgress = null;
  render();
}

// MARK: Filer

function fileSet(item, audioBlob) {
  const base = T.baseName(item.createdAt, item.title);
  const set = {};
  if (item.transcript) {
    set.text = { name: `${base}.txt`, blob: new Blob([T.renderText(item.transcript, item.speakerNames)], { type: 'text/plain;charset=utf-8' }) };
    if (item.transcript.summary) {
      const summary = T.renderSummary(item.transcript.summary, item.speakerNames, T.speakerCount(item.transcript));
      set.summary = { name: `${base}${T.SUMMARY_SUFFIX}`, blob: new Blob([T.summaryFile(item.title, item.createdAt, summary)], { type: 'text/plain;charset=utf-8' }) };
    }
  }
  if (audioBlob) set.audio = { name: `${base}.${item.audioExt || 'm4a'}`, blob: audioBlob };
  return set;
}

const syncChains = new Map();

/** Skriver filene til den valgte mappen (Chrome og Edge på datamaskin). Én om gangen per opptak. */
function syncFiles(item) {
  const previous = syncChains.get(item.id) || Promise.resolve();
  const next = previous.then(() => syncNow(item)).catch(() => {});
  syncChains.set(item.id, next);
  return next;
}

async function syncNow(item) {
  if (!state.folder?.granted) return;
  try {
    const audio = item.source === 'recording' ? await store.getAudio(item.id) : null;
    const set = fileSet(item, null);
    const result = await files.syncItem(item, {
      audio,
      text: set.text ? await set.text.blob.text() : null,
      summary: set.summary ? await set.summary.blob.text() : null,
    });
    if (result) {
      item.files = result;
      await persist(item);
    }
  } catch (error) {
    state.folder = await files.folderInfo();
    console.warn('Klarte ikke å lagre i mappen', error);
  }
}

async function chooseFolder() {
  try {
    state.folder = await files.chooseFolder();
    render();
    for (const item of state.items) await syncFiles(item);
    state.banner = `Filene lagres nå i «${state.folder.name}».`;
    render();
  } catch (error) {
    if (error?.name !== 'AbortError') showMessage('Mappe', `Klarte ikke å bruke mappen.\n\n${error?.message || error}`);
  }
}

async function grantFolder() {
  state.folder = await files.grantFolder();
  render();
  if (state.folder?.granted) for (const item of state.items) await syncFiles(item);
}

// MARK: Navn og titler

async function renameItem(id, title) {
  const item = findItem(id);
  const cleaned = String(title || '').trim();
  if (!item || !cleaned || cleaned === item.title) return;
  item.title = cleaned;
  item.titleIsCustom = true;
  await persist(item);
  await syncFiles(item);
  refreshAfterEdit();
}

/** På resultatsiden oppdateres bare teksten, så et trykk på en knapp ikke går tapt. */
function refreshAfterEdit() {
  const item = findItem(state.resultId);
  const box = $('#result-text');
  if (state.screen !== 'result' || !item?.transcript || !box || recorder.isActive || state.job || state.error) {
    render();
    return;
  }
  const count = T.speakerCount(item.transcript);
  box.textContent = state.resultTab === 'summary'
    ? T.renderSummary(item.transcript.summary || '', item.speakerNames, count)
    : T.renderText(item.transcript, item.speakerNames);
  const file = $('.result-foot .file');
  const name = state.resultTab === 'summary' ? item.files?.summary : item.files?.text;
  if (file && name) file.textContent = `${item.files.dir ? `${item.files.dir}/` : ''}${name}`;
}

async function renameSpeaker(id, index, name) {
  const item = findItem(id);
  if (!item) return;
  const names = [...(item.speakerNames || [])];
  while (names.length <= index) names.push('');
  const cleaned = String(name || '').trim();
  if (names[index] === cleaned) return;
  names[index] = cleaned;
  item.speakerNames = names;
  await persist(item);
  await syncFiles(item);
  refreshAfterEdit();
}

async function deleteItem(id) {
  await store.deleteItem(id);
  state.items = state.items.filter((i) => i.id !== id);
  if (state.resultId === id) state.screen = 'home';
  render();
}

function openResult(id) {
  state.screen = 'result';
  state.resultId = id;
  state.resultTab = 'text';
  render();
  window.scrollTo(0, 0);
}

// MARK: Visning

const main = $('#main');
const bar = $('#settings-bar');
const dialog = $('#dialog');

function render() {
  const active = document.activeElement;
  const keep = active && active.id && main.contains(active) && 'value' in active
    ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd }
    : null;

  main.innerHTML = screenHTML();
  // Innstillingene nederst vises bare på oversikten, som i Mac-appen
  const showBar = !recorder.isActive && !state.job && !state.error && state.screen !== 'result';
  bar.innerHTML = showBar ? `<div class="settings">${settingsHTML('bar')}</div>` : '';
  bar.hidden = !showBar;

  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.value = keep.value;
      el.focus();
      try { el.setSelectionRange(keep.start, keep.end); } catch { /* ikke tekstfelt */ }
    }
  }
  updateRecordingLive();
  const live = $('#live-text');
  if (live) live.scrollTop = live.scrollHeight;
}

function screenHTML() {
  if (recorder.isActive) return recorder.state === 'countdown' ? countdownHTML() : recordingHTML();
  if (state.job) return runningHTML();
  if (state.error) return errorHTML();
  if (state.screen === 'result' && findItem(state.resultId)) return resultHTML(findItem(state.resultId));
  return homeHTML();
}

// Oversikten

function homeHTML() {
  const draftCount = drafts().length;
  const list = state.items.length
    ? `<ul class="list">${state.items.map(rowHTML).join('')}</ul>`
    : `<div class="empty">${ICON.tray}<h3>Ingen opptak ennå</h3><p>Trykk Ta opp for å starte et intervju, eller velg en lydfil.</p></div>`;
  const storageNote = state.items.length && !state.folder?.granted
    ? `<p class="banner info">${ICON.info}<span>Opptakene ligger i nettleseren. Bruk «Lagre …» på det du vil beholde, så havner det der du velger.</span></p>`
    : '';
  return `
    <section class="inputs" aria-label="Nytt opptak">
      <button class="card record" type="button" data-action="record">
        <span class="record-dot" aria-hidden="true"></span>
        <h2>Ta opp</h2>
        <p>Starter etter en nedtelling fra 3</p>
      </button>
      <button class="card drop" type="button" data-action="pick-file" id="drop-card">
        ${ICON.wave}
        <h2>Velg lydfil</h2>
        <p class="desktop-only">eller slipp en fil her</p>
        <p class="touch-only">Lyd eller video</p>
      </button>
    </section>
    <div class="section-head">
      <h2>Opptak</h2>
      ${draftCount ? `<span class="count">${draftCount === 1 ? '1 utkast' : `${draftCount} utkast`}</span>` : ''}
      <span class="spacer"></span>
      ${draftCount ? '<button class="btn" type="button" data-action="transcribe-drafts">Transkriber alle<span class="wide-only"> utkast</span></button>' : ''}
    </div>
    ${state.banner ? `<p class="banner" role="status">${ICON.check}<span>${esc(state.banner)}</span></p>` : ''}
    ${storageNote}
    ${list}`;
}

function rowHTML(item) {
  const busy = state.summarizing.has(item.id);
  const flags = item.flags?.length ? `<span aria-label="${item.flags.length} flagg">🚩 ${item.flags.length}</span>` : '';
  const action = item.transcript
    ? `<button class="btn" type="button" data-action="show" data-id="${item.id}">Vis tekst</button>`
    : `<button class="btn" type="button" data-action="transcribe" data-id="${item.id}">Transkriber</button>`;
  return `
    <li class="row">
      <span class="row-icon ${item.source === 'file' ? 'file' : ''}">${item.source === 'file' ? ICON.wave : ICON.mic}</span>
      <button class="row-text" type="button" data-action="${item.transcript ? 'show' : 'item-menu'}" data-id="${item.id}">
        <span class="row-title">${esc(item.title)}</span>
        <span class="row-sub">${esc(item.subtitle)}</span>
      </button>
      <span class="row-meta">
        ${busy ? '<span class="spinner" title="Lager oppsummering og tittel …"></span>' : ''}
        ${flags}
        ${item.duration ? `<span class="duration">${T.clock(item.duration)}</span>` : ''}
      </span>
      <span class="row-action">${action}</span>
      <button class="icon-button" type="button" data-action="item-menu" data-id="${item.id}" aria-label="Mer for ${esc(item.title)}">${ICON.more}</button>
    </li>`;
}

// Opptak

function countdownHTML() {
  return `
    <section class="countdown" aria-live="assertive">
      <div class="countdown-number">${recorder.countdown}</div>
      <p class="muted">Opptaket starter …</p>
      <button class="btn large" type="button" data-action="rec-cancel">Avbryt</button>
    </section>`;
}

function recordingHTML() {
  const paused = recorder.state === 'paused';
  const laps = recorder.laps.map((lap) => `
    <div class="lap-row">
      <span>Runde ${lap.number}</span><span class="detail">utkast</span><span class="grow"></span>
      ${lap.flagCount ? `<span>🚩 ${lap.flagCount}</span>` : ''}
      <span class="muted">${T.clock(lap.duration)}</span>
    </div>`).join('');
  return `
    <section class="recording" aria-label="Opptak pågår">
      <div class="rec-head">
        <div class="grow">
          <h2>${esc(recorder.sessionName)}</h2>
          <p class="wide-only">Hver runde lagres som et utkast du kan transkribere etterpå.</p>
        </div>
        ${miniSupported && !isTouch && !isMiniOpen() ? `<button class="btn" type="button" data-action="rec-mini" title="Et lite vindu som ligger over andre apper">${ICON.pip}<span>Minivindu</span></button>` : ''}
        <button class="btn" type="button" data-action="rec-finish">${ICON.stop}<span>Avslutt</span></button>
      </div>
      <div class="status-pill ${paused ? 'paused' : ''}"><span class="dot"></span>${paused ? 'Pause' : 'Tar opp'}</div>
      <div class="big-time" id="rec-total">${T.clock(recorder.totalTime)}</div>
      <div class="lap-time" id="rec-lap">Runde ${recorder.lapNumber} · ${T.clock(recorder.lapTime)}</div>
      <div class="meter ${paused ? 'off' : ''}" id="rec-meter" aria-hidden="true">${'<span></span>'.repeat(48)}</div>
      <div class="controls">
        ${state.flagToast ? `<div class="toast" role="status">🚩 Flagg satt ved ${T.clock(recorder.lastFlagTime)}</div>` : ''}
        <div class="control flag">
          <button type="button" data-action="rec-flag" aria-label="Sett flagg">${ICON.flag}</button>
          <span class="label">Flagg</span><span class="hint">pil opp</span>
        </div>
        <div class="control big">
          <button type="button" data-action="rec-pause" aria-label="${paused ? 'Fortsett' : 'Pause'}">${paused ? ICON.mic : ICON.pause}</button>
          <span class="label">${paused ? 'Fortsett' : 'Pause'}</span><span class="hint">mellomrom</span>
        </div>
        <div class="control lap">
          <button type="button" data-action="rec-lap" aria-label="Ny runde">${ICON.lap}</button>
          <span class="label">Ny runde</span><span class="hint">enter</span>
        </div>
      </div>
      <div class="laps">
        <div class="lap-row"><span class="current">Runde ${recorder.lapNumber}</span><span class="detail">${paused ? 'pause' : 'pågår'}</span><span class="grow"></span>
          ${recorder.flagTimes.length ? `<span>🚩 ${recorder.flagTimes.length}</span>` : ''}<span id="rec-lap-row">${T.clock(recorder.lapTime)}</span></div>
        ${laps}
      </div>
      ${isTouch ? '<p class="phone-note">Hold skjermen på og appen åpen mens du tar opp. Telefonen stopper opptaket hvis du bytter app eller låser skjermen.</p>' : ''}
    </section>`;
}

function updateRecordingLive() {
  if (!recorder.isRecordingOrPaused) return;
  const total = $('#rec-total');
  if (!total) return;
  total.textContent = T.clock(recorder.totalTime);
  $('#rec-lap').textContent = `Runde ${recorder.lapNumber} · ${T.clock(recorder.lapTime)}`;
  const row = $('#rec-lap-row');
  if (row) row.textContent = T.clock(recorder.lapTime);
  const bars = $('#rec-meter')?.children || [];
  for (let i = 0; i < bars.length; i++) bars[i].style.height = `${Math.max(3, recorder.levels[i] * 46)}px`;
}

// Transkribering pågår

const STAGE_TEXT = {
  preparing: 'Gjør klar …',
  reading: 'Leser lyden …',
  downloading: 'Laster ned språkmodellen (bare første gang) …',
  loading: 'Gjør modellen klar …',
  transcribing: 'Transkriberer …',
  speakers: 'Finner ut hvem som snakker …',
};

function runningHTML() {
  const job = state.job;
  const text = job.live.map((l) => l.text).join('\n');
  return `
    <section class="running" aria-busy="true">
      <div class="running-head">
        <div class="grow">
          <h2>${esc(job.title)}</h2>
          ${job.total > 1 ? `<span class="muted small">${job.position} av ${job.total}</span>` : ''}
        </div>
        <button class="btn" type="button" data-action="cancel-job">Avbryt</button>
      </div>
      <div>
        <div class="progress ${job.progress > 0 ? '' : 'indeterminate'}" id="job-bar"><div style="width:${Math.round(job.progress * 100)}%"></div></div>
        <div class="running-status"><span id="job-stage">${STAGE_TEXT[job.stage] || ''}</span><span id="job-percent">${job.progress > 0 ? `${Math.round(job.progress * 100)} %` : ''}</span></div>
      </div>
      <div class="textbox ${text ? '' : 'placeholder'}" id="live-text">${text ? esc(text) : 'Teksten dukker opp her etter hvert …'}</div>
    </section>`;
}

function updateRunning(textChanged = false) {
  const job = state.job;
  const barEl = $('#job-bar');
  if (!job || !barEl) return render();
  barEl.classList.toggle('indeterminate', !(job.progress > 0));
  barEl.firstElementChild.style.width = `${Math.round(job.progress * 100)}%`;
  $('#job-stage').textContent = STAGE_TEXT[job.stage] || '';
  $('#job-percent').textContent = job.progress > 0 ? `${Math.round(job.progress * 100)} %` : '';
  if (textChanged) {
    const live = $('#live-text');
    live.classList.remove('placeholder');
    live.textContent = job.live.map((l) => l.text).join('\n');
    live.scrollTop = live.scrollHeight;
  }
}

function errorHTML() {
  return `
    <section class="error" role="alert">
      ${ICON.warn}
      <h2>Noe gikk galt</h2>
      <pre>${esc(state.error)}</pre>
      <button class="btn primary large" type="button" data-action="dismiss-error">Tilbake</button>
    </section>`;
}

// Ferdig tekst

function resultHTML(item) {
  const transcript = item.transcript;
  const count = T.speakerCount(transcript);
  const text = transcript ? T.renderText(transcript, item.speakerNames) : '';
  const summary = transcript?.summary ? T.renderSummary(transcript.summary, item.speakerNames, count) : null;
  const busy = state.summarizing.has(item.id);
  const flagCount = (text.match(/🚩/g) || []).length;
  const tab = state.resultTab;

  let content;
  if (tab === 'text') {
    content = `<div class="textbox" id="result-text">${esc(text)}</div>`;
  } else if (summary) {
    content = `<div class="textbox" id="result-text">${esc(summary)}</div>`;
  } else if (busy) {
    content = `<div class="textbox placeholder"><span class="spinner" style="display:inline-block;vertical-align:middle;margin-right:8px"></span>AI lager oppsummering og tittel …${state.aiProgress !== null ? ` Laster ned modellen: ${Math.round(state.aiProgress * 100)} %` : ''}</div>`;
  } else {
    content = `<div class="textbox placeholder">${esc(transcript?.summaryError || 'Ingen oppsummering ennå.')}
      ${state.settings.aiEnabled && !state.aiReason ? `<p><button class="btn" type="button" data-action="summarize" data-id="${item.id}">${ICON.sparkles}<span>Lag oppsummering</span></button></p>` : ''}</div>`;
  }

  const people = count > 1 ? `
    <div class="people" role="group" aria-label="Navn på personene">
      <span class="muted small">Personer</span>
      ${Array.from({ length: count }, (_, i) => `
        <input class="text-input" id="speaker-${i}" data-speaker="${i}" data-id="${item.id}"
          value="${esc(item.speakerNames?.[i] || '')}" placeholder="${T.defaultName(i)}" aria-label="Navn på ${T.defaultName(i)}" enterkeyhint="done">`).join('')}
    </div>` : '';

  const fileName = tab === 'summary' ? item.files?.summary : item.files?.text;
  return `
    <section class="result">
      <div class="result-head">
        <button class="btn" type="button" data-action="back">${ICON.back}<span>Tilbake</span></button>
        <div class="grow">
          <input class="title-input" id="title-input" data-id="${item.id}" value="${esc(item.title)}" aria-label="Tittel" title="Klikk for å endre tittelen. Filene får samme navn." enterkeyhint="done">
          <div class="result-sub">${esc(item.subtitle)}${busy ? ' · <span class="spinner"></span> Lager tittel og oppsummering …' : ''}</div>
        </div>
        ${flagCount ? `<span class="muted small">🚩 ${flagCount}</span>` : ''}
      </div>
      ${people}
      <div class="segmented" role="tablist" aria-label="Vis">
        <button type="button" role="tab" data-action="tab" data-tab="text" aria-selected="${tab === 'text'}">Tekst</button>
        <button type="button" role="tab" data-action="tab" data-tab="summary" aria-selected="${tab === 'summary'}">Oppsummering</button>
      </div>
      ${content}
      <div class="result-foot">
        <button class="btn" type="button" data-action="copy" data-id="${item.id}" ${tab === 'summary' && !summary ? 'disabled' : ''}>${ICON.copy}<span id="copy-label">${tab === 'summary' ? 'Kopier oppsummering' : 'Kopier tekst'}</span></button>
        <button class="btn" type="button" data-action="save-menu" data-id="${item.id}">${ICON.save}<span>Lagre …</span></button>
        ${fileName ? `<span class="file">${esc(item.files.dir ? `${item.files.dir}/` : '')}${esc(fileName)}</span>` : ''}
      </div>
    </section>`;
}

// Innstillinger

function settingsHTML(place) {
  const model = state.settings.model;
  const device = hasGPU ? 'webgpu' : 'wasm';
  const models = MODELS.map((m) => `<option value="${m.id}" ${m.id === model ? 'selected' : ''} ${m.webgpuOnly && !hasGPU ? 'disabled' : ''}>${esc(`${m.name} (${m.note}) · ${m.size[device]}`)}</option>`).join('');
  const languages = LANGUAGES.map((l) => `<option value="${l.code}" ${l.code === state.settings.language ? 'selected' : ''}>${l.name}</option>`).join('');
  const speakers = SPEAKER_CHOICES.map((s) => `<option value="${s.value}" ${Number(s.value) === Number(state.settings.speakers) ? 'selected' : ''}>${s.name}</option>`).join('');

  let storage;
  if (files.canUseFolder) {
    if (!state.folder) {
      storage = `<span class="muted">Lagres i</span> <span>bare nettleseren</span> <button class="btn" type="button" data-action="choose-folder">Velg mappe …</button>`;
    } else if (!state.folder.granted) {
      storage = `<span class="muted">Lagres i</span> <span>📁 ${esc(state.folder.name)}</span> <button class="btn primary" type="button" data-action="grant-folder">Gi tilgang igjen</button> <button class="btn plain" type="button" data-action="forget-folder">Slutt å bruke</button>`;
    } else {
      storage = `<span class="muted">Lagres i</span> <span>📁 ${esc(state.folder.name)}</span> <button class="btn" type="button" data-action="choose-folder">Bytt …</button> <button class="btn plain" type="button" data-action="forget-folder">Slutt å bruke</button>`;
    }
  } else {
    storage = `<span class="muted">Lagring:</span> <span class="small">Bruk «Lagre …» på hvert opptak for å velge hvor filene havner.${isIOS ? ' Velg «Arkiver i Filer» for å velge mappe.' : ''}</span>`;
  }

  const aiStatus = state.aiProgress !== null && state.aiProgress !== undefined
    ? `<span class="small muted" id="ai-status">Laster ned AI-modellen: ${Math.round(state.aiProgress * 100)} %</span>`
    : state.settings.aiEnabled
      ? '<span class="small muted" id="ai-status">På. Kjører lokalt, uten innlogging.</span>'
      : `<span class="small muted" id="ai-status">Av. Laster ned en AI-modell (${ai.AI_SIZE}) første gang.${isTouch ? ' Krever mye minne, og virker best på datamaskin.' : ''}</span>`;

  const install = place === 'sheet' && !isStandalone
    ? `<p class="field-note">${isIOS
      ? 'Legg appen på Hjem-skjermen: trykk Del-knappen i Safari og velg «Legg til på Hjem-skjerm».'
      : 'Legg appen på hjemskjermen: åpne menyen i nettleseren og velg «Installer app» eller «Legg til på startskjermen».'}</p>`
    : '';

  return `
    <div class="settings-row">
      <label class="field"><span>Språk</span><select data-setting="language">${languages}</select></label>
      <label class="field"><span>Modell</span><select data-setting="model">${models}</select></label>
      <label class="field"><span>Personer</span><select data-setting="speakers">${speakers}</select></label>
    </div>
    <div class="settings-row">
      <div class="folder-line">${storage}</div>
      <div class="ai-line">
        <label class="switch"><input type="checkbox" data-setting="aiEnabled" ${state.settings.aiEnabled ? 'checked' : ''}> <span>Oppsummering og titler med AI</span></label>
        ${aiStatus}
      </div>
      <span class="about small muted">Laget av ${T.AUTHOR} · <a href="mailto:${T.EMAIL}?subject=Transkriber">${T.EMAIL}</a></span>
    </div>
    ${install}`;
}

function updateAIProgress() {
  for (const el of document.querySelectorAll('#ai-status')) {
    el.textContent = state.aiProgress !== null && state.aiProgress !== undefined
      ? `Laster ned AI-modellen: ${Math.round(state.aiProgress * 100)} %`
      : 'På. Kjører lokalt, uten innlogging.';
  }
}

// MARK: Dialoger

function openDialog(html) {
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  const focus = dialog.querySelector('[autofocus]');
  focus?.focus();
  focus?.select?.();
}

function closeDialog() {
  if (dialog.open) dialog.close();
  dialog.innerHTML = '';
}

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});

function showMessage(title, message) {
  openDialog(`
    <div class="sheet">
      <h2>${esc(title)}</h2>
      <p style="white-space:pre-wrap">${esc(message)}</p>
      <div class="sheet-actions"><button class="btn primary" type="button" data-action="close-dialog" autofocus>OK</button></div>
    </div>`);
}

function itemMenu(id) {
  const item = findItem(id);
  if (!item) return;
  openDialog(`
    <div class="menu" role="menu" aria-label="${esc(item.title)}">
      <button type="button" role="menuitem" data-action="rename" data-id="${id}">${ICON.pencil}Gi nytt navn …</button>
      <button type="button" role="menuitem" data-action="save-menu" data-id="${id}">${ICON.save}Lagre …</button>
      ${item.transcript
        ? `<button type="button" role="menuitem" data-action="transcribe" data-id="${id}" ${state.job ? 'disabled' : ''}>${ICON.redo}Transkriber på nytt</button>
           <button type="button" role="menuitem" data-action="summarize" data-id="${id}">${ICON.sparkles}Lag oppsummering på nytt</button>`
        : `<button type="button" role="menuitem" data-action="transcribe" data-id="${id}" ${state.job ? 'disabled' : ''}>${ICON.wave}Transkriber</button>`}
      <hr>
      <button type="button" role="menuitem" class="destructive" data-action="delete" data-id="${id}">${ICON.trash}Slett …</button>
    </div>`);
}

function renameDialog(id) {
  const item = findItem(id);
  if (!item) return;
  openDialog(`
    <form class="sheet" data-form="rename" data-id="${id}">
      <h2>Gi opptaket nytt navn</h2>
      <input class="text-input" name="title" value="${esc(item.title)}" autofocus aria-label="Tittel" enterkeyhint="done">
      <p class="small">Filene får samme navn, med tidspunktet foran.</p>
      <div class="sheet-actions">
        <button class="btn" type="button" data-action="close-dialog">Avbryt</button>
        <button class="btn primary" type="submit">Lagre</button>
      </div>
    </form>`);
}

function deleteDialog(id) {
  const item = findItem(id);
  if (!item) return;
  openDialog(`
    <div class="sheet">
      <h2>Slette «${esc(item.title)}»?</h2>
      <p>Lyden og teksten slettes fra appen. Filer du har lagret andre steder, blir liggende.</p>
      <div class="sheet-actions">
        <button class="btn" type="button" data-action="close-dialog" autofocus>Avbryt</button>
        <button class="btn danger" type="button" data-action="confirm-delete" data-id="${id}">Slett</button>
      </div>
    </div>`);
}

let pendingSave = null;

async function saveDialog(id) {
  const item = findItem(id);
  if (!item) return;
  // Filene gjøres klare før du trykker, så delingsarket på iPhone åpner seg med en gang
  const audio = await store.getAudio(id);
  pendingSave = { item, set: fileSet(item, audio) };
  const { set } = pendingSave;
  const option = (kind, label, detail) => set[kind]
    ? `<button type="button" data-action="save-file" data-kind="${kind}">${ICON.save}<span>${label}<br><span class="small muted">${esc(detail)}</span></span></button>`
    : '';
  const count = Object.keys(set).length;
  openDialog(`
    <div class="menu" role="menu" aria-label="Lagre">
      ${option('text', 'Tekst', set.text?.name)}
      ${option('summary', 'Oppsummering', set.summary?.name)}
      ${option('audio', 'Lyd', set.audio?.name)}
      ${count > 1 ? `<hr><button type="button" data-action="save-file" data-kind="all">${ICON.save}<span>Alt (${count} filer)</span></button>` : ''}
      <hr>
      <button type="button" data-action="close-dialog">Avbryt</button>
    </div>`);
}

async function saveKind(kind) {
  if (!pendingSave) return;
  const { set } = pendingSave;
  const list = kind === 'all' ? Object.values(set) : [set[kind]].filter(Boolean);
  closeDialog();
  try {
    const result = await files.saveFiles(list);
    if (result === 'saved') {
      state.banner = list.length === 1 ? `Lagret «${list[0].name}».` : `Lagret ${list.length} filer.`;
      if (state.screen === 'home') render();
    }
  } catch (error) {
    showMessage('Lagre', `Klarte ikke å lagre.\n\n${error?.message || error}`);
  }
}

function settingsDialog() {
  openDialog(`
    <div class="sheet">
      <h2>Innstillinger</h2>
      <div class="settings">${settingsHTML('sheet')}</div>
      <div class="sheet-actions"><button class="btn primary" type="button" data-action="close-dialog" autofocus>Ferdig</button></div>
    </div>`);
}

// MARK: Hendelser

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const { action, id } = target.dataset;
  switch (action) {
    case 'record': return startRecording();
    case 'pick-file': return $('#file-input')?.click();
    case 'transcribe-drafts': return transcribe(drafts().map((i) => i.id).reverse());
    case 'transcribe': closeDialog(); return transcribe([id]);
    case 'show': return openResult(id);
    case 'item-menu': return itemMenu(id);
    case 'rename': return renameDialog(id);
    case 'save-menu': return saveDialog(id);
    case 'save-file': return saveKind(target.dataset.kind);
    case 'delete': return deleteDialog(id);
    case 'confirm-delete': closeDialog(); return deleteItem(id);
    case 'summarize': closeDialog(); { const item = findItem(id); if (item?.transcript) { item.transcript.summaryError = null; enqueueSummary(id); render(); } } return;
    case 'open-settings': return settingsDialog();
    case 'close-dialog': return closeDialog();
    case 'choose-folder': return chooseFolder().then(() => dialog.open && settingsDialog());
    case 'grant-folder': return grantFolder().then(() => dialog.open && settingsDialog());
    case 'forget-folder': state.folder = await files.forgetFolder(); render(); if (dialog.open) settingsDialog(); return;
    case 'rec-cancel': return recorder.cancelCountdown();
    case 'rec-finish': return recorder.finish();
    case 'rec-pause': return recorder.togglePause();
    case 'rec-lap': return recorder.newLap();
    case 'rec-flag': return addFlag();
    case 'rec-mini': return showMini();
    case 'cancel-job': return cancelJob();
    case 'dismiss-error': state.error = null; return render();
    case 'back': commitResultInputs(); state.screen = 'home'; return render();
    case 'tab': state.resultTab = target.dataset.tab; return render();
    case 'copy': return copyCurrent(target);
    default: return undefined;
  }
});

async function copyCurrent(button) {
  const item = findItem(state.resultId);
  if (!item?.transcript) return;
  const text = state.resultTab === 'summary'
    ? T.renderSummary(item.transcript.summary || '', item.speakerNames, T.speakerCount(item.transcript))
    : T.renderText(item.transcript, item.speakerNames);
  try {
    await navigator.clipboard.writeText(text);
    const label = button.querySelector('#copy-label');
    if (label) label.textContent = 'Kopiert';
  } catch {
    showMessage('Kopier', 'Nettleseren lot ikke appen kopiere. Marker teksten og kopier den selv.');
  }
}

function commitResultInputs() {
  const title = $('#title-input');
  if (title) renameItem(title.dataset.id, title.value);
  for (const input of document.querySelectorAll('[data-speaker]')) {
    renameSpeaker(input.dataset.id, Number(input.dataset.speaker), input.value);
  }
}

document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.id === 'file-input') {
    importFiles(el.files);
    el.value = '';
    return;
  }
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    if (key === 'aiEnabled') return toggleAI(el.checked);
    const value = key === 'speakers' ? Number(el.value) : el.value;
    state.settings[key] = value;
    store.writeSetting(key, value);
    return;
  }
  if (el.id === 'title-input') return renameItem(el.dataset.id, el.value);
  if (el.dataset.speaker !== undefined) return renameSpeaker(el.dataset.id, Number(el.dataset.speaker), el.value);
});

document.addEventListener('keydown', (event) => {
  const el = event.target;
  if (event.key === 'Enter' && (el.id === 'title-input' || el.dataset?.speaker !== undefined)) {
    el.blur();
    return;
  }
  if (!recorder.isActive || dialog.open) return;
  if (el.matches?.('input, textarea, select')) return;
  if (recorder.state === 'countdown') {
    if (event.key === 'Escape') recorder.cancelCountdown();
    return;
  }
  if (event.key === ' ') { event.preventDefault(); recorder.togglePause(); }
  else if (event.key === 'Enter') { event.preventDefault(); recorder.newLap(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); addFlag(); }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.dataset.form === 'rename') {
    event.preventDefault();
    renameItem(form.dataset.id, new FormData(form).get('title'));
    closeDialog();
  }
});

// Slipp lydfiler i vinduet
let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  dragDepth += 1;
  $('#drop-card')?.classList.add('targeted');
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#drop-card')?.classList.remove('targeted');
});
document.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  dragDepth = 0;
  $('#drop-card')?.classList.remove('targeted');
  importFiles(event.dataTransfer.files);
});

window.addEventListener('beforeunload', (event) => {
  if (recorder.isActive || state.job) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// MARK: Start

async function start() {
  try {
    state.items = (await store.allItems()) || [];
  } catch (error) {
    state.items = [];
    state.error = `Klarte ikke å åpne lagringen i nettleseren. Privat nettlesing kan blokkere den.\n\n${error?.message || error}`;
  }
  sortItems();
  // Oppsummeringer som ble avbrutt da appen ble lukket
  for (const item of state.items) {
    if (item.transcript && !item.transcript.summary && !item.transcript.summaryError && state.settings.aiEnabled) {
      item.transcript.summaryError = 'Oppsummeringen ble avbrutt. Trykk «Lag oppsummering» for å prøve igjen.';
    }
  }
  state.folder = await files.loadFolder();
  if (state.settings.aiEnabled) state.aiReason = await ai.aiUnavailableReason();
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();

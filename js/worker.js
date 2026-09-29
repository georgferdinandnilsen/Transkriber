// Kjører Whisper og stemmegjenkjenning i bakgrunnen, så appen ikke fryser.
// Alt skjer i nettleseren. Lyden sendes ikke noe sted.

import {
  pipeline,
  env,
  AutoProcessor,
  AutoModelForAudioFrameClassification,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
import { DIARIZATION_REPO, dtypeFor } from './models.js';
import { cleanLine, isFake, assignSpeakers, turnsFromDiarization } from './text.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const SR = 16000;
let asr = null;
let asrKey = '';
let segmentation = null;
let gpu = null;

async function detectGPU() {
  if (gpu) return gpu;
  gpu = { ok: false, f16: false };
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) gpu = { ok: true, f16: adapter.features.has('shader-f16') };
  } catch {
    // Ingen WebGPU: bruker vanlig prosessor
  }
  return gpu;
}

function progressTracker(stage) {
  const files = new Map();
  return (data) => {
    if (data.status === 'progress' && data.total) {
      files.set(data.file, { loaded: data.loaded, total: data.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      const fraction = total ? loaded / total : 0;
      post({ type: 'status', stage: fraction >= 0.999 ? 'loading' : stage, progress: fraction >= 0.999 ? 0 : fraction });
    } else if (data.status === 'ready') {
      post({ type: 'status', stage: 'loading', progress: 0 });
    }
  };
}

function post(message) {
  self.postMessage(message);
}

/** Feil som gjør at appen prøver på nytt uten WebGPU, i en ny worker. */
class WebGPUFailed extends Error {}

async function loadASR(model, forceWasm) {
  const { ok, f16 } = await detectGPU();
  const device = ok && !forceWasm ? 'webgpu' : 'wasm';
  if (model.webgpuOnly && device !== 'webgpu') {
    throw new Error(`${model.name} krever WebGPU, som denne nettleseren ikke har. Velg NB-Whisper eller Whisper Small.`);
  }
  const key = `${model.repo}|${device}`;
  if (asr && asrKey === key) return device;
  asr = null;
  asrKey = '';
  try {
    post({ type: 'status', stage: 'downloading', progress: 0 });
    asr = await pipeline('automatic-speech-recognition', model.repo, {
      device,
      dtype: dtypeFor(model, device, f16),
      progress_callback: progressTracker('downloading'),
    });
  } catch (error) {
    // ONNX Runtime kan ikke bytte fra WebGPU til WASM i samme worker
    if (device === 'webgpu' && !model.webgpuOnly) throw new WebGPUFailed(error?.message || String(error));
    throw error;
  }
  asrKey = key;
  return device;
}

async function diarize(audio) {
  if (!segmentation) {
    post({ type: 'status', stage: 'speakers', progress: 0 });
    const processor = await AutoProcessor.from_pretrained(DIARIZATION_REPO);
    const model = await AutoModelForAudioFrameClassification.from_pretrained(DIARIZATION_REPO, {
      device: 'wasm',
      dtype: 'fp32',
    });
    segmentation = { processor, model };
  }
  const { processor, model } = segmentation;
  const inputs = await processor(audio);
  const { logits } = await model(inputs);
  const [segments] = processor.post_process_speaker_diarization(logits, audio.length);
  return turnsFromDiarization(segments);
}

const MAX_DIARIZATION_SECONDS = 25 * 60;

async function transcribe({ audio, chunks, model, language, speakers, forceWasm }) {
  const device = await loadASR(model, forceWasm);
  post({ type: 'status', stage: 'transcribing', progress: 0, device });

  const options = { task: 'transcribe', return_timestamps: true };
  if (language && language !== 'auto') options.language = language;

  const lines = [];
  for (let i = 0; i < chunks.length; i++) {
    const [from, to] = chunks[i];
    const offset = from / SR;
    const length = (to - from) / SR;
    const output = await asr(audio.subarray(from, to), options);
    const found = [];
    for (const part of output.chunks || [{ timestamp: [0, length], text: output.text }]) {
      if (isFake(part.text)) continue;
      const text = cleanLine(part.text);
      if (!text) continue;
      const [start, end] = part.timestamp || [0, length];
      found.push({
        start: offset + (start ?? 0),
        end: offset + Math.min(end ?? length, length),
        text,
        speaker: null,
      });
    }
    lines.push(...found);
    post({ type: 'lines', lines: found, progress: (i + 1) / chunks.length });
  }

  if (speakers !== 0 && lines.length && audio.length / SR > MAX_DIARIZATION_SECONDS) {
    post({ type: 'warning', message: 'Opptaket er over 25 minutter, som er for langt til å skille mellom personer i nettversjonen. Del lange intervjuer opp med «Ny runde».' });
  } else if (speakers !== 0 && lines.length) {
    // Går stemmegjenkjenningen galt, beholdes teksten uten navn
    try {
      post({ type: 'status', stage: 'speakers', progress: 0 });
      const turns = await diarize(audio);
      return assignSpeakers(lines, turns, speakers);
    } catch (error) {
      post({ type: 'warning', message: `Klarte ikke å skille mellom personer: ${error?.message || error}` });
    }
  }
  return lines;
}

self.onmessage = async (event) => {
  const { type } = event.data;
  if (type !== 'transcribe') return;
  try {
    const lines = await transcribe(event.data);
    post({ type: 'done', lines });
  } catch (error) {
    post({ type: 'error', message: error?.message || String(error), webgpuFailed: error instanceof WebGPUFailed });
  }
};

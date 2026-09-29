// Språkmodellene appen kan bruke. Lastes ned fra Hugging Face første gang og lagres i nettleseren.

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

export const MODELS = [
  {
    id: 'nb-small',
    name: 'NB-Whisper Small',
    note: 'norsk, anbefalt',
    repo: 'onnx-community/nb-whisper-small-ONNX',
    size: { webgpu: '590 MB', wasm: '330 MB' },
  },
  {
    id: 'nb-base',
    name: 'NB-Whisper Base',
    note: 'norsk, rask, for mobil',
    repo: 'onnx-community/nb-whisper-base-ONNX',
    size: { webgpu: '210 MB', wasm: '150 MB' },
  },
  {
    id: 'en-small',
    name: 'Whisper Small',
    note: 'engelsk, rask',
    repo: 'onnx-community/whisper-small',
    size: { webgpu: '590 MB', wasm: '330 MB' },
  },
  {
    id: 'turbo',
    name: 'Turbo',
    note: 'best på engelsk, krever datamaskin',
    repo: 'onnx-community/whisper-large-v3-turbo',
    webgpuOnly: true,
    size: { webgpu: '1,4 GB', wasm: '1,4 GB' },
  },
];

export const DIARIZATION_REPO = 'onnx-community/pyannote-segmentation-3.0';

export function modelFor(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}

/** Hvilke filvarianter som lastes ned, ut fra om nettleseren har WebGPU. */
export function dtypeFor(model, device, hasF16) {
  if (device === 'webgpu') {
    if (model.id === 'turbo') {
      return { encoder_model: hasF16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' };
    }
    return { encoder_model: 'fp32', decoder_model_merged: 'q4' };
  }
  return { encoder_model: 'q8', decoder_model_merged: 'q4' };
}

// Whisper i nettleseren kan ikke oppdage språket selv, så det må velges.
export const LANGUAGES = [
  { code: 'no', name: 'Norsk' },
  { code: 'en', name: 'Engelsk' },
];

export const SPEAKER_CHOICES = [
  { value: -1, name: 'Finn ut selv' },
  { value: 2, name: '2 personer' },
  { value: 3, name: '3 personer' },
  { value: 0, name: 'Ikke skill' },
];

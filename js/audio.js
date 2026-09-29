// Gjør lyd (også lyd fra video) om til 16 kHz mono, som Whisper trenger,
// og deler lange opptak i biter der det er stille, så ingen ord blir kuttet.

export const SAMPLE_RATE = 16000;

export async function decodeToMono16k(blob) {
  const data = await blob.arrayBuffer();
  // En OfflineAudioContext på 16 kHz gjør om lyden til riktig frekvens allerede under dekodingen
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Offline(1, 1, SAMPLE_RATE);
  const decoded = await new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(data, resolve, reject);
    if (result?.then) result.then(resolve, reject);
  });
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0).slice();
  // Stereo: gjennomsnitt av kanalene
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
  }
  return mono;
}

/**
 * Finner steder å dele lyden, helst der det er stille.
 * Hver bit er høyst 29 sekunder, fordi Whisper hører på 30 sekunder om gangen.
 */
export function splitPoints(samples, { target = 22, max = 29 } = {}) {
  const sr = SAMPLE_RATE;
  const chunks = [];
  let start = 0;
  const frame = Math.round(0.3 * sr);
  const hop = Math.round(0.1 * sr);
  while (samples.length - start > max * sr) {
    const from = start + Math.round(target * sr);
    const to = start + Math.round(max * sr) - frame;
    let best = to;
    let bestEnergy = Infinity;
    for (let pos = from; pos <= to; pos += hop) {
      let sum = 0;
      for (let i = pos; i < pos + frame; i += 4) sum += samples[i] * samples[i];
      if (sum < bestEnergy) { bestEnergy = sum; best = pos + Math.round(frame / 2); }
    }
    chunks.push([start, best]);
    start = best;
  }
  if (samples.length - start > sr * 0.2 || !chunks.length) chunks.push([start, samples.length]);
  return chunks;
}

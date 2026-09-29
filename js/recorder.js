// Tar opp lyd i runder, omtrent som rundene i Stoppeklokke.
// Hver runde blir en egen lydfil som legges i listen som et utkast.

import { readSetting, writeSetting } from './store.js';
import { displayDate, baseName } from './text.js';

const MP4 = [['audio/mp4;codecs=mp4a.40.2', 'm4a'], ['audio/mp4', 'm4a']];
const WEBM = [['audio/webm;codecs=opus', 'webm'], ['audio/webm', 'webm'], ['audio/ogg;codecs=opus', 'ogg']];
const isSafari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  // Safari lager best m4a, de andre nettleserne webm
  const order = isSafari ? [...MP4, ...WEBM] : [...WEBM, ...MP4];
  for (const [type, ext] of order) {
    if (MediaRecorder.isTypeSupported?.(type)) return { type, ext };
  }
  return { type: '', ext: 'webm' };
}

export const MIC_DENIED =
  'Transkriber har ikke tilgang til mikrofonen. Gi tilgang i nettleserens innstillinger for denne siden, og prøv igjen.';

export class Recorder {
  constructor({ onChange, onTick, onLap, onError }) {
    this.onChange = onChange;
    this.onTick = onTick;
    this.onLap = onLap;
    this.onError = onError;
    this.reset();
  }

  reset() {
    this.state = 'idle'; // idle | countdown | recording | paused
    this.countdown = 0;
    this.sessionName = '';
    this.sessionNumber = 0;
    this.sessionStart = 0;
    this.lapNumber = 0;
    this.lapTime = 0;
    this.totalTime = 0;
    this.flagTimes = [];
    this.laps = [];
    this.levels = new Array(48).fill(0);
    this.lastFlagTime = 0;
    this.flagCounter = 0;
    this.busy = false;
  }

  get isActive() { return this.state !== 'idle'; }
  get isRecordingOrPaused() { return this.state === 'recording' || this.state === 'paused'; }

  // MARK: Start med nedtelling

  async begin() {
    if (this.isActive || this.starting) return;
    this.starting = true;
    try {
      await this.beginNow();
    } finally {
      this.starting = false;
    }
  }

  async beginNow() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.onError('Denne nettleseren kan ikke ta opp lyd. Prøv Safari, Chrome eller Edge i nyeste versjon.');
      return;
    }
    // Lyd må startes direkte fra et trykk, ellers blokkerer Safari den
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new Ctx();
    this.audioContext.resume?.();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      this.audioContext.close?.();
      this.audioContext = null;
      this.onError(error?.name === 'NotAllowedError' ? MIC_DENIED : `Mikrofonen svarte ikke.\n\n${error?.message || error}`);
      return;
    }
    for (const track of this.stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (this.isRecordingOrPaused) {
          this.onError('Mikrofonen ble koblet fra, eller telefonen stoppet opptaket. Runden så langt er lagret som utkast.');
          this.finish();
        }
      });
    }

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.levelBuffer = new Float32Array(this.analyser.fftSize);

    this.mime = pickMime();
    this.reset();
    this.sessionNumber = (readSetting('recordingCounter', 0) || 0) + 1;
    writeSetting('recordingCounter', this.sessionNumber);
    this.sessionName = `Opptak ${this.sessionNumber}`;
    this.sessionStart = Date.now();
    this.keepAwake();

    this.state = 'countdown';
    this.countdown = 3;
    this.beep();
    this.onChange();
    this.countdownTimer = setInterval(() => {
      if (this.state !== 'countdown') return clearInterval(this.countdownTimer);
      if (this.countdown > 1) {
        this.countdown -= 1;
        this.beep();
        this.onChange();
      } else {
        clearInterval(this.countdownTimer);
        this.startLap();
      }
    }, 1000);
  }

  cancelCountdown() {
    clearInterval(this.countdownTimer);
    this.teardown();
    this.giveBackNumber();
    this.state = 'idle';
    this.onChange();
  }

  // MARK: Under opptak

  togglePause() {
    if (!this.recorder) return;
    if (this.state === 'recording') {
      this.recorder.pause();
      this.lapAccumulated += (performance.now() - this.activeSince) / 1000;
      this.activeSince = null;
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.recorder.resume();
      this.activeSince = performance.now();
      this.state = 'recording';
    }
    this.tick();
    this.onChange();
  }

  /** Avslutter runden som pågår (lagres som utkast) og starter en ny med en gang. */
  async newLap() {
    if (!this.isRecordingOrPaused || this.busy) return;
    this.busy = true;
    try {
      await this.finishLap();
    } catch (error) {
      this.onError(`Klarte ikke å lagre runden.\n\n${error?.message || error}`);
    } finally {
      this.busy = false;
    }
    if (this.finishRequested) return this.finish();
    this.startLap();
  }

  /** Setter et flagg på tidspunktet i runden som pågår. Blir til 🚩 i teksten. */
  addFlag() {
    if (!this.isRecordingOrPaused) return;
    this.tick();
    this.flagTimes.push(this.lapTime);
    this.lastFlagTime = this.lapTime;
    this.flagCounter += 1;
    this.onChange();
  }

  /** Avslutter hele opptaket. Den siste runden lagres som utkast. */
  async finish() {
    if (this.state === 'countdown') return this.cancelCountdown();
    if (!this.isRecordingOrPaused) return;
    // En runde lagres akkurat nå: avslutt når den er ferdig
    if (this.busy) { this.finishRequested = true; return; }
    this.busy = true;
    try {
      await this.finishLap();
    } catch (error) {
      this.onError(`Klarte ikke å lagre runden.\n\n${error?.message || error}`);
    } finally {
      this.teardown();
      if (!this.laps.length) this.giveBackNumber();
      this.state = 'idle';
      this.busy = false;
      this.finishRequested = false;
      this.onChange();
    }
  }

  // MARK: Runder

  startLap() {
    this.lapNumber += 1;
    this.chunks = [];
    try {
      const options = { audioBitsPerSecond: 96000 };
      if (this.mime.type) options.mimeType = this.mime.type;
      this.recorder = new MediaRecorder(this.stream, options);
    } catch (error) {
      this.onError(`Klarte ikke å starte opptaket.\n\n${error?.message || error}`);
      this.teardown();
      this.state = 'idle';
      this.onChange();
      return;
    }
    this.recorder.ondataavailable = (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    };
    this.recorder.start(1000);
    this.lapStart = Date.now();
    this.lapAccumulated = 0;
    this.lapTime = 0;
    this.activeSince = performance.now();
    this.state = 'recording';
    this.startMeter();
    this.onChange();
  }

  async finishLap() {
    const recorder = this.recorder;
    if (!recorder) return;
    if (this.activeSince !== null) this.lapAccumulated += (performance.now() - this.activeSince) / 1000;
    this.activeSince = null;
    this.recorder = null;
    // Flagg som settes mens runden lagres, hører til neste runde
    const flags = this.flagTimes;
    this.flagTimes = [];
    if (recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        recorder.addEventListener('stop', resolve, { once: true });
        recorder.stop();
      });
    }
    const duration = this.lapAccumulated;
    this.totalAccumulated = (this.totalAccumulated || 0) + duration;
    this.lapTime = 0;

    // Et tilfeldig trykk som ga under ett sekund lyd, forkastes
    if (duration < 1 || !this.chunks.length) {
      this.lapNumber -= 1;
      return;
    }

    const blob = new Blob(this.chunks, { type: recorder.mimeType || this.mime.type || 'audio/webm' });
    this.laps.unshift({ number: this.lapNumber, duration, flagCount: flags.length });
    const title = `${this.sessionName} - Runde ${this.lapNumber}`;
    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title,
      subtitle: `${displayDate(this.lapStart)} · ${this.sessionName}, runde ${this.lapNumber}`,
      createdAt: this.lapStart,
      duration,
      flags,
      source: 'recording',
      sessionFolder: baseName(this.sessionStart, this.sessionName),
      audioType: blob.type,
      audioExt: this.mime.ext,
      titleIsCustom: false,
      speakerNames: [],
      transcript: null,
      files: {},
    };
    await this.onLap(item, blob);
  }

  // MARK: Tid og lydnivå

  startMeter() {
    if (this.meterTimer) return;
    this.meterTimer = setInterval(() => this.tick(), 50);
  }

  tick() {
    const running = this.activeSince !== null && this.activeSince !== undefined
      ? (performance.now() - this.activeSince) / 1000 : 0;
    this.lapTime = (this.lapAccumulated || 0) + running;
    this.totalTime = (this.totalAccumulated || 0) + this.lapTime;
    if (this.state === 'recording' && this.analyser) {
      this.analyser.getFloatTimeDomainData(this.levelBuffer);
      let sum = 0;
      for (const v of this.levelBuffer) sum += v * v;
      const rms = Math.sqrt(sum / this.levelBuffer.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      const level = Math.max(0, Math.min(1, (db + 55) / 55));
      this.levels.push(level);
      this.levels.shift();
    }
    this.onTick?.();
  }

  // MARK: Hjelpere

  teardown() {
    clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.audioContext?.close?.();
    this.audioContext = null;
    this.analyser = null;
    this.totalAccumulated = 0;
    this.releaseWake();
  }

  /** Et opptak som aldri ble noe av, skal ikke bruke opp et nummer */
  giveBackNumber() {
    if (readSetting('recordingCounter', 0) === this.sessionNumber) {
      writeSetting('recordingCounter', this.sessionNumber - 1);
    }
  }

  beep() {
    const ctx = this.audioContext;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1320;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Pipet er bare en hjelp
    }
  }

  /** Holder skjermen på under opptak, så telefonen ikke stopper det */
  async keepAwake() {
    try {
      const lock = await navigator.wakeLock?.request('screen');
      this.wakeLock = lock || null;
      lock?.addEventListener('release', () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
    } catch {
      this.wakeLock = null;
    }
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && this.isActive && !this.wakeLock) this.keepAwake();
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  releaseWake() {
    this.wakeLock?.release?.().catch(() => {});
    this.wakeLock = null;
  }
}

/**
 * Story Atlas — Recorder
 * Wraps MediaRecorder. Records audio, animates waveform, ticks timer.
 * Falls back gracefully when MediaRecorder is unavailable.
 *
 * Usage:
 *   import { Recorder } from './recorder.js';
 *   const rec = new Recorder({ onStop: (blob, duration) => { ... } });
 *   rec.start();
 *   rec.stop();
 */

export class Recorder {
  /**
   * @param {object} opts
   * @param {(blob: Blob, durationSecs: number) => void} opts.onStop
   * @param {(bars: number[]) => void} [opts.onWaveform]  — array of 46 amplitudes 0-1
   * @param {(secs: number) => void}  [opts.onTick]       — called every second
   * @param {() => void}              [opts.onStart]
   * @param {(msg: string) => void}   [opts.onError]
   */
  constructor(opts = {}) {
    this._onStop     = opts.onStop     || (() => {});
    this._onWaveform = opts.onWaveform || null;
    this._onTick     = opts.onTick     || null;
    this._onStart    = opts.onStart    || null;
    this._onError    = opts.onError    || null;

    this._mediaRecorder = null;
    this._chunks        = [];
    this._startTime     = null;
    this._timerInterval = null;
    this._animFrame     = null;
    this._analyser      = null;
    this._dataArray     = null;
    this._stream        = null;
    this.isRecording    = false;
    this.duration       = 0;
  }

  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async start() {
    if (this.isRecording) return;
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone access was denied. Please allow microphone access and try again.'
        : `Could not access the microphone: ${err.message}`;
      this._onError && this._onError(msg);
      return;
    }

    // Set up AudioContext for waveform visualisation
    if (this._onWaveform) {
      try {
        const ctx      = new (window.AudioContext || window.webkitAudioContext)();
        const source   = ctx.createMediaStreamSource(this._stream);
        this._analyser = ctx.createAnalyser();
        this._analyser.fftSize = 128;
        this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);
        source.connect(this._analyser);
        this._animateWaveform();
      } catch (_) { /* visualisation not critical */ }
    }

    // Prefer webm/opus, fall back to whatever the browser supports
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', '']
      .find(m => m === '' || MediaRecorder.isTypeSupported(m));

    this._chunks = [];
    this._mediaRecorder = new MediaRecorder(this._stream, mimeType ? { mimeType } : {});
    this._mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    });
    this._mediaRecorder.addEventListener('stop', () => this._finalize());
    this._mediaRecorder.start(250); // collect data every 250ms

    this._startTime = Date.now();
    this.isRecording = true;
    this.duration = 0;

    this._timerInterval = setInterval(() => {
      this.duration = (Date.now() - this._startTime) / 1000;
      this._onTick && this._onTick(this.duration);
    }, 1000);

    this._onStart && this._onStart();
  }

  stop() {
    if (!this.isRecording) return;
    this.isRecording = false;
    clearInterval(this._timerInterval);
    cancelAnimationFrame(this._animFrame);
    this.duration = (Date.now() - this._startTime) / 1000;

    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop();
    }
    this._stream && this._stream.getTracks().forEach(t => t.stop());
  }

  _finalize() {
    if (!this._chunks.length) return;
    const mimeType = this._mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(this._chunks, { type: mimeType });

    // Convert to base64 data URL for localStorage
    const reader = new FileReader();
    reader.onload = () => this._onStop(blob, this.duration, reader.result);
    reader.readAsDataURL(blob);
  }

  _animateWaveform() {
    if (!this._analyser || !this.isRecording) return;
    this._analyser.getByteFrequencyData(this._dataArray);
    // Downsample to 46 bars
    const bars = [];
    const step = Math.floor(this._dataArray.length / 46);
    for (let i = 0; i < 46; i++) {
      bars.push(this._dataArray[i * step] / 255);
    }
    this._onWaveform(bars);
    this._animFrame = requestAnimationFrame(() => this._animateWaveform());
  }
}

/**
 * Render a static waveform into a container div.
 * @param {HTMLElement} container
 * @param {number[]} [amplitudes]  — optional array of 0-1 values; random if omitted
 */
export function renderWaveform(container, amplitudes) {
  const BARS = 46;
  const MIN_H = 10; // px
  const MAX_H = 62; // px
  container.innerHTML = '';
  for (let i = 0; i < BARS; i++) {
    const amp  = amplitudes ? amplitudes[i] ?? 0 : (0.15 + Math.random() * 0.85);
    const h    = Math.round(MIN_H + amp * (MAX_H - MIN_H));
    const bar  = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.height = `${h}px`;
    container.appendChild(bar);
  }
}

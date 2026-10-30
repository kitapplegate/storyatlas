/**
 * Story Atlas — Player
 * Custom audio player with scrubber, ±15s skip, and synced transcript.
 * Works on both mobile (bottom sheet) and desktop (right panel).
 */

import { formatDuration } from './storage.js';

export class Player {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.scrubberWrap    — .scrubber-wrap element
   * @param {HTMLElement} opts.scrubberFill    — .scrubber-fill element
   * @param {HTMLElement} opts.scrubberThumb   — .scrubber-thumb element
   * @param {HTMLElement} opts.timeElapsed     — time elapsed span
   * @param {HTMLElement} opts.timeDuration    — total duration span
   * @param {HTMLElement} opts.playBtn         — play/pause button
   * @param {HTMLElement} opts.transcriptEl    — transcript container
   * @param {string[]}    [opts.lines]         — transcript lines
   * @param {() => void}  [opts.onEnded]       — called when audio ends
   */
  constructor(opts) {
    this._scrubWrap  = opts.scrubberWrap;
    this._scrubFill  = opts.scrubberFill;
    this._scrubThumb = opts.scrubberThumb;
    this._timeEl     = opts.timeElapsed;
    this._durEl      = opts.timeDuration;
    this._playBtn    = opts.playBtn;
    this._transcriptEl = opts.transcriptEl;
    this._lines      = opts.lines || [];
    this._onEnded    = opts.onEnded || null;

    this._audio      = new Audio();
    this._rafId      = null;
    this.isPlaying   = false;

    this._bindAudio();
    this._bindScrubber();

    if (this._playBtn) {
      this._playBtn.addEventListener('click', () => this.togglePlay());
    }
  }

  /** Load an audio URL (blob: or legacy data:) and optionally start playing. */
  load(src, autoPlay = false) {
    this._revokeSrc();
    this._audio.src = src;
    this._audio.load();
    if (autoPlay) this.play();
  }

  play() {
    this._audio.play().catch(() => {});
  }

  pause() {
    this._audio.pause();
  }

  togglePlay() {
    if (this._audio.paused) this.play();
    else this.pause();
  }

  skip(secs) {
    this._audio.currentTime = Math.max(0,
      Math.min(this._audio.duration || 0, this._audio.currentTime + secs));
  }

  destroy() {
    this.destroyed = true;
    this._revokeSrc();
    cancelAnimationFrame(this._rafId);
    this._audio.pause();
    this._audio.removeAttribute('src');
    (this._winListeners || []).forEach(([ev, fn]) => window.removeEventListener(ev, fn));
  }

  // ── Private ────────────────────────────────────────────────────

  /** Free the memory behind a blob: URL from IndexedDB audio. */
  _revokeSrc() {
    if (this._audio.src.startsWith('blob:')) URL.revokeObjectURL(this._audio.src);
  }

  _bindAudio() {
    this._audio.addEventListener('play',  () => {
      this.isPlaying = true;
      this._updatePlayBtn();
      this._tick();
    });
    this._audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this._updatePlayBtn();
      cancelAnimationFrame(this._rafId);
    });
    this._audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this._updatePlayBtn();
      cancelAnimationFrame(this._rafId);
      this._onEnded && this._onEnded();
    });
    this._audio.addEventListener('loadedmetadata', () => {
      if (this._durEl) this._durEl.textContent = formatDuration(this._audio.duration);
      this._updateScrubber();
    });
    this._audio.addEventListener('timeupdate', () => this._updateScrubber());
  }

  _bindScrubber() {
    if (!this._scrubWrap) return;
    let dragging = false;

    const seek = (e) => {
      const rect = this._scrubWrap.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this._audio.currentTime = pct * (this._audio.duration || 0);
    };

    this._scrubWrap.addEventListener('mousedown', e => { dragging = true; seek(e); });
    this._scrubWrap.addEventListener('touchstart', e => {
      dragging = true; seek(e.touches[0]);
    }, { passive: true });
    // Kept so destroy() can remove them — otherwise every story opened adds four more
    this._winListeners = [
      ['mousemove', e => { if (dragging) seek(e); }],
      ['touchmove', e => { if (dragging) seek(e.touches[0]); }],
      ['mouseup',   () => { dragging = false; }],
      ['touchend',  () => { dragging = false; }],
    ];
    this._winListeners.forEach(([ev, fn]) => window.addEventListener(ev, fn, { passive: true }));
  }

  _tick() {
    if (!this.isPlaying) return;
    this._updateScrubber();
    this._syncTranscript();
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  _updateScrubber() {
    const cur = this._audio.currentTime || 0;
    const dur = this._audio.duration    || 0;
    const pct = dur > 0 ? cur / dur : 0;

    if (this._scrubFill)  this._scrubFill.style.width  = `${pct * 100}%`;
    if (this._scrubThumb) this._scrubThumb.style.left   = `${pct * 100}%`;
    if (this._timeEl)     this._timeEl.textContent       = formatDuration(cur);
  }

  _updatePlayBtn() {
    if (!this._playBtn) return;
    // Swap play ↔ pause icon
    if (this.isPlaying) {
      this._playBtn.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>
          <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>
        </svg>`;
      this._playBtn.setAttribute('aria-label', 'Pause');
    } else {
      this._playBtn.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>
        </svg>`;
      this._playBtn.setAttribute('aria-label', 'Play');
    }
  }

  _syncTranscript() {
    if (!this._transcriptEl || !this._lines.length) return;
    const cur = this._audio.currentTime || 0;
    const dur = this._audio.duration    || 0;
    if (!dur) return;

    // Distribute lines evenly across the duration
    const lineCount = this._lines.length;
    const lineIndex = Math.min(lineCount - 1, Math.floor((cur / dur) * lineCount));

    const els = this._transcriptEl.querySelectorAll('.transcript-line');
    els.forEach((el, i) => {
      el.classList.remove('current', 'upcoming');
      if (i === lineIndex) el.classList.add('current');
      else if (i > lineIndex) el.classList.add('upcoming');
    });

    // Scroll current line into view
    const currentEl = this._transcriptEl.querySelector('.transcript-line.current');
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /** Update transcript lines (e.g. after transcription completes). */
  setLines(lines) {
    this._lines = lines;
    if (this._transcriptEl) {
      this._transcriptEl.innerHTML = lines.map(l =>
        `<p class="transcript-line">${_esc(l)}</p>`
      ).join('');
    }
  }
}

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

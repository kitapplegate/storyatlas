/**
 * Story Atlas — App controller
 * Wires all modules together. Manages page routing and state.
 */

import {
  getStoriesSorted, getStoryById, saveStory, deleteStory,
  getStoryteller, saveStoryteller,
  generateId, formatDuration, assignEra,
} from './storage.js';

import { speakQuestion, stopSpeaking } from './interview.js';

import { Recorder, renderWaveform } from './recorder.js';
import { transcribe, detectPlaces }  from './transcriber.js';
import { startPlacer, hidePlacer }    from './placer.js';
import { Player }                     from './player.js';
import {
  initHomeMap, refreshHomePins,
  initListenMap, renderListenPins, flyToStory, addListenPin, fitAllListenPins,
} from './map.js';

// ── State ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

let _currentPage    = 'home';
let _recorder       = null;
let _timerInterval  = null;
let _player         = null;
let _currentStory   = null;   // story open in listen view
let _listenMapReady = false;
let _currentQuestion = null;

// Question bank (15 open-ended prompts)
const QUESTIONS = [
  'Tell me about the town or neighbourhood you grew up in — what did the streets look like when you stepped outside as a child?',
  'Tell me about the house you grew up in.',
  'What is your earliest memory of school?',
  'Tell me about a journey or trip that changed something for you.',
  'Tell me about the work you did that you are most proud of.',
  'What was the neighbourhood like when you first moved somewhere new?',
  'Tell me about the people who shaped who you became.',
  'Tell me about a celebration or gathering you still remember clearly.',
  'What was happening in the world when you were young, and how did you feel it?',
  'Tell me about a time you had to make a hard decision.',
  'Tell me about someone you loved and what they were like.',
  'Tell me about a place that no longer exists but that you remember well.',
  'Tell me about the food, music, or smells that take you back to a particular time.',
  'What is something you made, built, or created that you are proud of?',
  'Tell me what you would want the people who come after you to know about your life.',
];
let _usedQIndices = [];

// ── Init ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  _initWelcome();
  _bindNav();
  _bindRecord();
  _showPage('home');
});

function _initWelcome() {
  // Wire the save button once — modal is shown on demand, not on load
  $('welcome-save-btn').onclick = () => {
    const name = $('welcome-name-input').value.trim();
    if (!name) return;
    saveStoryteller({ name });
    $('welcome-modal-overlay').classList.remove('open');
    _refreshAll();
  };
  $('welcome-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('welcome-save-btn').click();
  });
  // "Browse first" link dismisses without saving
  $('welcome-skip-btn').onclick = () => {
    $('welcome-modal-overlay').classList.remove('open');
  };
}

/** Show the name modal — called when the user tries to record without a name set */
function _promptForName(afterSave) {
  $('welcome-modal-overlay').classList.add('open');
  $('welcome-name-input').focus();
  // Override save to also run the callback
  $('welcome-save-btn').onclick = () => {
    const name = $('welcome-name-input').value.trim();
    if (!name) return;
    saveStoryteller({ name });
    $('welcome-modal-overlay').classList.remove('open');
    _refreshAll();
    if (afterSave) afterSave();
  };
}

// ── Navigation ───────────────────────────────────────────────────

function _bindNav() {
  const navHome = $('nav-home');
  if (navHome) navHome.onclick = () => _showPage('home');
  $('nav-record').onclick  = () => _showPage('record');
  $('nav-listen').onclick  = () => _showPage('listen');
  $('nav-family').onclick  = () => _showToast('Family sharing coming soon.');
}

function _showPage(name) {
  ['home', 'record', 'listen', 'placer'].forEach(p => {
    const el = $(  `page-${p}`);
    if (el) el.style.display = (p === name) ? '' : 'none';
  });
  _currentPage = name;

  // Update nav active state
  ['home','record','listen'].forEach(p => {
    const btn = $(`nav-${p}`);
    if (btn) btn.classList.toggle('on', p === name);
  });

  if (name === 'home') {
    _renderHome();
    setTimeout(() => initHomeMap('home-leaflet'), 50);
  }
  if (name === 'listen' && _currentStory) {
    _renderListen(_currentStory);
  }
  if (name === 'listen' && !_currentStory) {
    const stories = getStoriesSorted();
    if (stories.length) _renderListen(stories[0]);
    else _renderListenEmpty();
  }
}

// ── Home page ────────────────────────────────────────────────────

function _renderHome() {
  const st     = getStoryteller();
  const stories = getStoriesSorted();

  // Appbar
  $('appbar-name').textContent = st.name || 'Story Atlas';

  // Hero
  $('home-storyteller-name').textContent = st.name || 'Stories';
  const places = stories.filter(s => s.place).length;
  $('home-meta').textContent = `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} · ${places} place${places === 1 ? '' : 's'} · Family only`;

  // Timeline strip in atlas card
  _renderHomeTimeline(stories);

  // Stories list
  _renderStoryList(stories);

  // Refresh map pins
  refreshHomePins();
}

function _renderHomeTimeline(stories) {
  const tl = $('home-timeline');
  if (!tl) return;
  const total = stories.length;
  const ERAS  = ['Childhood', 'Youth', 'Work', 'Family', 'Later'];

  let html = '<div class="tl-track"></div>';
  stories.forEach((s, i) => {
    const pct = total < 2 ? 50 : Math.round((i / (total - 1)) * 92 + 4);
    html += `<i class="tl-dot" style="left:${pct}%" title="${_esc(s.title || '')}"></i>`;
  });
  html += `<div class="tl-eras">${ERAS.map(e => `<span>${e}</span>`).join('')}</div>`;
  tl.innerHTML = html;
}

function _renderStoryList(stories) {
  const container = $('story-list');
  if (!container) return;

  if (!stories.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-map">
          <div id="empty-leaflet"></div>
          ${_emptyPinSvg()}
        </div>
        <p class="t-h2" style="margin-top:22px">No stories yet.</p>
        <p class="t-body soft" style="margin-top:4px">Press Record to tell the first one.</p>
        <button class="btn btn-primary btn-block" style="margin-top:20px;height:64px;font-size:20px" onclick="document.getElementById('nav-record').click()">
          ${_micSvg()} Record a story
        </button>
      </div>`;
    // Small empty map
    setTimeout(() => {
      if ($('empty-leaflet') && !$('empty-leaflet')._mapInit) {
        const m = L.map('empty-leaflet', { zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false }).setView([20,0],2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
        $('empty-leaflet')._mapInit = true;
      }
    }, 50);
    return;
  }

  container.innerHTML = stories.map(s => _storyCardHtml(s, stories.length)).join('');
  container.querySelectorAll('.story-card').forEach(card => {
    card.onclick = () => {
      _currentStory = getStoryById(card.dataset.id);
      _showPage('listen');
    };
  });
}

function _storyCardHtml(story, total) {
  const era    = story.era || assignEra(story, total);
  const dur    = formatDuration(story.duration);
  const status = _statusHtml(story);
  const place  = story.place
    ? `<span class="chip chip-place">${_pinSvg()}${_esc(story.place.label.split(',')[0])}</span>` : '';
  const eraChip = era
    ? `<span class="chip chip-era">${_clockSvg()}${_esc(era)}</span>` : '';
  const ageChip = story.ageAtEvent != null
    ? `<span class="chip chip-age">Age about ${story.ageAtEvent}</span>` : '';

  return `
    <div class="story-row">
      <div class="story-spine"><i></i></div>
      <div class="card story-card" data-id="${story.id}">
        <div class="story-card-header">
          <h3 class="story-card-title">${_esc(story.title || 'Untitled')}</h3>
          <span class="story-dur">${dur}</span>
        </div>
        <div class="story-chips">${place}${eraChip}${ageChip}</div>
        ${status}
      </div>
    </div>`;
}

function _statusHtml(story) {
  switch (story.transcriptStatus) {
    case 'done':
      return `<div class="status status-ok">${_checkSvg()} Written down</div>`;
    case 'transcribing':
      return `<div class="status status-busy">${_penSvg()} Writing it down...</div>`;
    case 'failed':
      return `
        <div class="state-panel state-panel-failed">
          <div class="row gap8 status-fail" style="font-weight:700">${_alertSvg()} Couldn't write this one down.</div>
          <div style="font-size:16px;color:var(--ink-soft);margin-top:4px;padding-left:32px">The recording is still safe. You can listen anytime.</div>
        </div>`;
    case 'pending':
    default:
      return `
        <div class="state-panel state-panel-pending">
          <div class="row gap8 status-warn" style="align-items:flex-start">${_deviceSvg()}
            <div><div style="font-weight:700">Kept safe on this device.</div><div style="font-size:16px">Not on the server yet.</div></div>
          </div>
        </div>`;
  }
}

// ── Record page ───────────────────────────────────────────────────

function _bindRecord() {
  $('record-btn').onclick  = () => _startRecording();

  // Read question aloud — toggle: speaking → click again to stop
  $('btn-read-aloud').onclick = () => {
    const btn = $('btn-read-aloud');
    if (btn.classList.contains('speaking')) {
      stopSpeaking();
      btn.classList.remove('speaking');
      btn.setAttribute('aria-label', 'Read question aloud');
    } else {
      btn.classList.add('speaking');
      btn.setAttribute('aria-label', 'Stop reading');
      speakQuestion(_currentQuestion, {
        onEnd: () => {
          btn.classList.remove('speaking');
          btn.setAttribute('aria-label', 'Read question aloud');
        },
      });
    }
  };

  $('btn-skip-q').onclick  = () => _nextQuestion();
  $('btn-write-q').onclick = () => {
    $('custom-q-wrap').style.display = 'block';
    $('custom-q-input').focus();
    $('btn-write-q').style.display = 'none';
  };
  $('custom-q-submit').onclick = () => {
    const val = $('custom-q-input').value.trim();
    if (val) {
      $('record-question-text').textContent = val;
      $('custom-q-wrap').style.display = 'none';
      $('btn-write-q').style.display = '';
    }
  };

  $('stop-btn').onclick = () => _stopRecording();

  _nextQuestion();
}

function _nextQuestion() {
  // Stop any in-progress speech from the previous question
  stopSpeaking();
  const readBtn = $('btn-read-aloud');
  if (readBtn) {
    readBtn.classList.remove('speaking');
    readBtn.setAttribute('aria-label', 'Read question aloud');
  }

  if (_usedQIndices.length >= QUESTIONS.length) _usedQIndices = [];
  let idx;
  do { idx = Math.floor(Math.random() * QUESTIONS.length); }
  while (_usedQIndices.includes(idx));
  _usedQIndices.push(idx);
  _currentQuestion = QUESTIONS[idx];
  $('record-question-text').textContent = _currentQuestion;
  $('record-question-compact').textContent = _currentQuestion;
}

function _showRecordReady() {
  $('record-state-ready').style.display = '';
  $('record-state-recording').style.display = 'none';
}

function _showRecordRecording() {
  $('record-state-ready').style.display = 'none';
  $('record-state-recording').style.display = '';
}

async function _startRecording() {
  if (_recorder && _recorder.isRecording) return;

  // If no name set yet, ask for it first then come back
  if (!getStoryteller().name) {
    _promptForName(() => _startRecording());
    return;
  }

  _recorder = new Recorder({
    onStart: () => {
      // Stop reading the question aloud once recording begins
      stopSpeaking();
      const readBtn = $('btn-read-aloud');
      if (readBtn) readBtn.classList.remove('speaking');
      _showRecordRecording();
    },
    onTick: (secs) => {
      $('record-timer').textContent = _fmtSecs(secs);
    },
    onWaveform: (bars) => {
      renderWaveform($('waveform'), bars);
    },
    onStop: (blob, duration, dataUrl, liveTranscript) => {
      _onRecordingComplete(blob, duration, dataUrl, liveTranscript);
    },
    onError: (msg) => {
      _showToast(msg);
      _showRecordReady();
    },
  });

  if (!Recorder.isSupported()) {
    _showToast('Audio recording is not supported in this browser. Try Chrome or Edge.');
    return;
  }

  await _recorder.start();
}

function _stopRecording() {
  if (_recorder) _recorder.stop();
}

async function _onRecordingComplete(blob, duration, dataUrl, liveTranscript = '') {
  _showRecordReady();
  $('record-timer').textContent = '0:00';
  renderWaveform($('waveform'), []);

  const st    = getStoryteller();
  const id    = generateId();
  const title = `Story — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  const story = {
    id, title,
    audioDataUrl:     dataUrl,
    duration,
    transcriptStatus: 'transcribing',
    transcriptLines:  [],
    place:            null,
    placeQuote:       null,
    era:              null,
    ageAtEvent:       null,
    orderIndex:       0,
    createdAt:        new Date().toISOString(),
    uploadStatus:     'local',
  };

  saveStory(story);

  // Start transcription in background — pass live transcript from Recorder
  transcribe(blob, dataUrl, (status) => {
    const s = getStoryById(id);
    if (!s) return;
    s.transcriptStatus = status;
    saveStory(s);
    if (_currentPage === 'home') _renderHome();
  }, liveTranscript).then(result => {
    const s = getStoryById(id);
    if (!s) return;
    s.transcriptStatus = result.status;
    s.transcriptLines  = result.lines;
    saveStory(s);
    if (_currentPage === 'home') _renderHome();
  }).catch(() => {
    const s = getStoryById(id);
    if (s) { s.transcriptStatus = 'failed'; saveStory(s); }
    if (_currentPage === 'home') _renderHome();
  });

  // Detect places in question text (best proxy without real transcript)
  const detectedPlaces = detectPlaces(_currentQuestion);

  // Show the placer wizard
  $('page-placer').style.display = 'block';
  $('page-record').style.display = 'none';

  const step1 = $('placer-step1');
  const step2 = $('placer-step2');
  if (step1) step1.innerHTML = '';
  if (step2) step2.innerHTML = '';

  startPlacer(story, detectedPlaces, (updatedStory) => {
    $('page-placer').style.display = 'none';
    _currentStory = updatedStory;
    _renderHome();
    _showPage('listen');
    _showToast('Story saved.');
  });
}

// ── Listen page ───────────────────────────────────────────────────

function _renderListen(story) {
  _currentStory = story;
  const stories = getStoriesSorted();
  const idx     = stories.findIndex(s => s.id === story.id);
  const total   = stories.length;
  const st      = getStoryteller();

  // Destroy previous player
  if (_player) { _player.destroy(); _player = null; }

  // Build mobile sheet content
  const sheet = $('listen-sheet-content');
  if (sheet) {
    sheet.innerHTML = _listenSheetHtml(story, idx, total);
  }

  // Build desktop panel content
  const desktop = $('listen-desktop-content');
  if (desktop) {
    desktop.innerHTML = _listenDesktopHtml(story, idx, total);
  }

  // Init map
  if (!_listenMapReady) {
    initListenMap('listen-map');
    _listenMapReady = true;
  }
  renderListenPins(stories, story.id, (s) => {
    _renderListen(s);
    flyToStory(s);
  });
  if (story.place) flyToStory(story);

  // Wire players (mobile + desktop share same audio element)
  _initPlayer(story, 'mobile');
  _initPlayer(story, 'desktop');

  // Up-next
  const next = stories[idx + 1];
  ['mobile-upnext', 'desktop-upnext'].forEach(id => {
    const el = $(id);
    if (!el) return;
    if (next) {
      el.style.display = '';
      el.querySelector('.up-next-title').textContent = next.title || 'Untitled';
      const placeEl = el.querySelector('.up-next-place');
      if (placeEl) placeEl.textContent = next.place ? next.place.label.split(',')[0] : '';
      el.querySelector('.up-next-dur').textContent = formatDuration(next.duration);
      el.querySelector('.up-next-play-btn').onclick = () => _renderListen(next);
    } else {
      el.style.display = 'none';
    }
  });
}

function _listenSheetHtml(story, idx, total) {
  const lines  = (story.transcriptLines || []);
  const er     = story.era || assignEra(story, total) || '';
  const age    = story.ageAtEvent != null ? `Age about ${story.ageAtEvent}` : '';

  return `
    <div class="listen-grabber"></div>
    <div class="pad" style="margin-top:10px">
      <div class="t-over">Story ${idx + 1} of ${total}</div>
      <h1 class="t-h2" style="margin-top:4px">${_esc(story.title || 'Untitled')}</h1>
      <div class="row gap8" style="margin-top:8px;flex-wrap:wrap">
        ${er  ? `<span class="chip chip-era">${_clockSvg()}${_esc(er)}</span>` : ''}
        ${age ? `<span class="chip chip-age">${_esc(age)}</span>` : ''}
      </div>
      ${_timelineStripHtml(getStoriesSorted(), story.id)}
      ${_scrubberHtml('mobile')}
      ${_audioControlsHtml('mobile')}
      <div class="listen-transcript" id="transcript-mobile">
        ${lines.map(l => `<p class="transcript-line">${_esc(l)}</p>`).join('')}
        ${!lines.length && story.transcriptStatus === 'transcribing'
          ? `<div class="status status-busy" style="margin-top:12px">${_penSvg()} Writing it down...</div>
             <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
               <i class="skeleton" style="width:94%"></i>
               <i class="skeleton" style="width:86%"></i>
               <i class="skeleton" style="width:62%"></i>
             </div>`
          : ''}
        ${!lines.length && story.transcriptStatus === 'done'
          ? `<p class="t-body soft" style="margin-top:12px;font-style:italic">No transcript yet — you can add one by editing this story.</p>`
          : ''}
      </div>
    </div>
    <div class="listen-fade"></div>
  `;
}

function _listenDesktopHtml(story, idx, total) {
  const lines = (story.transcriptLines || []);
  const er    = story.era || assignEra(story, total) || '';
  const age   = story.ageAtEvent != null ? `Age about ${story.ageAtEvent}` : '';

  return `
    <div class="t-over">Story ${idx + 1} of ${total} · Life order</div>
    <h1 class="t-h1" style="margin-top:6px">${_esc(story.title || 'Untitled')}</h1>
    <div class="row gap8" style="margin-top:10px;flex-wrap:wrap">
      ${story.place ? `<span class="chip chip-place">${_pinSvg()}${_esc(story.place.label.split(',')[0])}</span>` : ''}
      ${er  ? `<span class="chip chip-era">${_clockSvg()}${_esc(er)}</span>`  : ''}
      ${age ? `<span class="chip chip-age">${_esc(age)}</span>` : ''}
    </div>
    <div class="card" style="margin-top:20px;padding:16px 18px 18px">
      ${_scrubberHtml('desktop')}
      ${_audioControlsHtml('desktop')}
    </div>
    <div class="t-over" style="margin-top:22px;display:flex;align-items:center;gap:10px">
      Transcript
      <span style="flex:1;height:1px;background:var(--line)"></span>
    </div>
    <div id="transcript-desktop" style="margin-top:8px;margin-left:-12px">
      ${lines.map(l => `<p class="transcript-line">${_esc(l)}</p>`).join('')}
      ${!lines.length && story.transcriptStatus === 'transcribing'
        ? `<div class="status status-busy" style="margin-top:12px;padding-left:12px">${_penSvg()} Writing it down...</div>`
        : ''}
      ${!lines.length && story.transcriptStatus === 'done'
        ? `<p class="t-body soft" style="margin-top:12px;font-style:italic;padding-left:12px">No transcript yet.</p>`
        : ''}
    </div>
    <div class="listen-fade" style="bottom:80px"></div>
  `;
}

function _timelineStripHtml(stories, activeId) {
  const total = stories.length;
  const ERAS  = ['Childhood', 'Youth', 'Work', 'Family', 'Later'];
  const fill  = total < 2 ? 0 : (() => {
    const idx = stories.findIndex(s => s.id === activeId);
    return idx < 0 ? 0 : Math.round((idx / (total - 1)) * 92 + 4);
  })();

  let dots = '';
  stories.forEach((s, i) => {
    const pct    = total < 2 ? 50 : Math.round((i / (total - 1)) * 92 + 4);
    const isCur  = s.id === activeId;
    dots += `<i class="tl-dot${isCur ? ' cur' : ''}" style="left:${pct}%" title="${_esc(s.title||'')}"></i>`;
  });

  return `
    <div style="margin-top:12px">
      <div class="tl">
        <div class="tl-track"></div>
        <div class="tl-fill" style="width:${fill}%"></div>
        ${dots}
        <div class="tl-eras">${ERAS.map(e => `<span>${e}</span>`).join('')}</div>
      </div>
    </div>`;
}

function _scrubberHtml(key) {
  return `
    <div class="scrubber-wrap" id="scrubber-${key}">
      <div class="scrubber-track"></div>
      <div class="scrubber-fill" id="scrubber-fill-${key}"></div>
      <div class="scrubber-thumb" id="scrubber-thumb-${key}"></div>
    </div>
    <div class="scrubber-times">
      <span id="time-elapsed-${key}">0:00</span>
      <span id="time-dur-${key}">0:00</span>
    </div>`;
}

function _audioControlsHtml(key) {
  return `
    <div class="audio-controls">
      <button class="icon-btn skip-btn" id="skip-back-${key}" aria-label="Back 15 seconds">
        <svg class="ico lg" viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/><text x="12" y="15.2" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="Source Sans 3">15</text></svg>
      </button>
      <button class="play-btn" id="play-btn-${key}" aria-label="Play">
        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>
        </svg>
      </button>
      <button class="icon-btn skip-btn" id="skip-fwd-${key}" aria-label="Forward 15 seconds">
        <svg class="ico lg" viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4"/><text x="12" y="15.2" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="Source Sans 3">15</text></svg>
      </button>
    </div>`;
}

function _initPlayer(story, key) {
  if (!$(`scrubber-${key}`)) return;
  // For the mobile/desktop split, both share the same audio element
  // We create one player and reuse the audio for both UI instances
  const player = new Player({
    scrubberWrap:  $(`scrubber-${key}`),
    scrubberFill:  $(`scrubber-fill-${key}`),
    scrubberThumb: $(`scrubber-thumb-${key}`),
    timeElapsed:   $(`time-elapsed-${key}`),
    timeDuration:  $(`time-dur-${key}`),
    playBtn:       $(`play-btn-${key}`),
    transcriptEl:  $(`transcript-${key}`),
    lines:         story.transcriptLines || [],
  });

  if (story.audioDataUrl) player.load(story.audioDataUrl);

  $(`skip-back-${key}`).onclick = () => player.skip(-15);
  $(`skip-fwd-${key}`).onclick  = () => player.skip(15);

  if (key === 'mobile') _player = player;
}

function _renderListenEmpty() {
  const sheet = $('listen-sheet-content');
  if (sheet) {
    sheet.innerHTML = `
      <div class="pad" style="margin-top:40px;text-align:center">
        <p class="t-h2">No stories yet.</p>
        <p class="t-body soft" style="margin-top:8px">Record your first story to see it here.</p>
        <button class="btn btn-primary" style="margin-top:24px" onclick="document.getElementById('nav-record').click()">
          ${_micSvg()} Record a story
        </button>
      </div>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function _refreshAll() {
  if (_currentPage === 'home') _renderHome();
}

function _showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function _fmtSecs(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Inline SVG helpers ────────────────────────────────────────────

function _micSvg()    { return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`; }
function _pinSvg()    { return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`; }
function _clockSvg()  { return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`; }
function _checkSvg()  { return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`; }
function _penSvg()    { return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>`; }
function _alertSvg()  { return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V13M12 16.5v.01"/></svg>`; }
function _deviceSvg() { return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/></svg>`; }
function _emptyPinSvg() {
  return `<svg style="position:absolute;left:50%;top:50%;width:64px;height:76px;margin:-52px 0 0 -32px" viewBox="-16 -40 32 44">
    <path d="M0 0 C-3 -7 -12 -13 -12 -22 A12 12 0 1 1 12 -22 C12 -13 3 -7 0 0Z" fill="rgba(251,248,241,.8)" stroke="#a4502c" stroke-width="1.6" stroke-dasharray="3 3"/>
    <circle cx="0" cy="-22" r="4.5" fill="none" stroke="#a4502c" stroke-width="1.6"/>
  </svg>`;
}

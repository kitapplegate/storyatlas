/**
 * Story Atlas — App controller
 * Wires all modules together. Manages page routing and state.
 */

import {
  getStoriesSorted, getStoryById, saveStory, deleteStory,
  getStoryteller, saveStoryteller, migrateAudioToIndexedDB,
  generateId, formatDuration, assignEra,
} from './storage.js';
import { putAudio, getAudio, deleteAudio, requestPersistence } from './audiostore.js';
import { downloadBackup, restoreBackup } from './backup.js';

import { speakQuestion, stopSpeaking } from './interview.js';

import { Recorder, renderWaveform } from './recorder.js';
import { transcribe, detectPlaces, splitIntoLines } from './transcriber.js';
import { startPlacer, hidePlacer }    from './placer.js';
import { Player }                     from './player.js';
import {
  initHomeMap, refreshHomePins,
  initListenMap, renderListenPins, flyToStory, addListenPin, fitAllListenPins,
} from './map.js';

// ── State ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

let _currentPage     = 'signin';
let _recorder        = null;
let _timerInterval   = null;
let _players         = [];
let _currentStory    = null;
let _listenMapReady  = false;
let _currentQuestion = null;
let _demoMode        = false;   // true when exploring the sample atlas

// Auth helpers (placeholder — no real accounts yet)
const AUTH_KEY = 'sa_signed_in';
const _isSignedIn = () => !!localStorage.getItem(AUTH_KEY);
const _signIn     = ()  => localStorage.setItem(AUTH_KEY, '1');
const _signOut    = ()  => { localStorage.removeItem(AUTH_KEY); _demoMode = false; };

// Demo sample data
const DEMO_STORIES = [
  { id:'demo-1', title:'First Day of School',      duration:188, place:{ label:'Lincoln School, Springfield, IL', lat:39.7817,  lng:-89.6501 }, era:'Childhood', transcriptLines:['My mother walked me to the gate and wouldn\'t let go of my hand.'], transcriptStatus:'done',    createdAt:'2024-01-01T10:00:00Z' },
  { id:'demo-2', title:'The House on Elm Street',  duration:222, place:{ label:'Elm Street, Springfield, IL',     lat:39.7984,  lng:-89.6540 }, era:'Childhood', transcriptLines:['We lived at the end of Elm Street, past the big oak. My father painted the porch green every spring.'], transcriptStatus:'done', createdAt:'2024-01-02T10:00:00Z' },
  { id:'demo-3', title:'The Movie Theater',        duration:252, place:{ label:'Main Street, Springfield, IL',    lat:39.7990,  lng:-89.6440 }, era:'Youth',     transcriptLines:['Ten cents got you a cartoon, the newsreel, and two pictures if you sat through.'],    transcriptStatus:'pending', createdAt:'2024-01-03T10:00:00Z' },
  { id:'demo-4', title:'Learning to Drive',        duration:196, place:{ label:'Route 66, Missouri',              lat:37.2090,  lng:-93.2923 }, era:'Youth',     transcriptLines:['Dad took me out on a Sunday. He said just feel the road.'],                           transcriptStatus:'done',    createdAt:'2024-01-04T10:00:00Z' },
  { id:'demo-5', title:'The Summer at the Lake',   duration:340, place:{ label:'Lake Springfield, IL',            lat:39.7445,  lng:-89.5840 }, era:'Family',    transcriptLines:['Every July we rented the same cabin. The kids caught frogs in the shallows.'],        transcriptStatus:'done',    createdAt:'2024-01-05T10:00:00Z' },
  { id:'demo-6', title:'Retiring from the Mill',   duration:274, place:{ label:'Springfield, IL',                 lat:39.7817,  lng:-89.6501 }, era:'Later',     transcriptLines:['Forty-two years. They gave me a clock and a handshake.'],                            transcriptStatus:'done',    createdAt:'2024-01-06T10:00:00Z' },
];
const DEMO_STORYTELLER = { name: 'Grandpa Joe' };

function _getStories()     { return _demoMode ? DEMO_STORIES    : getStoriesSorted(); }
function _getStoryteller() { return _demoMode ? DEMO_STORYTELLER : getStoryteller(); }

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
  _bindSignIn();
  _bindNav();
  _bindRecord();
  migrateAudioToIndexedDB().then(n => { if (n) requestPersistence(); });
  const start = _isSignedIn() ? 'home' : 'signin';
  history.replaceState({ page: start }, '', '');
  _showPage(start, false);
});

window.addEventListener('popstate', (e) => {
  let page = e.state?.page || 'signin';
  // Guard: never land on inner pages without being signed in
  if (!_isSignedIn() && !_demoMode) page = 'signin';
  if (page === 'placer' || page === 'landing' || page === 'account') page = 'home';
  _showPage(page, false);
});

// Close avatar menu on outside click
document.addEventListener('click', (e) => {
  const menu = $('avatar-menu');
  const btn  = $('topbar-avatar');
  if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function _bindSignIn() {
  // Sign in button
  $('signin-btn').onclick = () => {
    _signIn();
    _showPage('home');
  };
  // Create account button (same placeholder behaviour)
  $('create-account-btn').onclick = () => {
    _signIn();
    _showPage('home');
  };
  // Try the demo
  $('demo-btn').onclick = () => {
    _demoMode = true;
    _showPage('home');
  };
  // Back to atlas (shown when already signed in)
  const backLink = $('signin-back-to-atlas');
  if (backLink) backLink.onclick = () => _showPage('home');
  // Avatar → toggle menu
  $('topbar-avatar').onclick = (e) => {
    e.stopPropagation();
    const menu = $('avatar-menu');
    menu.style.display = menu.style.display === 'none' ? '' : 'none';
  };
  // Sign out
  $('avatar-menu-signout').onclick = () => {
    _signOut();
    $('avatar-menu').style.display = 'none';
    _showPage('signin');
  };
  // Exit demo banner
  $('exit-demo-btn').onclick = () => {
    _demoMode = false;
    if (_isSignedIn()) _showPage('home');
    else _showPage('signin');
  };
  // Home name input (no-name state)
  $('home-name-btn').onclick = () => {
    const name = $('home-name-input').value.trim();
    if (name) saveStoryteller({ name });
    _renderHome();
  };
  $('home-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('home-name-btn').click();
  });
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
  // Logo always goes to sign-in (home = login / switch users)
  $('nav-home').onclick         = () => _showPage('signin');
  $('record-back-btn').onclick  = () => (_isSignedIn() || _demoMode) ? _showPage('home') : _showPage('signin');
  $('listen-back-btn').onclick  = () => (_isSignedIn() || _demoMode) ? _showPage('home') : _showPage('signin');
  $('stories-back-btn').onclick = () => (_isSignedIn() || _demoMode) ? _showPage('home') : _showPage('signin');
  $('home-record-cta').onclick  = (e) => { e.preventDefault(); _navRecord(); };

  // Desktop nav
  $('nav-btn-home').onclick     = () => _showPage('signin');
  $('nav-btn-map').onclick      = () => _showPage('listen');
  $('nav-btn-stories').onclick  = () => _showPage('stories');
  $('nav-btn-keepsake').onclick = () => _showToast('Keepsake book coming soon.');

  // Home hub: atlas "Open atlas" button and side cards
  $('home-open-atlas-btn').onclick  = (e) => { e.preventDefault(); _showPage('listen'); };
  $('nav-btn-map-card').onclick     = () => _showPage('listen');
  $('nav-btn-stories-card').onclick = () => _showPage('stories');
  $('nav-btn-keepsake-card').onclick= () => _showToast('Keepsake book coming soon.');
  $('home-see-all-btn').onclick     = () => _showPage('stories');
  $('home-switch-btn').onclick      = () => _showPage('signin');

  // Bottom tab bar (5 tabs) — Home = sign-in/switcher
  $('tab-home').onclick     = () => _showPage('signin');
  $('tab-map').onclick      = () => _showPage('listen');
  $('tab-record').onclick   = () => _navRecord();
  $('tab-stories').onclick  = () => _showPage('stories');
  $('tab-keepsake').onclick = () => _showToast('Keepsake book coming soon.');

  // Switch-storyteller menu
  $('switch-menu-close').onclick = () => { $('switch-menu-overlay').style.display = 'none'; };
  $('switch-menu-overlay').onclick = (e) => { if (e.target === $('switch-menu-overlay')) $('switch-menu-overlay').style.display = 'none'; };
  $('switch-add-btn').onclick = () => { $('switch-menu-overlay').style.display = 'none'; _showToast('Multiple storytellers coming in the next update.'); };

  // Backup
  $('backup-download-btn').onclick = async () => {
    const btn = $('backup-download-btn');
    btn.disabled = true;
    try {
      const n = await downloadBackup();
      _showToast(`Downloaded a copy of ${n} stor${n === 1 ? 'y' : 'ies'}.`);
    } catch (e) {
      _showToast("Couldn't make the copy. Please try again.");
    } finally { btn.disabled = false; }
  };
  $('backup-restore-input').onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const { added, skipped, failed } = await restoreBackup(file);
      let msg = `Restored ${added} stor${added === 1 ? 'y' : 'ies'}.`;
      if (skipped) msg += ` ${skipped} already here.`;
      if (failed)  msg += ` ${failed} couldn't be saved.`;
      _showToast(msg);
      _renderHome();
    } catch (err) { _showToast(err.message); }
  };
}

function _navRecord() {
  if (_demoMode) { _showToast('Exit the demo to record your own stories.'); return; }
  if (!getStoryteller().name) { _promptForName(() => _showPage('record')); }
  else { _showPage('record'); }
}

function _openSwitchMenu() {
  const overlay = $('switch-menu-overlay');
  const list    = $('switch-menu-list');
  const st = _getStoryteller();
  list.innerHTML = st.name
    ? `<div class="v2-menu-item" style="cursor:default;color:var(--ink)">
         <svg style="width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
         ${_esc(st.name)}
       </div>`
    : '';
  overlay.style.display = '';
}

function _showPage(name, push = true) {
  // Auth guard — inner pages need sign-in; but signin itself is always reachable
  if (name !== 'signin' && !_isSignedIn() && !_demoMode) {
    name = 'signin';
  }

  // When navigating to signin, show/hide the "Back to my atlas" link
  if (name === 'signin') {
    const backLink = $('signin-back-to-atlas');
    if (backLink) backLink.style.display = (_isSignedIn() || _demoMode) ? '' : 'none';
  }

  if (name !== 'record') {
    if (_recorder && _recorder.isRecording) _recorder.stop();
    stopSpeaking();
  }
  if (name !== 'listen') _destroyPlayers();

  const ALL_PAGES = ['signin', 'home', 'record', 'listen', 'placer', 'stories'];
  ALL_PAGES.forEach(p => {
    const el = $(`page-${p}`);
    if (el) el.style.display = (p === name) ? '' : 'none';
  });
  _currentPage = name;

  // Top bar: show Sign-in link on signin screen, avatar on hub pages
  const onSignIn = name === 'signin';
  const onHub    = !onSignIn;
  const signinLink = $('topbar-signin-link');
  const avatar     = $('topbar-avatar');
  const nav        = $('main-nav');
  if (signinLink) signinLink.style.display = onSignIn ? '' : 'none';
  if (avatar)     avatar.style.display     = onHub     ? '' : 'none';
  if (nav)        nav.style.display        = (onHub && name === 'home') ? '' : 'none';

  // Update avatar initials
  if (onHub) {
    const st = _getStoryteller();
    const name2 = st.name || '';
    const initials = name2.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0,2) || '?';
    const avatarName = $('topbar-avatar-name');
    const avatarDot  = $('topbar-avatar-dot');
    if (avatarName) avatarName.textContent = name2 || 'You';
    if (avatarDot)  avatarDot.textContent  = initials;
  }

  // Tab bar: shown on hub pages, hidden on signin
  const tabbar = $('v2-tabbar');
  if (tabbar) tabbar.style.display = onHub ? '' : 'none';

  // body class for safe bottom padding on phone
  document.body.classList.toggle('has-tabs', onHub);

  // Tab bar active state
  const tabMap = { home:'tab-home', listen:'tab-map', record:'tab-record', stories:'tab-stories' };
  Object.entries(tabMap).forEach(([page, id]) => {
    const t = $(id);
    if (t) t.classList.toggle('on', page === name);
  });

  // Desktop nav active state
  const navBtnMap = { home:'nav-btn-home', listen:'nav-btn-map', stories:'nav-btn-stories' };
  Object.entries(navBtnMap).forEach(([page, id]) => {
    const b = $(id);
    if (b) b.setAttribute('aria-current', page === name ? 'page' : 'false');
  });

  if (push) history.pushState({ page: name }, '', '');

  if (name === 'home')    _renderHome();
  if (name === 'stories') _renderStoriesPage();
  if (name === 'listen' && _currentStory)  _renderListen(_currentStory);
  if (name === 'listen' && !_currentStory) {
    const stories = _getStories();
    if (stories.length) _renderListen(stories[0]);
    else _renderListenEmpty();
  }
}

// ── Home hub ─────────────────────────────────────────────────────

function _renderHome() {
  const st      = _getStoryteller();
  const stories = _getStories();
  const hasName = !!st.name;

  // Demo banner
  const banner = $('demo-banner');
  if (banner) banner.style.display = _demoMode ? '' : 'none';

  // Name / no-name toggle
  $('home-no-name').style.display       = (hasName || _demoMode) ? 'none' : '';
  $('home-storyteller-h1').style.display = (hasName || _demoMode) ? ''    : 'none';
  const nameEl = $('home-storyteller-name');
  if (nameEl) nameEl.textContent = st.name || '';

  // Meta line: N stories · N places · lock Family only
  const places = stories.filter(s => s.place).length;
  const metaEl = $('home-meta');
  if (metaEl) metaEl.innerHTML =
    `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} <span style="opacity:.5">·</span> ${places} place${places === 1 ? '' : 's'} <span style="opacity:.5">·</span> <svg style="width:15px;height:15px;display:inline;vertical-align:middle;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><use href="#i-lock"/></svg> Family only`;

  // "Continue where you left off" — most recent story
  const continueCard = $('home-continue-card');
  const latest = stories[0];
  if (continueCard) {
    if (latest) {
      continueCard.style.display = '';
      $('home-continue-title').textContent = latest.title || 'Untitled';
      $('home-continue-dur').textContent   = formatDuration(latest.duration);
      $('home-continue-btn').onclick = () => {
        _currentStory = _demoMode ? latest : getStoryById(latest.id);
        _showPage('listen');
      };
    } else {
      continueCard.style.display = 'none';
    }
  }

  // Side card labels
  const mapLabel = $('home-map-places-label');
  if (mapLabel) mapLabel.textContent = places ? `Walk through ${places} place${places === 1 ? '' : 's'}` : 'Walk through the places';
  const storiesLabel = $('home-stories-count-label');
  if (storiesLabel) storiesLabel.textContent = stories.length ? `${stories.length} stories in life order` : 'In life order';

  // Atlas foot: latest story name
  const atlasLatest = $('home-atlas-latest');
  if (atlasLatest && latest) {
    const era = latest.era || '';
    atlasLatest.textContent = `Latest: ${latest.title || 'Untitled'}${era ? ' · ' + era : ''}`;
  }

  // Timeline
  _renderHomeTimeline(stories);

  // Map placeholder vs real Leaflet
  const storiesWithPlace = stories.filter(s => s.place && s.place.lat != null);
  const placeholder = $('home-map-placeholder');
  if (placeholder) placeholder.style.display = storiesWithPlace.length ? 'none' : '';
  setTimeout(() => {
    initHomeMap('home-leaflet');
    refreshHomePins(stories);
  }, 50);

  // Story list (3 most recent)
  _renderStoryList(stories.slice(0, 3));

  // "See all" link
  const seeAllWrap  = $('home-see-all-wrap');
  const seeAllCount = $('home-see-all-count');
  if (seeAllWrap)  seeAllWrap.style.display  = stories.length > 3 ? '' : 'none';
  if (seeAllCount) seeAllCount.textContent   = stories.length;
}

function _renderHomeTimeline(stories) {
  const track = $('home-tl-track');
  if (!track) return;
  const total = stories.length;
  let html = '';
  stories.forEach((s, i) => {
    const pct = total < 2 ? 50 : Math.round((i / (total - 1)) * 92 + 4);
    const isLatest = i === 0;
    html += `<i class="tl-dot${isLatest ? ' tl-dot-now' : ''}" style="left:${pct}%" title="${_esc(s.title || '')}"></i>`;
  });
  track.innerHTML = html;
}

function _renderStoryList(stories) {
  const container = $('story-list');
  if (!container) return;

  if (!stories.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:32px 0;text-align:center">
        <div class="empty-map" style="height:160px;border-radius:18px;border:1px solid var(--line);position:relative;overflow:hidden;background:var(--parchment-deep);margin-bottom:20px">
          <div id="empty-leaflet"></div>
          ${_emptyPinSvg()}
        </div>
        <p class="t-h2">No stories yet.</p>
        <p class="t-body soft" style="margin-top:4px">Tap Record to tell the first one.</p>
      </div>`;
    setTimeout(() => {
      const el = $('empty-leaflet');
      if (el && !el._mapInit) {
        const m = L.map('empty-leaflet', { zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false }).setView([20,0],2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
        el._mapInit = true;
      }
    }, 50);
    return;
  }

  container.innerHTML = stories.map((s, i) => _storyCardHtml(s, i)).join('');
  container.querySelectorAll('.v2-story[data-id]').forEach(card => {
    card.onclick = () => {
      if (_demoMode) {
        _currentStory = DEMO_STORIES.find(s => s.id === card.dataset.id) || null;
      } else {
        _currentStory = getStoryById(card.dataset.id);
      }
      _showPage('listen');
    };
  });
}

function _renderStoriesPage() {
  const stories = _getStories();
  const container = $('stories-page-list');
  if (!container) return;
  if (!stories.length) { container.innerHTML = '<p style="padding:24px;color:var(--ink-soft)">No stories yet.</p>'; return; }
  container.innerHTML = stories.map((s, i) => _storyCardHtml(s, i)).join('');
  container.querySelectorAll('.v2-story[data-id]').forEach(card => {
    card.onclick = () => {
      _currentStory = _demoMode ? DEMO_STORIES.find(s => s.id === card.dataset.id) : getStoryById(card.dataset.id);
      _showPage('listen');
    };
  });
}

function _storyCardHtml(story, idx) {
  const total = _getStories().length;
  const era  = story.era || assignEra(story, total);
  const dur  = formatDuration(story.duration);
  const place = story.place ? story.place.label.split(',')[0] : '';
  const firstLine = (story.transcriptLines || [])[0] || '';
  const quote = firstLine ? `<q class="v2-story-quote">${_esc(firstLine.replace(/^["'“]+|["'”]+$/g, ""))}</q>` : '';
  const placeChip = place ? `<span class="v2-chip v2-chip-place"><svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><use href="#i-pin"/></svg>${_esc(place)}</span>` : '';
  const eraChip   = era   ? `<span class="v2-chip v2-chip-era"><svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><use href="#i-clock"/></svg>${_esc(era)}</span>` : '';
  const ageChip   = story.ageAtEvent != null ? `<span class="v2-chip v2-chip-age">Age about ${story.ageAtEvent}</span>` : '';
  const statusDone    = story.transcriptStatus === 'done';
  const statusPending = story.transcriptStatus === 'pending' || !story.transcriptStatus;
  const statusHtml = statusDone
    ? `<span class="v2-story-status"><svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><use href="#i-check"/></svg>Written down</span>`
    : `<span class="v2-story-status pending"><svg style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><use href="#i-device"/></svg>Kept safe on this device</span>`;

  return `
    <button class="v2-story" data-id="${story.id}">
      <span class="v2-story-num" style="position:absolute;top:-10px;left:18px;font:700 12px var(--font-sans);letter-spacing:.08em;background:var(--parchment);padding:0 8px;color:var(--ink-soft)">${idx + 1}</span>
      <div class="v2-story-top">
        <h3 class="v2-story-title">${_esc(story.title || 'Untitled')}</h3>
        <span class="v2-story-dur">${dur}</span>
      </div>
      ${(placeChip || eraChip || ageChip) ? `<div class="v2-chips">${placeChip}${eraChip}${ageChip}</div>` : ''}
      ${quote}
      ${statusHtml}
    </button>`;
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

// ── Edit story modal ──────────────────────────────────────────────

function _openEditModal(id) {
  const story = getStoryById(id);
  if (!story) return;
  const overlay = $('edit-story-modal-overlay');
  const titleInput = $('edit-story-title');
  const transcriptInput = $('edit-story-transcript');
  titleInput.value = story.title || '';
  transcriptInput.value = (story.transcriptLines || []).join('\n');
  overlay.classList.add('open');

  const close = () => overlay.classList.remove('open');

  $('edit-story-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  $('edit-story-save').onclick = () => {
    const newTitle = titleInput.value.trim();
    const newTranscript = transcriptInput.value.trim();
    const updatedStory = {
      ...story,
      title: newTitle || story.title,
      transcriptLines: splitIntoLines(newTranscript),
      transcriptStatus: newTranscript ? 'done' : story.transcriptStatus,
    };
    if (saveStory(updatedStory)) {
      close();
      _renderHome();
      _showToast('Story updated.');
    } else {
      _showToast('Could not save — device may be full.');
    }
  };
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
      _currentQuestion = val;
      $('record-question-text').textContent = val;
      $('record-question-compact').textContent = val;
      $('custom-q-wrap').style.display = 'none';
      $('btn-write-q').style.display = '';
    }
  };

  $('stop-btn').onclick = () => _stopRecording();

  // Review screen buttons
  $('review-edit-btn').onclick = () => {
    const ta = $('review-edit');
    const shown = ta.style.display !== 'none';
    if (shown) {
      // Apply edit back to display
      $('review-transcript').textContent = ta.value;
      ta.style.display = 'none';
      $('review-edit-btn').innerHTML = `<svg class="ico sm" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg> Edit`;
    } else {
      ta.value = $('review-transcript').textContent;
      ta.style.display = '';
      ta.focus();
      $('review-edit-btn').innerHTML = `<svg class="ico sm" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> Done`;
    }
  };
  $('review-redo-btn').onclick = () => {
    _showRecordReady();
    _nextQuestion();
  };

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
  $('record-state-review').style.display = 'none';
}

function _showRecordReview(transcript) {
  $('record-state-ready').style.display = 'none';
  $('record-state-recording').style.display = 'none';
  $('record-state-review').style.display = '';
  $('review-transcript').textContent = transcript || '';
  $('review-edit').style.display = 'none';
  $('review-edit-btn').innerHTML = `<svg class="ico sm" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg> Edit`;
  const transcribing = $('review-transcribing');
  if (transcribing) transcribing.style.display = transcript ? 'none' : 'block';
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
  $('record-timer').textContent = '0:00';
  renderWaveform($('waveform'), []);

  const id = generateId();

  // Show review screen immediately with whatever transcript we already have
  _showRecordReview(liveTranscript);
  const titleInput = $('review-title');
  titleInput.value = _suggestTitle(liveTranscript);
  titleInput.dataset.touched = '';
  titleInput.oninput = () => { titleInput.dataset.touched = '1'; };

  // If we didn't get a live transcript, try transcribing now and update the screen
  let finalTranscript = liveTranscript;
  if (!liveTranscript) {
    transcribe(blob, dataUrl, () => {}, liveTranscript).then(result => {
      finalTranscript = (result.lines || []).map(l => l.text || l).join(' ');
      if ($('record-state-review').style.display !== 'none') {
        $('review-transcript').textContent = finalTranscript;
        if (!titleInput.dataset.touched) titleInput.value = _suggestTitle(finalTranscript);
        const tr = $('review-transcribing');
        if (tr) tr.style.display = 'none';
      }
    }).catch(() => {});
  }

  // Wire Save button — only once (remove old listener by replacing the node)
  const saveBtn = $('review-save-btn');
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.disabled = false;   // the clone copies "disabled" from the last save
  $('review-save-error').style.display = 'none';
  newSaveBtn.onclick = async () => {
    newSaveBtn.disabled = true;
    $('review-save-error').style.display = 'none';
    // Use whatever the user has in the review box (they may have edited it)
    const editedText = $('review-edit').style.display !== 'none'
      ? $('review-edit').value
      : $('review-transcript').textContent;

    // Listen view and storage expect plain sentence strings
    const transcriptLines = splitIntoLines(editedText.trim());
    const title = $('review-title').value.trim() || _suggestTitle(editedText);

    const story = {
      id, title,
      question:         _currentQuestion,
      audioDataUrl:     null,
      hasAudio:         true,
      duration,
      transcriptStatus: transcriptLines.length ? 'done' : 'failed',
      transcriptLines,
      place:            null,
      placeQuote:       null,
      era:              null,
      ageAtEvent:       null,
      orderIndex:       0,
      createdAt:        new Date().toISOString(),
      uploadStatus:     'local',
    };

    // Audio goes to IndexedDB. If that's unavailable (some private windows),
    // fall back to the old base64-in-localStorage way.
    try {
      await putAudio(id, blob);
    } catch (e) {
      console.warn('StoryAtlas: IndexedDB save failed, falling back', e);
      story.audioDataUrl = dataUrl;
      story.hasAudio     = false;
    }
    if (!saveStory(story)) {
      if (story.hasAudio) deleteAudio(id).catch(() => {});
      newSaveBtn.disabled = false;
      _showSaveFailed(blob, title);
      return;
    }
    requestPersistence();

    // Detect places from the transcript text for the placer wizard
    const detectedPlaces = detectPlaces(editedText || _currentQuestion);

    // Next visit to Record starts fresh
    _showRecordReady();
    _nextQuestion();

    // Hand off to the placer wizard
    _showPage('placer');
    const step1 = $('placer-step1');
    const step2 = $('placer-step2');
    if (step1) step1.innerHTML = '';
    if (step2) step2.innerHTML = '';

    startPlacer(story, detectedPlaces, (updatedStory) => {
      _currentStory = updatedStory;
      _showPage('listen');
      _showToast('Story saved.');
    });
  };
}

// ── Listen page ───────────────────────────────────────────────────

function _renderListen(story) {
  _currentStory = story;
  const stories = _getStories();
  const idx     = stories.findIndex(s => s.id === story.id);
  const total   = stories.length;
  const st      = _getStoryteller();

  // Destroy previous player
  _destroyPlayers();

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
  const lines  = _transcriptLines(story);
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
      ${_timelineStripHtml(_getStories(), story.id)}
      ${_scrubberHtml('mobile', story)}
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
  const lines = _transcriptLines(story);
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
      ${_scrubberHtml('desktop', story)}
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

function _scrubberHtml(key, story) {
  return `
    <div class="scrubber-wrap" id="scrubber-${key}">
      <div class="scrubber-track"></div>
      <div class="scrubber-fill" id="scrubber-fill-${key}"></div>
      <div class="scrubber-thumb" id="scrubber-thumb-${key}"></div>
    </div>
    <div class="scrubber-times">
      <span id="time-elapsed-${key}">0:00</span>
      <span id="time-dur-${key}">${(story && story.duration) ? formatDuration(story.duration) : "0:00"}</span>
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
    lines:         _transcriptLines(story),
  });

  _loadStoryAudio(story, player);

  $(`skip-back-${key}`).onclick = () => player.skip(-15);
  $(`skip-fwd-${key}`).onclick  = () => player.skip(15);

  _players.push(player);
}

async function _loadStoryAudio(story, player) {
  let blob = null;
  try { blob = await getAudio(story.id); } catch { /* fall back below */ }
  if (player.destroyed) return;
  if (blob) player.load(URL.createObjectURL(blob));
  else if (story.audioDataUrl) player.load(story.audioDataUrl);
}

/** Saving failed — keep the review screen and offer the recording as a file so it isn't lost. */
function _showSaveFailed(blob, title) {
  const box = $('review-save-error');
  box.style.display = '';
  const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
  const link = $('review-download-link');
  if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
  link.href = URL.createObjectURL(blob);
  link.download = `${(title || 'story').replace(/[^\w\s-]/g, '').trim() || 'story'}.${ext}`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function _destroyPlayers() {
  _players.forEach(p => p.destroy());
  _players = [];
}

/** Transcript as plain strings — stories saved before 2026-10-30 stored {text} objects. */
function _transcriptLines(story) {
  return (story.transcriptLines || [])
    .map(l => (typeof l === 'string' ? l : l?.text || ''))
    .filter(Boolean);
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

/** Working title: first words of the transcript, else the question asked. */
function _suggestTitle(transcript) {
  const first = (transcript || '').trim().split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '');
  const words = first.split(/\s+/).filter(Boolean);
  let t = words.length
    ? words.slice(0, 7).join(' ') + (words.length > 7 ? '…' : '')
    : (_currentQuestion || '')
        .replace(/^(tell me about|tell me what|what is|what was|what's|what did)\s+/i, '')
        .split(/[—?.]/)[0].trim();
  if (!t) t = 'A new story';
  return t.charAt(0).toUpperCase() + t.slice(1);
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

/**
 * Story Atlas — App controller
 * Wires all modules together. Manages page routing and state.
 */

import {
  getStoriesSorted, getStoryById, saveStory, deleteStory,
  getStoryteller, saveStoryteller, migrateAudioToIndexedDB,
  getProfiles, getActiveProfileId, setActiveProfile, createProfile,
  renameProfile, deleteProfile, clearStories,
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
let _prevPage        = 'signin';
let _aboutReturn     = 'signin';   // where About's button goes back to
let _recorder        = null;
let _timerInterval   = null;
let _players         = [];
let _currentStory    = null;
let _listenMapReady  = false;
let _currentQuestion = null;
let _demoMode        = false;   // true when exploring the sample atlas
let _landingManage   = false;   // landing page: showing Delete buttons on storytellers
let _landingShowAll  = false;   // landing page: showing every storyteller, not just the first few
const LANDING_MAX    = 3;

// "Signed in" means a device profile is active (see storage.js). No passwords.
const _isSignedIn = () => !!getActiveProfileId();
const _signOut    = ()  => { setActiveProfile(null); _demoMode = false; _currentStory = null; };
const _enterProfile = (id) => {
  setActiveProfile(id);
  _demoMode = false;
  _currentStory = null;
  _showPage('home');
};

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
  _bindAbout();
  _bindSignIn();
  _bindNav();
  _bindRecord();
  migrateAudioToIndexedDB().then(n => { if (n) requestPersistence(); });
  history.replaceState({ page: 'signin' }, '', '');
  _showPage('signin', false);
  // Tell the boot guard in index.html that the app started.
  window.__saBooted = true;
  try { sessionStorage.removeItem('sa_heal'); } catch (_) {}
});

window.addEventListener('popstate', (e) => {
  let page = e.state?.page || 'signin';
  if (page === 'about') page = 'signin';
  if (page === 'placer' || page === 'landing' || page === 'account') page = 'home';
  if (page !== 'signin' && !_isSignedIn() && !_demoMode) page = 'signin';
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

function _bindAbout() {
  // Back button returns to wherever the user came from
  $('about-back-btn').onclick = () => _showPage(_aboutReturn);
  // "On this page" jump links scroll, they don't navigate (no URL hash: a hash
  // change would fire popstate and bounce the page).
  document.querySelectorAll('.about-jump [data-jump]').forEach(btn => {
    btn.onclick = () => $(btn.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // "About" links wired from both sign-in and home — see _bindNav / _bindSignIn
}

function _bindSignIn() {
  // Add a profile
  $('profile-add-form').onsubmit = (e) => {
    e.preventDefault();
    const input = $('profile-add-input');
    const name  = input.value.trim();
    if (!name) { input.focus(); return; }
    const id = createProfile(name);
    if (!id) { _showToast("Could not save the profile. This browser's storage is full or blocked."); return; }
    input.value = '';
    _enterProfile(id);
  };
  // Try the demo
  $('demo-btn').onclick = $('lp-demo-btn').onclick = () => {
    _demoMode = true;
    _showPage('home');
  };
  // Bottom-of-page "Start an atlas": back up to the name box
  $('lp-start-btn').onclick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('profile-add-input').focus({ preventScroll: true });
  };
  // Storyteller list tools
  $('profile-manage-btn').onclick = () => { _landingManage = !_landingManage; _renderLanding(); };
  $('profile-show-all').onclick   = () => { _landingShowAll = !_landingShowAll; _renderLanding(); };
  $('avatar-menu-manage').onclick = () => { $('avatar-menu').style.display = 'none'; _openManage(); };
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
    _currentStory = null;
    _showPage(_isSignedIn() ? 'home' : 'signin');
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
  const close = _openModal('welcome-modal-overlay');
  $('welcome-save-btn').onclick = () => {
    const name = $('welcome-name-input').value.trim();
    if (!name) return;
    saveStoryteller({ name });
    close();
    _refreshAll();
    if (afterSave) afterSave();
  };
  $('welcome-skip-btn').onclick = () => close();
}

// ── Navigation ───────────────────────────────────────────────────

function _bindNav() {
  // Logo goes to the landing page (storyteller picker). An open profile stays
  // open there: the top bar keeps the avatar and its card is marked "Open now".
  $('nav-home').onclick         = () => _showPage('signin');
  $('avatar-menu-switch').onclick = () => {
    $('avatar-menu').style.display = 'none';
    _showPage('signin');
  };
  $('record-back-btn').onclick  = () => _showPage('home');
  $('home-record-cta').onclick  = (e) => { e.preventDefault(); _navRecord(); };

  // Desktop nav (hide Keepsake until implemented)
  $('nav-btn-home').onclick     = () => _showPage('home');
  $('nav-btn-map').onclick      = () => _showPage('listen');
  $('nav-btn-stories').onclick  = () => _showPage('stories');
  $('nav-btn-record').onclick   = () => _navRecord();
  const desktopKeepsake = $('nav-btn-keepsake');
  if (desktopKeepsake) desktopKeepsake.style.display = 'none';

  // Home hub
  $('home-open-atlas-btn').onclick  = (e) => { e.preventDefault(); e.stopPropagation(); _showPage('listen'); };
  // The whole map preview opens the map (but not the attribution links on it).
  $('home-map-wrap').onclick        = (e) => { if (!e.target.closest('.leaflet-control')) _showPage('listen'); };
  $('home-see-all-btn').onclick     = () => _showPage('stories');
  $('home-switch-btn').onclick      = () => _showPage('signin');   // pick another storyteller on the landing page
  $('home-first-record').onclick    = () => _navRecord();
  $('stories-record-btn').onclick   = () => _navRecord();
  // "or restore a backup" is a <label>; let the keyboard open the file picker too.
  document.querySelectorAll('label[for="backup-restore-input"][tabindex]').forEach(l => {
    l.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('backup-restore-input').click(); }
    });
  });

  // "About" links
  document.querySelectorAll('.js-about-link').forEach(el => {
    el.onclick = () => _showPage('about');
  });

  // Bottom tab bar (5 tabs — hide Keepsake until implemented)
  $('tab-home').onclick     = () => _showPage('home');
  $('tab-map').onclick      = () => _showPage('listen');
  $('tab-record').onclick   = () => _navRecord();
  $('tab-stories').onclick  = () => _showPage('stories');
  const tabKeepsake = $('tab-keepsake');
  if (tabKeepsake) tabKeepsake.style.display = 'none';

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

/** Landing page: one button per storyteller (device profile). */
function _renderLanding() {
  const list     = $('profile-list');
  const profiles = getProfiles();
  const activeId = getActiveProfileId();
  $('profile-heading').textContent = profiles.length ? "Who's telling stories?" : 'Start an atlas';
  $('profile-add-label').textContent = profiles.length ? 'Add another storyteller' : "Who's telling the stories?";
  if (!profiles.length) _landingManage = false;

  // The open storyteller goes first; a long list is cut short until asked for.
  const ordered = [...profiles].sort((a, b) => (b.id === activeId) - (a.id === activeId));
  const shown   = _landingShowAll || _landingManage ? ordered : ordered.slice(0, LANDING_MAX);
  list.innerHTML = shown.map(p => {
    const initials = p.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
    const count    = `${p.storyCount} stor${p.storyCount === 1 ? 'y' : 'ies'}`;
    const current  = p.id === activeId;
    return `<div class="si-profile-row" role="listitem">
      <button class="si-profile${current ? ' is-current' : ''}" data-profile-id="${_esc(p.id)}"${current ? ' aria-current="true"' : ''}>
        <span class="si-profile-dot" aria-hidden="true">${_esc(initials)}</span>
        <span class="si-profile-text"><b>${_esc(p.name)}</b><small>${count}</small></span>
        ${current ? '<span class="si-profile-badge">Open now</span>' : ''}
        ${_landingManage ? '' : '<svg class="si-profile-chev" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chev"/></svg>'}
      </button>
      ${_landingManage ? `<button class="si-profile-del" data-del-id="${_esc(p.id)}" aria-label="Delete ${_esc(p.name)}">Delete</button>` : ''}
    </div>`;
  }).join('');
  list.querySelectorAll('.si-profile').forEach(btn => {
    btn.onclick = () => _enterProfile(btn.dataset.profileId);
  });
  list.querySelectorAll('.si-profile-del').forEach(btn => {
    btn.onclick = () => _confirmDeleteProfile(btn.dataset.delId);
  });

  $('profile-tools').style.display = profiles.length ? '' : 'none';
  $('profile-manage-btn').textContent = _landingManage ? 'Done' : 'Remove a storyteller';
  const more = $('profile-show-all');
  more.style.display = (profiles.length > LANDING_MAX && !_landingManage) ? '' : 'none';
  more.textContent   = _landingShowAll ? 'Show fewer' : `Show all ${profiles.length}`;
}

// ── Deleting things ──────────────────────────────────────────────

/** Ask before deleting. `onOk` runs only if the person confirms. */
function _confirm({ title, body, ok, onOk }) {
  $('confirm-modal-title').textContent = title;
  $('confirm-modal-body').textContent  = body;
  $('confirm-ok').textContent          = ok;
  const close = _openModal('confirm-modal-overlay');
  $('confirm-cancel').onclick = close;
  $('confirm-ok').onclick     = () => { close(); onOk(); };
  $('confirm-cancel').focus();   // the safe choice is the default
}

function _confirmDeleteStory(story, after) {
  _confirm({
    title: `Delete “${story.title || 'Untitled'}”?`,
    body:  'The recording and its written words will be removed from this device. This can’t be undone.',
    ok:    'Delete story',
    onOk:  () => {
      deleteStory(story.id);
      if (_currentStory && _currentStory.id === story.id) _currentStory = null;
      if (after) after();
      _refreshAll();
      _showToast('Story deleted.');
    },
  });
}

function _confirmDeleteProfile(id, after) {
  const p = getProfiles().find(x => x.id === id);
  if (!p) return;
  const n = p.storyCount;
  _confirm({
    title: `Delete ${p.name}?`,
    body:  (n ? `${p.name}’s ${n} stor${n === 1 ? 'y' : 'ies'} and recordings` : `${p.name}’s atlas`) +
           ' will be removed from this device. This can’t be undone.',
    ok:    'Delete storyteller',
    onOk:  () => {
      const wasOpen = getActiveProfileId() === id;
      if (!deleteProfile(id)) { _showToast('Could not delete. Please try again.'); return; }
      if (wasOpen) _currentStory = null;
      if (after) after();
      _showPage('signin', _currentPage !== 'signin');
      _showToast(`${p.name} was deleted.`);
    },
  });
}

/** "Manage this atlas": rename, see what is stored, start over, or delete. */
function _openManage() {
  const id = getActiveProfileId();
  if (!id || _demoMode) return;
  const close = _openModal('manage-modal-overlay');
  const input = $('manage-name-input');
  const usage = $('manage-usage');
  const fill  = () => {
    const st = getStoryteller();
    const n  = getStoriesSorted().length;
    input.value = st.name || '';
    usage.textContent = `${n} stor${n === 1 ? 'y' : 'ies'} saved on this device.`;
    $('manage-erase').disabled = $('manage-download').disabled = n === 0;
    // How much room everything in this browser is taking, when the browser will say.
    navigator.storage?.estimate?.().then(({ usage: used }) => {
      if (used == null) return;
      const mb = used / 1048576;
      usage.textContent += ` Story Atlas is using ${mb < 1 ? 'less than 1' : 'about ' + Math.round(mb)} MB here.`;
    }).catch(() => {});
  };
  fill();

  $('manage-close').onclick = close;
  $('manage-name-save').onclick = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    if (!renameProfile(id, name)) { _showToast('Could not save the name.'); return; }
    _showPage(_currentPage, false);   // top bar and page pick up the new name
    _showToast('Name saved.');
  };
  $('manage-download').onclick = () => $('backup-download-btn').click();
  $('manage-erase').onclick = () => {
    const n = getStoriesSorted().length;
    _confirm({
      title: 'Erase all stories?',
      body:  `All ${n} stor${n === 1 ? 'y' : 'ies'} and recordings will be removed from this device. The storyteller stays, ready to start again. This can’t be undone.`,
      ok:    'Erase all stories',
      onOk:  () => {
        if (!clearStories()) { _showToast('Could not erase. Please try again.'); return; }
        _currentStory = null;
        close();
        _showPage('home', _currentPage !== 'home');
        _showToast('All stories erased.');
      },
    });
  };
  $('manage-delete').onclick = () => _confirmDeleteProfile(id, close);
}

function _showPage(name, push = true) {
  // Everything past the landing page needs a profile (or the demo).
  if (name !== 'signin' && name !== 'about' && !_isSignedIn() && !_demoMode) name = 'signin';
  if (name !== 'record') {
    if (_recorder && _recorder.isRecording) _recorder.stop();
    stopSpeaking();
  }
  if (name !== 'listen') _destroyPlayers();

  const ALL_PAGES = ['about', 'signin', 'home', 'record', 'listen', 'placer', 'stories'];
  ALL_PAGES.forEach(p => {
    const el = $(`page-${p}`);
    if (el) el.style.display = (p === name) ? '' : 'none';
  });
  _prevPage    = _currentPage;
  _currentPage = name;

  // Avatar and tab bar belong to a signed-in (or demo) session; the landing
  // page never shows them, and neither does About when nobody is signed in.
  const onEntry = name === 'signin';
  // The landing page is the storyteller picker, so arriving there ends the demo.
  if (onEntry) _demoMode = false;
  const onHub   = !onEntry && (_isSignedIn() || _demoMode);
  // The avatar also shows on the landing page while a profile is open, so
  // going back there doesn't look like being signed out.
  const showAvatar = onHub || (onEntry && _isSignedIn());
  const avatar  = $('topbar-avatar');
  const nav     = $('main-nav');
  if (avatar) avatar.style.display = showAvatar ? '' : 'none';
  if (nav)    nav.style.display    = onHub ? '' : 'none';   // same links on every page
  $('avatar-menu').style.display = 'none';

  // About's button says where it leads: back where you were, or on to start.
  if (name === 'about') {
    if (_prevPage !== 'about') _aboutReturn = _prevPage;
    if (!onHub) _aboutReturn = 'signin';
    const labels = { home: 'Back to Home', listen: 'Back to the map', stories: 'Back to Stories', record: 'Back to recording' };
    $('about-back-btn').textContent = onHub
      ? (labels[_aboutReturn] || 'Back to Home')
      : (getProfiles().length ? 'Choose a storyteller' : 'Start an atlas');
    if (onHub && !labels[_aboutReturn]) _aboutReturn = 'home';
    window.scrollTo(0, 0);
  }
  $('avatar-menu-switch').style.display = onEntry ? 'none' : '';
  $('avatar-menu-manage').style.display = (_isSignedIn() && !_demoMode) ? '' : 'none';
  if (!onEntry) { _landingManage = false; _landingShowAll = false; }

  // Update avatar initials
  if (showAvatar) {
    const st = _getStoryteller();
    const name2 = st.name || '';
    const initials = name2.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0,2) || '?';
    const avatarName = $('topbar-avatar-name');
    const avatarDot  = $('topbar-avatar-dot');
    if (avatarName) avatarName.textContent = name2 || 'You';
    if (avatarDot)  avatarDot.textContent  = initials;
  }

  // Tab bar: shown on hub pages, hidden on entry screen
  const tabbar = $('v2-tabbar');
  if (tabbar) tabbar.style.display = onHub ? '' : 'none';

  // body class for safe bottom padding on phone
  document.body.classList.toggle('has-tabs', onHub);

  // Tab bar active state + aria-current
  const tabMap = { home:'tab-home', listen:'tab-map', record:'tab-record', stories:'tab-stories' };
  Object.entries(tabMap).forEach(([page, id]) => {
    const t = $(id);
    if (t) {
      t.classList.toggle('on', page === name);
      t.setAttribute('aria-current', page === name ? 'page' : 'false');
    }
  });

  // Desktop nav active state
  const navBtnMap = { home:'nav-btn-home', listen:'nav-btn-map', stories:'nav-btn-stories', record:'nav-btn-record' };
  Object.entries(navBtnMap).forEach(([page, id]) => {
    const b = $(id);
    if (b) b.setAttribute('aria-current', page === name ? 'page' : 'false');
  });

  const aboutLink = $('topbar-about');
  if (aboutLink) aboutLink.setAttribute('aria-current', name === 'about' ? 'page' : 'false');

  if (push) history.pushState({ page: name }, '', '');

  if (name === 'signin')  _renderLanding();
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
  // stories is life-order; byCreated is newest-first for "continue" + recent section
  const byCreated = [...stories].sort((a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  const hasName = !!st.name;

  // Demo banner
  const banner = $('demo-banner');
  if (banner) banner.style.display = _demoMode ? '' : 'none';

  // Name / no-name toggle
  $('home-no-name').style.display       = (hasName || _demoMode) ? 'none' : '';
  $('home-storyteller-h1').style.display = (hasName || _demoMode) ? ''    : 'none';
  const nameEl = $('home-storyteller-name');
  if (nameEl) nameEl.textContent = st.name || '';

  // Meta line: N stories · N places
  const places = stories.filter(s => s.place).length;
  const metaEl = $('home-meta');
  if (metaEl) metaEl.innerHTML =
    `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} <span style="opacity:.5">·</span> ${places} place${places === 1 ? '' : 's'}`;

  // No stories yet: one welcome card with the single next step, instead of an
  // empty map, an empty timeline and an empty list.
  const empty = stories.length === 0;
  $('home-first').style.display      = empty ? '' : 'none';
  $('home-full').style.display       = empty ? 'none' : '';
  $('home-record-cta').style.display = empty ? 'none' : '';
  $('home-first-title').textContent  = st.name ? `Record ${st.name}'s first story` : 'Record the first story';
  // Backups belong to a real storyteller, not the sample atlas.
  $('backup-card').style.display     = _demoMode ? 'none' : '';
  if (empty) return;

  // "Continue where you left off" — most recently created story
  const continueCard = $('home-continue-card');
  const latest = byCreated[0];
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

  // Atlas foot: latest story name
  const atlasLatest = $('home-atlas-latest');
  if (atlasLatest && latest) {
    const era = latest.era || '';
    atlasLatest.textContent = `Latest: ${latest.title || 'Untitled'}${era ? ' · ' + era : ''}`;
  }

  // Timeline: the highlighted dot is the latest story, matching the label beside it
  _renderHomeTimeline(stories, latest?.id);

  // Map placeholder vs real Leaflet
  const storiesWithPlace = stories.filter(s => s.place && s.place.lat != null);
  const placeholder = $('home-map-placeholder');
  if (placeholder) placeholder.style.display = storiesWithPlace.length ? 'none' : '';
  setTimeout(() => {
    initHomeMap('home-leaflet');
    refreshHomePins(stories);
  }, 50);

  // Latest three, newest first. The full list (life order) is the Stories page.
  _renderStoryList(byCreated.slice(0, 3));
  $('home-see-all-btn').style.display   = stories.length > 3 ? '' : 'none';
  $('home-see-all-count').textContent   = stories.length;
}

function _renderHomeTimeline(stories, latestId) {
  const track = $('home-tl-track');
  if (!track) return;
  const total = stories.length;
  let html = '';
  stories.forEach((s, i) => {
    const pct = total < 2 ? 50 : Math.round((i / (total - 1)) * 92 + 4);
    const isLatest = s.id === latestId;
    html += `<i class="tl-dot${isLatest ? ' tl-dot-now' : ''}" style="left:${pct}%" title="${_esc(s.title || '')}"></i>`;
  });
  track.innerHTML = html;
}

function _renderStoryList(stories) {
  const container = $('story-list');
  if (!container) return;

  // (With no stories, Home shows the welcome card instead of this list.)
  container.innerHTML = stories.map(s => _storyCardHtml(s)).join('');
  _wireStoryCards(container);
}

function _wireStoryCards(container) {
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
  container.querySelectorAll('.v2-story-edit[data-edit-id]').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); _openEditModal(btn.dataset.editId); };
  });
}

function _renderStoriesPage() {
  const stories = _getStories();
  const container = $('stories-page-list');
  if (!container) return;
  const st = _getStoryteller();
  $('stories-overline').textContent = st.name ? `Stories of ${st.name}` : 'Stories';
  const places = stories.filter(s => s.place).length;
  $('stories-meta').textContent = stories.length
    ? `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} · ${places} place${places === 1 ? '' : 's'} · earliest memories first`
    : '';
  if (!stories.length) {
    container.innerHTML = `
      <div class="v2-card v2-empty">
        <p class="t-h2">No stories yet.</p>
        <p class="t-body soft">Each story you record lands here, in the order it happened in their life.</p>
        <button class="btn btn-primary js-empty-record">${_micSvg()} Record the first story</button>
      </div>`;
    container.querySelector('.js-empty-record').onclick = () => _navRecord();
    return;
  }
  // Life order, grouped into chapters: a heading each time the era changes.
  const total = stories.length;
  let html = '', lastEra = null, open = false;
  stories.forEach(s => {
    const era = s.era || assignEra(s, total) || 'Undated';
    if (era !== lastEra) {
      if (open) html += '</div>';
      html += `<h2 class="v2-era-h2"><span>${_esc(era)}</span></h2><div class="v2-stories">`;
      open = true; lastEra = era;
    }
    html += _storyCardHtml(s);
  });
  if (open) html += '</div>';
  container.innerHTML = html;
  _wireStoryCards(container);
}

function _storyCardHtml(story) {
  const all   = _getStories();
  const total = all.length;
  // The number is the story's place in life order, wherever the card is shown.
  const idx  = Math.max(0, all.findIndex(s => s.id === story.id));
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

  const editBtn = _demoMode ? '' :
    `<button class="v2-story-edit" data-edit-id="${_esc(story.id)}" aria-label="Edit ${_esc(story.title || 'Untitled')}"
      style="position:absolute;top:12px;right:12px;background:none;border:none;cursor:pointer;padding:6px;color:var(--ink-faint);border-radius:8px;display:flex;align-items:center;justify-content:center"
      title="Edit story">${_penSvg()}</button>`;
  return `
    <div class="v2-story-wrap" style="position:relative">
      <button class="v2-story" data-id="${_esc(story.id)}">
        <span class="v2-story-num" style="position:absolute;top:-10px;left:18px;font:700 12px var(--font-sans);letter-spacing:.08em;background:var(--parchment);padding:0 8px;color:var(--ink-soft)">${idx + 1}</span>
        <div class="v2-story-top">
          <h3 class="v2-story-title">${_esc(story.title || 'Untitled')}</h3>
          <span class="v2-story-dur">${dur}</span>
        </div>
        ${(placeChip || eraChip || ageChip) ? `<div class="v2-chips">${placeChip}${eraChip}${ageChip}</div>` : ''}
        ${quote}
        ${statusHtml}
      </button>
      ${editBtn}
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

// ── Edit story modal ──────────────────────────────────────────────

function _openEditModal(id) {
  const story = getStoryById(id);
  if (!story) return;
  const titleInput = $('edit-story-title');
  const transcriptInput = $('edit-story-transcript');
  titleInput.value = story.title || '';
  transcriptInput.value = (story.transcriptLines || []).join('\n');

  const close = _openModal('edit-story-modal-overlay');

  $('edit-story-cancel').onclick = close;

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
      _refreshAll();
      _showToast('Story updated.');
    } else {
      _showToast('Could not save — device may be full.');
    }
  };

  const deleteBtn = $('edit-story-delete');
  if (deleteBtn) {
    deleteBtn.onclick = () => _confirmDeleteStory(story, close);
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

const MIC_CONSENT_KEY = 'sa_mic_consent';

async function _startRecording() {
  if (_recorder && _recorder.isRecording) return;

  // If no name set yet, ask for it first then come back
  if (!getStoryteller().name) {
    _promptForName(() => _startRecording());
    return;
  }

  // Show consent before first microphone use
  if (!localStorage.getItem(MIC_CONSENT_KEY)) {
    if ($('consent-modal-overlay')) {
      const closeConsent = _openModal('consent-modal-overlay');
      $('consent-accept-btn').onclick = () => {
        localStorage.setItem(MIC_CONSENT_KEY, '1');
        closeConsent();
        _startRecording();
      };
      $('consent-cancel-btn').onclick = () => closeConsent();
      return;
    }
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
    transcribe(blob, null, () => {}, liveTranscript).then(result => {
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
    // fall back to base64-in-localStorage (convert on demand, not upfront).
    try {
      await putAudio(id, blob);
    } catch (e) {
      console.warn('StoryAtlas: IndexedDB save failed, falling back', e);
      story.audioDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      story.hasAudio = false;
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
      ${_storyActionsHtml(story)}
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
    ${_storyActionsHtml(story)}
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
  if (blob) {
    player.load(URL.createObjectURL(blob));
  } else if (story.audioDataUrl) {
    player.load(story.audioDataUrl);
  } else {
    // No audio available — disable controls and show a "transcript only" note
    player.disable?.();
    const key = player._playBtn?.id?.replace('play-btn-', '');
    if (key) {
      const scrubber = document.getElementById(`scrubber-${key}`);
      const skipBack = document.getElementById(`skip-back-${key}`);
      const skipFwd  = document.getElementById(`skip-fwd-${key}`);
      const playBtn  = document.getElementById(`play-btn-${key}`);
      if (scrubber) scrubber.style.opacity = '0.35';
      if (skipBack) { skipBack.disabled = true; skipBack.style.opacity = '0.35'; }
      if (skipFwd)  { skipFwd.disabled  = true; skipFwd.style.opacity  = '0.35'; }
      if (playBtn)  { playBtn.disabled  = true; playBtn.style.opacity  = '0.35'; }
      if (playBtn?.parentElement) {
        const note = document.createElement('p');
        note.style.cssText = 'font-size:14px;color:var(--ink-soft);text-align:center;margin:4px 0 0';
        note.textContent = 'Transcript preview — no audio in demo';
        playBtn.parentElement.after(note);
      }
    }
  }
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
  const html = `
    <div class="listen-empty">
      <p class="t-h2">Nothing on the map yet.</p>
      <p class="t-body soft">Record a story and pin it to a place. It will show up here.</p>
      <button class="btn btn-primary js-empty-record">${_micSvg()} Record a story</button>
    </div>`;
  // Phone sheet and desktop panel both get it.
  ['listen-sheet-content', 'listen-desktop-content'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = html;
    el.querySelector('.js-empty-record').onclick = () => _navRecord();
  });
  ['mobile-upnext', 'desktop-upnext'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
  if (!_listenMapReady) { initListenMap('listen-map'); _listenMapReady = true; }
  renderListenPins([], null);
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Open a modal overlay with full accessibility:
 * - sets role/aria-modal/aria-labelledby on the inner .modal
 * - moves focus to the first focusable element
 * - traps Tab inside the modal
 * - closes on Escape or backdrop click
 * - restores focus on close
 * Returns a close function.
 */
function _openModal(overlayId, onClose) {
  const overlay = $(overlayId);
  if (!overlay) return () => {};
  const modal = overlay.querySelector('[role="dialog"]') || overlay.querySelector('.modal');
  const previousFocus = document.activeElement;

  overlay.classList.add('open');

  const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const getFocusable = () => [...modal.querySelectorAll(FOCUSABLE)];
  const firstFocusable = getFocusable()[0];
  if (firstFocusable) firstFocusable.focus();

  const trapTab = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (!focusable.length) { e.preventDefault(); return; }
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  };
  const onEscape = (e) => { if (e.key === 'Escape') close(); };
  const onBackdrop = (e) => { if (e.target === overlay) close(); };

  document.addEventListener('keydown', trapTab);
  document.addEventListener('keydown', onEscape);
  overlay.addEventListener('click', onBackdrop);

  function close() {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', trapTab);
    document.removeEventListener('keydown', onEscape);
    overlay.removeEventListener('click', onBackdrop);
    if (previousFocus) previousFocus.focus();
    if (onClose) onClose();
  }
  return close;
}

function _refreshAll() {
  if (_currentPage === 'home')    _renderHome();
  if (_currentPage === 'stories') _renderStoriesPage();
  if (_currentPage === 'listen') {
    // Show the edited story again, or the first one left if it was deleted.
    _currentStory = _currentStory && !_demoMode ? getStoryById(_currentStory.id) : _currentStory;
    _showPage('listen', false);
  }
}

/** Edit / Delete buttons shown with a story on the map page. */
function _storyActionsHtml(story) {
  if (_demoMode) return '';
  return `
    <div class="story-actions">
      <button class="story-action" data-story-action="edit" data-story-id="${_esc(story.id)}">${_penSvg()}Edit</button>
      <button class="story-action story-action-danger" data-story-action="delete" data-story-id="${_esc(story.id)}">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>Delete
      </button>
    </div>`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-story-action]');
  if (!btn) return;
  const story = getStoryById(btn.dataset.storyId);
  if (!story) return;
  if (btn.dataset.storyAction === 'edit') _openEditModal(story.id);
  else _confirmDeleteStory(story);
});

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

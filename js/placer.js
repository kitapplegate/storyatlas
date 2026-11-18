/**
 * Story Atlas — Placer
 * Two-step wizard after recording:
 *   Step 1: Place in time (binary-search before/after)
 *   Step 2: Place on map (Nominatim geocoding, pin precision)
 *
 * Renders into #page-placer. Calls back when complete.
 */

import { getStoriesSorted, getStoryById, reorderStory, saveStory, getStoryteller } from './storage.js';
import { autoPlace, findPlace, searchExact, zoomFor, precisionFor } from './geocode.js';

let _story    = null;   // the story being placed
let _step     = 1;      // 1 or 2
let _map      = null;   // Leaflet map instance for step 2
let _marker   = null;   // Leaflet marker
let _onDone   = null;   // callback(story) when wizard completes

// Binary search state
let _low  = 0;
let _high = 0;
let _mid  = 0;
let _sorted = [];

// Step 2 state
let _selectedPlace = null;   // { name, quote }
let _detectedPlaces = [];
let _placeOnly      = false;   // true when changing the place of a story saved earlier

// ── Public API ───────────────────────────────────────────────────

/**
 * Start the wizard for a newly recorded story.
 * @param {object}   story          — the story object (already saved)
 * @param {object[]} detectedPlaces — [{ name, quote }] from transcriber
 * @param {Function} onDone         — called with updated story when wizard finishes
 * @param {{placeOnly?: boolean}} [opts] — placeOnly skips the "when" step (changing a saved story's place)
 */
export function startPlacer(story, detectedPlaces, onDone, opts = {}) {
  _story          = story;
  _detectedPlaces = detectedPlaces || [];
  _onDone         = onDone;
  _step           = 1;
  _selectedPlace  = null;
  _placeOnly      = !!opts.placeOnly;

  _sorted = getStoriesSorted().filter(s => s.id !== story.id);

  if (_sorted.length === 0 || _placeOnly) {
    // First story — skip time placement, go straight to place
    _step = 2;
    _renderStep2();
  } else {
    _initBinarySearch();
    _renderStep1();
  }

  _show();
}

export function hidePlacer() {
  _hide();
}

// ── Rendering ────────────────────────────────────────────────────

function _show() {
  document.getElementById('page-placer').style.display = 'block';
  document.getElementById('page-home').style.display    = 'none';
  document.getElementById('page-record').style.display  = 'none';
  document.getElementById('page-listen').style.display  = 'none';
}

function _hide() {
  document.getElementById('page-placer').style.display = 'none';
}

// The new story's slot is somewhere in [_low, _high]: slot i means "just
// before _sorted[i]", slot _sorted.length means "after everything".
function _initBinarySearch() {
  _low  = 0;
  _high = _sorted.length;
  _mid  = Math.floor((_low + _high) / 2);
}

function _questionsLeft() {
  return Math.max(1, Math.ceil(Math.log2(_high - _low + 1)));
}

function _renderStep1() {
  const s1 = document.getElementById('placer-step1');
  const s2 = document.getElementById('placer-step2');
  if (s1) s1.style.display = '';
  if (s2) s2.style.display = 'none';
  const container = s1;
  if (!container) return;
  const neighbor  = _sorted[_mid];

  container.innerHTML = `
    <header class="appbar">
      <button class="icon-btn" id="placer-back" aria-label="Back">
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <span class="t-label grow" style="font-size:18px">When it happened</span>
      <span class="t-caption" style="padding-right:8px">Step 1 of 2</span>
    </header>
    <div class="steps" style="padding:0 24px; margin-top:4px">
      <span class="steps-bar on"></span>
      <span class="steps-bar"></span>
    </div>
    <div class="pad" style="margin-top:18px">
      <div class="placer-story-chip">
        <span class="placer-story-icon">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>
        </span>
        <div>
          <div class="t-caption" style="font-size:14px">New story · ${_fmtDur(_story.duration)}</div>
          <div class="t-h3" style="font-size:19px;line-height:24px">${_esc(_story.title || 'Untitled')}</div>
        </div>
      </div>

      <h1 class="t-h1" style="margin-top:20px;font-size:30px">When did this happen?</h1>
      <p class="t-body soft" style="margin-top:6px">Was this before or after</p>
      <p class="t-h2" style="margin-top:2px">${_esc(neighbor.title || 'Untitled')}?</p>

      <div class="row gap12" style="margin-top:16px">
        <button class="btn btn-choice grow" data-choice="before">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
          Before
        </button>
        <button class="btn btn-choice grow" data-choice="after">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          After
        </button>
      </div>

      ${_renderMiniTimeline(neighbor)}

      <div style="margin-top:18px">
        <label class="t-label">About how old were you? <span class="soft" style="font-weight:500">(optional)</span></label>
        <div class="row gap8" style="margin-top:8px">
          <button class="icon-btn outline" id="age-minus" style="width:56px;height:56px;border-radius:14px" aria-label="Younger">
            <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
          </button>
          <div id="age-display" style="width:96px;height:56px;border-radius:14px;border:1.5px solid #cdbfa8;background:var(--paper);display:grid;place-items:center;font-family:var(--font-serif);font-size:26px;font-weight:500">
            ${_story.ageAtEvent ?? '—'}
          </div>
          <button class="icon-btn outline" id="age-plus" style="width:56px;height:56px;border-radius:14px" aria-label="Older">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <span class="t-body soft" style="margin-left:4px">years old</span>
        </div>
      </div>
    </div>

    <div class="placer-footer">
      <button class="btn btn-quiet btn-block" id="placer-skip-time">I'm not sure. Skip for now</button>
    </div>
  `;

  document.getElementById('placer-back').onclick = () => _finish(_story.place ?? null);
  document.getElementById('placer-skip-time').onclick = () => { _step = 2; _renderStep2(); };

  container.querySelectorAll('[data-choice]').forEach(btn => {
    btn.onclick = () => _handleTimeChoice(btn.dataset.choice);
  });

  // Age stepper
  let age = _story.ageAtEvent ?? null;
  const ageDisplay = document.getElementById('age-display');
  document.getElementById('age-minus').onclick = () => {
    if (age === null) age = 30;
    else age = Math.max(0, age - 1);
    ageDisplay.textContent = age;
    _story.ageAtEvent = age;
  };
  document.getElementById('age-plus').onclick = () => {
    if (age === null) age = 30;
    else age = Math.min(110, age + 1);
    ageDisplay.textContent = age;
    _story.ageAtEvent = age;
  };
}

function _handleTimeChoice(relation) {
  // Narrow the binary search
  if (relation === 'before') _high = _mid;
  else _low = _mid + 1;

  if (_low < _high) {
    _mid = Math.floor((_low + _high) / 2);
    _renderStep1();
    return;
  }

  // Slot found — move the story there once
  if (_low < _sorted.length) reorderStory(_story.id, _sorted[_low].id, 'before');
  else reorderStory(_story.id, _sorted[_sorted.length - 1].id, 'after');
  _step = 2;
  _renderStep2();
}

function _renderMiniTimeline(neighbor) {
  // The stories already known to come just before and just after this one
  const left  = _sorted[_low - 1];
  const right = _sorted[_high];
  const questionsLeft = _questionsLeft();

  return `
    <div class="card" style="margin-top:18px;padding:14px 16px 10px">
      <div class="row" style="justify-content:space-between">
        <span class="t-label">Where it might fit</span>
        <span class="t-caption">${questionsLeft} more question${questionsLeft !== 1 ? 's' : ''}</span>
      </div>
      <div class="tl" style="height:70px;margin-top:4px">
        <div class="tl-track"></div>
        ${left  ? `<i class="tl-dot nb" style="left:15%"></i>` : ''}
        <i class="tl-dot new" style="left:49%">?</i>
        ${right ? `<i class="tl-dot nb" style="left:83%"></i>` : ''}
        <div class="tl-eras">
          <span></span>
          ${left  ? `<span style="position:absolute;left:15%;transform:translateX(-50%);top:36px;font-size:13px;font-weight:600;color:var(--ink)">${_esc((left.title || '').slice(0, 16))}</span>` : ''}
          <span style="position:absolute;left:49%;transform:translateX(-50%);top:36px;font-size:13px;font-weight:600;color:var(--rust-dark)">This story</span>
          ${right ? `<span style="position:absolute;left:83%;transform:translateX(-50%);top:36px;font-size:13px;font-weight:600;color:var(--ink)">${_esc((right.title || '').slice(0, 16))}</span>` : ''}
          <span></span>
        </div>
      </div>
    </div>
  `;
}

// ── Step 2: Place on map ─────────────────────────────────────────
// The app finds the place by itself from what was said and drops the pin.
// The person only has to press one button. Searching, picking another match
// and tapping the map are all behind "Change the place".

function _renderStep2() {
  const s1 = document.getElementById('placer-step1');
  const s2 = document.getElementById('placer-step2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = '';
  const container = s2;
  if (!container) return;

  // The old map's element is about to be replaced — drop it so a fresh one is built
  if (_map) { _map.remove(); _map = null; _marker = null; }
  _searchSeq++;
  _pin = null;

  const stepLabel = _placeOnly ? '' : (_sorted.length ? 'Step 2 of 2' : '');
  container.innerHTML = `
    <header class="appbar">
      <button class="icon-btn" id="placer2-back" aria-label="Back">
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <span class="t-label grow" style="font-size:18px">${_placeOnly ? 'Change the place' : 'Where it happened'}</span>
      <span class="t-caption" style="padding-right:8px">${stepLabel}</span>
    </header>
    ${_placeOnly || !_sorted.length ? '' : `
    <div class="steps" style="padding:0 24px; margin-top:4px">
      <span class="steps-bar on"></span>
      <span class="steps-bar on"></span>
    </div>`}
    <div class="pad" style="margin-top:16px">
      <h1 class="t-h1" style="font-size:30px">Where did this happen?</h1>

      <div id="place-answer" class="place-answer" role="status" aria-live="polite"></div>

      <div id="placer-map" class="map-area card" style="height:236px;margin-top:14px;border-radius:18px"></div>

      <button class="btn btn-secondary btn-block" id="place-change-btn" style="margin-top:14px;display:none">
        Change the place
      </button>

      <div id="place-change" style="display:none">
        <div style="margin-top:18px">
          <label class="t-label" for="place-search-input">Type the place</label>
          <div class="row gap8" style="margin-top:6px">
            <input id="place-search-input" type="text" class="modal input"
              style="margin-bottom:0;flex:1;min-width:0;border-radius:var(--radius-sm);padding:12px 14px;font-size:16px;border:1.5px solid var(--line);background:var(--parchment)"
              placeholder="e.g. Lincoln School, Springfield">
            <button class="btn btn-secondary" id="place-search-btn" style="flex:none">Search</button>
          </div>
        </div>
        <p id="place-search-status" class="place-status" role="status" aria-live="polite"></p>
        <div id="place-results" class="place-results" style="display:none"></div>
        <p class="t-caption" style="margin-top:10px">You can also zoom in and tap the map to put the pin exactly where you want it.</p>
      </div>
    </div>

    <div class="placer-footer placer-footer-stack">
      <button class="btn btn-primary btn-block" id="placer-confirm-place" disabled>Looks right</button>
      <button class="btn btn-quiet btn-block" id="placer-skip-place">${_placeOnly && _story.place ? 'Remove the place' : 'Skip, no place'}</button>
    </div>
  `;

  document.getElementById('placer2-back').onclick = () => {
    if (_placeOnly) _finish(_story.place ?? null, true);
    else if (_sorted.length > 0) { _step = 1; _initBinarySearch(); _renderStep1(); }
    else _finish(null);
  };
  document.getElementById('place-change-btn').onclick = () => _openChange(true);
  document.getElementById('place-search-btn').onclick = () => {
    const val = document.getElementById('place-search-input').value.trim();
    if (val) _search(val);
  };
  document.getElementById('place-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val) _search(val);
    }
  });
  document.getElementById('placer-skip-place').onclick = () => _finish(null);
  document.getElementById('placer-confirm-place').onclick = () => {
    if (!_marker || !_pin) return;
    const ll = _marker.getLatLng();
    _finish({ label: _pin.label, lat: ll.lat, lng: ll.lng, precision: _pin.precision });
  };

  _initMap();

  if (_placeOnly && _story.place) {
    // Changing an existing pin: show it, with the search box open.
    const p = _story.place;
    _setPin({ lat: p.lat, lng: p.lng, label: p.label, kind: '' }, 14, p.precision);
    _say('Right now this story is pinned at', _shortLabel(p.label));
    _openChange(false);
  } else if (_detectedPlaces.length) {
    _autoFind();
  } else {
    _say('We didn’t hear a place in this story.', '', 'Type where it happened, or skip this step.');
    _openChange(false);
  }
}

/** The headline above the map: what the app did, in plain words. */
function _say(lead, place, note) {
  const el = document.getElementById('place-answer');
  if (!el) return;
  el.innerHTML =
    `<p class="place-answer-lead">${_esc(lead)}</p>` +
    (place ? `<p class="place-answer-name">${_esc(place)}</p>` : '') +
    (note  ? `<p class="place-answer-note">${_esc(note)}</p>` : '');
}

/** Show the search box. `focus` when the person asked for it. */
function _openChange(focus) {
  document.getElementById('place-change').style.display = '';
  document.getElementById('place-change-btn').style.display = 'none';
  if (focus) document.getElementById('place-search-input').focus();
}

/** A shorter place name for the headline: "Sangre Ridge Elementary, Stillwater, Oklahoma". */
function _shortLabel(label) {
  const parts = label.split(',').map(s => s.trim()).filter(Boolean)
    .filter(p => !/^\d{4,}/.test(p) && !/ County$/.test(p) && p !== 'United States');
  if (parts.length <= 3) return parts.join(', ');
  return [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(', ');
}

/** Where this storyteller's other stories are: the newest one that has a pin. */
function _nearbyHint() {
  const placed = _sorted.filter(s => s.place && s.place.lat != null)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return placed.length ? { lat: placed[0].place.lat, lng: placed[0].place.lng } : null;
}

/**
 * With no pinned story yet, the town the storyteller grew up in (from "About
 * the storyteller") is the next best idea of where to look for a misheard name.
 */
const _hometownSpots = new Map();
async function _hometownHint() {
  const town = String(getStoryteller().about?.hometown || '').trim();
  if (!town) return null;
  if (!_hometownSpots.has(town)) {
    const hits = await searchExact(town).catch(() => []);
    if (!hits.length) return null;
    _hometownSpots.set(town, { lat: hits[0].lat, lng: hits[0].lng });
  }
  return _hometownSpots.get(town);
}

/** Find the place from what was said and drop the pin, with nothing to press. */
async function _autoFind() {
  const seq = ++_searchSeq;
  _say('Finding the place on the map…');
  let found = null;
  try {
    found = await autoPlace(_detectedPlaces.map(p => p.name), _nearbyHint() || await _hometownHint());
  } catch (e) { /* treated as not found */ }
  if (seq !== _searchSeq || !document.getElementById('place-answer')) return;

  if (!found) {
    const heard = _detectedPlaces[0].name;
    _say(`We heard “${heard}” but couldn’t find it on the map.`, '',
         'Check the spelling below, add the town, or skip this step.');
    document.getElementById('place-search-input').value = heard;
    _openChange(false);
    return;
  }

  _selectedPlace = _detectedPlaces.find(p => p.name === found.name) || null;
  _setPin(found.place, zoomFor(found.place.kind));
  document.getElementById('place-search-input').value = found.name;
  if (found.sure) {
    _say('We put this story at', _shortLabel(found.place.label));
    document.getElementById('place-change-btn').style.display = '';
  } else {
    _say(`We heard “${found.name}”. Our best guess is`, _shortLabel(found.place.label),
         'If that’s not it, pick another below or type the town.');
    _showResults([found.place, ...found.alternatives]);
    _openChange(false);
  }
}

// Build the map for step 2. Tapping it drops (or moves) the pin, so a place
// can always be set by hand when the search can't find it.
function _initMap() {
  if (_map || !document.getElementById('placer-map')) return;
  _map = L.map('placer-map', { zoomControl: false }).setView([30, -40], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(_map);
  L.control.zoom({ position: 'bottomright' }).addTo(_map);
  _map.on('click', e => _handPin(e.latlng));
  setTimeout(() => _map && _map.invalidateSize(), 0);
}

/** The person put the pin down (or dragged it) themselves. */
function _handPin(latlng) {
  const typed = document.getElementById('place-search-input').value.trim();
  const label = (_pin && _pin.label) || typed || 'Pinned on the map';
  _setPin({ lat: latlng.lat, lng: latlng.lng, label, kind: '' }, null, 'Exact spot');
  _say('The pin is where you put it.', '', 'Press “Looks right” to keep it there.');
}

/** Put the pin at a place. A zoom level also moves the map there. */
function _setPin(place, zoom, precision) {
  if (!_map) return;
  const ll = [place.lat, place.lng];
  if (_marker) _marker.setLatLng(ll);
  else {
    _marker = L.marker(ll, { draggable: true }).addTo(_map);
    _marker.on('dragend', () => _handPin(_marker.getLatLng()));
  }
  if (zoom != null) _map.setView(ll, zoom);
  _pin = { label: place.label, precision: precision || precisionFor(place.kind) };
  document.getElementById('placer-confirm-place').disabled = false;
}

function _setStatus(msg, isError = false) {
  const el = document.getElementById('place-search-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('is-error', !!isError);
}

/** List matches to choose from; the first is already pinned. */
function _showResults(list) {
  const results = document.getElementById('place-results');
  if (!results) return;
  if (list.length < 2) { results.style.display = 'none'; results.innerHTML = ''; return; }
  results.innerHTML = '<div class="t-label" style="margin-bottom:6px">More than one match. Which one?</div>' +
    list.map((r, i) => `<button type="button" class="${i === 0 ? 'on' : ''}">${_esc(r.label)}</button>`).join('');
  results.style.display = '';
  results.querySelectorAll('button').forEach((b, i) => {
    b.onclick = () => {
      _setPin(list[i], zoomFor(list[i].kind));
      _say('We put this story at', _shortLabel(list[i].label));
      results.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    };
  });
}

let _searchSeq = 0;   // only the newest search may update the screen
let _pin = null;      // { label, precision } for the pin now on the map

/** A search the person typed. */
async function _search(query) {
  const seq = ++_searchSeq;
  const btn = document.getElementById('place-search-btn');
  if (!btn) return;
  _selectedPlace = null;
  _showResults([]);
  btn.disabled = true;
  btn.textContent = 'Searching…';
  _setStatus(`Looking for “${query}”…`);
  try {
    const { results } = await findPlace(query, _nearbyHint());
    if (seq !== _searchSeq) return;
    if (!results.length) {
      _setStatus(`We couldn’t find “${query}”. Try the town and state, like “Dayton, Ohio”, or tap the map to place the pin yourself.`, true);
      return;
    }
    _setStatus('');
    _setPin(results[0], zoomFor(results[0].kind));
    _say('We put this story at', _shortLabel(results[0].label));
    _showResults(results);
  } catch (err) {
    if (seq === _searchSeq) {
      _setStatus('The search didn’t go through. Check your connection and try again, or tap the map to place the pin yourself.', true);
    }
  } finally {
    if (seq === _searchSeq && document.getElementById('place-search-btn')) { btn.disabled = false; btn.textContent = 'Search'; }
  }
}

function _finish(place, unchanged = false) {
  // Start from the stored copy: reorderStory() changed orderIndex there, and
  // saving our in-memory copy would put the story back at the end.
  _story = {
    ...(getStoryById(_story.id) || _story),
    place,
    placeQuote: unchanged ? (_story.placeQuote ?? null) : (place ? (_selectedPlace?.quote || null) : null),
    ageAtEvent: _story.ageAtEvent ?? null,
  };
  saveStory(_story);
  _hide();
  // Destroy map to avoid Leaflet duplicate
  if (_map) { _map.remove(); _map = null; _marker = null; }
  _onDone && _onDone(_story);
}

// ── Helpers ──────────────────────────────────────────────────────

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _fmtDur(secs) {
  if (!secs) return '0:00';
  return `${Math.floor(secs/60)}:${String(Math.floor(secs%60)).padStart(2,'0')}`;
}

function _showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/**
 * Story Atlas — Placer
 * Two-step wizard after recording:
 *   Step 1: Place in time (binary-search before/after)
 *   Step 2: Place on map (Nominatim geocoding, pin precision)
 *
 * Renders into #page-placer. Calls back when complete.
 */

import { getStoriesSorted, getStoryById, reorderStory, saveStory } from './storage.js';

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
let _precision     = 'Street';
let _detectedPlaces = [];

// ── Public API ───────────────────────────────────────────────────

/**
 * Start the wizard for a newly recorded story.
 * @param {object}   story          — the story object (already saved)
 * @param {object[]} detectedPlaces — [{ name, quote }] from transcriber
 * @param {Function} onDone         — called with updated story when wizard finishes
 */
export function startPlacer(story, detectedPlaces, onDone) {
  _story          = story;
  _detectedPlaces = detectedPlaces || [];
  _onDone         = onDone;
  _step           = 1;
  _selectedPlace  = null;
  _precision      = 'Street';

  _sorted = getStoriesSorted().filter(s => s.id !== story.id);

  if (_sorted.length === 0) {
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
      <span class="t-label grow" style="font-size:18px">Place this story</span>
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

function _renderStep2() {
  // Switch visible step
  const s1 = document.getElementById('placer-step1');
  const s2 = document.getElementById('placer-step2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = '';
  const container = s2;
  if (!container) return;

  // The old map's element is about to be replaced — drop it so _geocode builds a fresh one
  if (_map) { _map.remove(); _map = null; _marker = null; }

  container.innerHTML = `
    <header class="appbar">
      <button class="icon-btn" id="placer2-back" aria-label="Back">
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <span class="t-label grow" style="font-size:18px">Place this story</span>
      <span class="t-caption" style="padding-right:8px">Step 2 of 2</span>
    </header>
    <div class="steps" style="padding:0 24px; margin-top:4px">
      <span class="steps-bar on"></span>
      <span class="steps-bar on"></span>
    </div>
    <div class="pad" style="margin-top:16px">
      <h1 class="t-h1" style="font-size:30px">Where did this happen?</h1>
      <p class="t-body soft" style="margin-top:4px;font-size:17px;line-height:24px">
        ${_detectedPlaces.length > 0
          ? 'Places we heard in the story. Tap one to find it, or type the place yourself.'
          : 'Type a town, a street or a landmark and we\'ll find it on the map.'}
      </p>

      ${_detectedPlaces.length > 0 ? _renderPlaceSuggestions() : ''}

      <div style="margin-top:14px">
        <label class="t-label" for="place-search-input">Place name or address</label>
        <div class="row gap8" style="margin-top:6px">
          <input id="place-search-input" type="text" class="modal input"
            style="margin-bottom:0;flex:1;border-radius:var(--radius-sm);padding:12px 14px;font-size:16px;border:1.5px solid var(--line);background:var(--parchment)"
            placeholder="e.g. Lincoln School, Springfield"
            value="${_selectedPlace ? _esc(_selectedPlace.name) : ''}">
          <button class="btn btn-secondary" id="place-search-btn" style="flex:none">Search</button>
        </div>
      </div>

      <p id="place-search-status" class="place-status" role="status" aria-live="polite"></p>
      <div id="place-results" class="place-results" style="display:none"></div>

      <div id="placer-map" class="map-area card" style="height:236px;margin-top:14px;border-radius:18px"></div>
      <p id="placer-map-tip" class="t-caption" style="margin-top:8px">Can't find it? Zoom in and tap the map to put the pin there yourself.</p>
      <div id="placer-map-hint" style="display:none;margin-top:6px">
        <span class="chip chip-paper" style="background:rgba(43,38,34,.82);color:var(--paper)">
          <svg class="ico sm" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>
          Drag the pin to move it
        </span>
      </div>

      <div id="precision-section" style="display:none;margin-top:14px">
        <div class="t-label" style="margin-bottom:8px">How exact is the pin?</div>
        <div class="precision-grid">
          ${['Exact spot','Street','Neighborhood','Town'].map(p => `
            <button class="precision-btn${p === _precision ? ' on' : ''}" data-precision="${p}">
              ${p === _precision ? '<svg class="ico sm" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}
              ${p}
            </button>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="row gap12 placer-footer">
      <button class="btn btn-secondary grow" id="placer-skip-place">Skip, no place</button>
      <button class="btn btn-primary grow" id="placer-confirm-place" disabled>Confirm place</button>
    </div>
  `;

  // Wire suggestions — geocode only when the user explicitly taps one
  if (_detectedPlaces.length > 0) {
    container.querySelectorAll('.place-suggestion').forEach(card => {
      card.onclick = () => {
        container.querySelectorAll('.place-suggestion').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const idx = parseInt(card.dataset.idx);
        _selectedPlace = _detectedPlaces[idx];
        document.getElementById('place-search-input').value = _selectedPlace.name;
        _geocode(_selectedPlace.name);
      };
    });
  }

  document.getElementById('placer2-back').onclick = () => {
    if (_sorted.length > 0) { _step = 1; _initBinarySearch(); _renderStep1(); }
    else _finish(null);
  };
  document.getElementById('place-search-btn').onclick = () => {
    const val = document.getElementById('place-search-input').value.trim();
    if (val) { _selectedPlace = null; _geocode(val); }
  };
  document.getElementById('place-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val) { _selectedPlace = null; _geocode(val); }
    }
  });

  container.querySelectorAll('.precision-btn').forEach(btn => {
    btn.onclick = () => {
      _precision = btn.dataset.precision;
      container.querySelectorAll('.precision-btn').forEach(b => {
        b.classList.toggle('on', b.dataset.precision === _precision);
        b.innerHTML = (b.dataset.precision === _precision
          ? '<svg class="ico sm" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
          : '') + b.dataset.precision;
      });
    };
  });

  document.getElementById('placer-skip-place').onclick = () => _finish(null);
  document.getElementById('placer-confirm-place').onclick = () => {
    if (_marker) {
      const ll = _marker.getLatLng();
      const label = document.getElementById('place-search-input').value.trim() || 'Pinned on the map';
      _finish({ label, lat: ll.lat, lng: ll.lng, precision: _precision });
    }
  };

  _initMap();
}

function _renderPlaceSuggestions() {
  return `
    <div class="place-suggestions" style="margin-top:14px">
      ${_detectedPlaces.slice(0, 4).map((p, i) => `
        <div class="card place-suggestion" data-idx="${i}">
          <div class="place-suggestion-check">
            <svg class="ico sm" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          </div>
          <div class="place-suggestion-heard">
            <svg class="ico sm" viewBox="0 0 24 24"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16v4M16.5 18h4"/></svg>
            Heard
          </div>
          <div class="place-suggestion-name">${_esc(p.name)}</div>
          <div class="place-suggestion-quote">"${_esc(p.quote)}"</div>
        </div>
      `).join('')}
    </div>
  `;
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
  _map.on('click', e => { _pinFromSearch = false; _setPin([e.latlng.lat, e.latlng.lng], null); });
  setTimeout(() => _map && _map.invalidateSize(), 0);
}

// Put the pin at a spot. A zoom level also moves the map there.
function _setPin(ll, zoom) {
  if (!_map) return;
  if (_marker) _marker.setLatLng(ll);
  else {
    _marker = L.marker(ll, { draggable: true }).addTo(_map);
    _marker.on('dragend', () => { _pinFromSearch = false; });
  }
  if (zoom != null) _map.setView(ll, zoom);
  document.getElementById('placer-map-hint').style.display = 'block';
  document.getElementById('placer-map-tip').style.display = 'none';
  document.getElementById('precision-section').style.display = 'block';
  document.getElementById('placer-confirm-place').disabled = false;
}

function _setStatus(msg, isError = false) {
  const el = document.getElementById('place-search-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('is-error', !!isError);
}

// How far to zoom in for each kind of match.
function _zoomFor(r) {
  const t = r.addresstype || r.type || '';
  if (/country/.test(t)) return 5;
  if (/state|region|province/.test(t)) return 7;
  if (/county/.test(t)) return 10;
  if (/city|town|municipality/.test(t)) return 12;
  if (/village|hamlet|suburb|neighbourhood|quarter/.test(t)) return 14;
  return 16;
}

async function _lookup(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('lookup failed: ' + res.status);
  return res.json();
}

let _searchSeq = 0;           // only the newest search may update the screen
let _pinFromSearch = false;   // false once the pin was placed or moved by hand

async function _geocode(query) {
  _initMap();
  const seq     = ++_searchSeq;
  const btn     = document.getElementById('place-search-btn');
  const input   = document.getElementById('place-search-input');
  const results = document.getElementById('place-results');
  if (!btn || !input || !results) return;
  results.style.display = 'none';
  results.innerHTML = '';
  btn.disabled = true;
  btn.textContent = 'Searching…';
  _setStatus(`Looking for “${query}”…`);

  try {
    // Spoken place names often carry an extra word or two ("Grand Rapids
    // Michigan with"). If nothing matches, drop words off the end and retry.
    const words = query.split(/\s+/);
    let data = [], used = query;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 1100));   // the lookup service allows one request a second
      if (seq !== _searchSeq) return;
      data = await _lookup(used);
      if (seq !== _searchSeq) return;
      if (data.length || words.length < 2) break;
      words.pop();
      used = words.join(' ').replace(/,$/, '');
    }

    if (!data.length) {
      // A pin left over from an earlier search belongs to a different place.
      // A pin the user put down by hand stays, and takes the typed name.
      if (_marker && _pinFromSearch) {
        _map.removeLayer(_marker);
        _marker = null;
        document.getElementById('placer-confirm-place').disabled = true;
        document.getElementById('precision-section').style.display = 'none';
        document.getElementById('placer-map-hint').style.display = 'none';
        document.getElementById('placer-map-tip').style.display = '';
      }
      _setStatus(`We couldn’t find “${query}”. Try the town and state, like “Dayton, Ohio”, or tap the map to place the pin yourself.`, true);
      return;
    }

    if (used !== query) input.value = used;
    const pick = (r) => {
      _pinFromSearch = true;
      _setPin([parseFloat(r.lat), parseFloat(r.lon)], _zoomFor(r));
      _setStatus(`Found: ${r.display_name}`);
      results.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.place === String(r.place_id)));
    };
    if (data.length > 1) {
      results.innerHTML = '<div class="t-label" style="margin-bottom:6px">More than one match. Which one?</div>' +
        data.map(r => `<button type="button" data-place="${_esc(r.place_id)}">${_esc(r.display_name)}</button>`).join('');
      results.style.display = '';
      results.querySelectorAll('button').forEach((b, i) => { b.onclick = () => pick(data[i]); });
    }
    pick(data[0]);
  } catch (err) {
    if (seq === _searchSeq) {
      _setStatus('The search didn’t go through. Check your connection and try again, or tap the map to place the pin yourself.', true);
    }
  } finally {
    if (seq === _searchSeq) { btn.disabled = false; btn.textContent = 'Search'; }
  }
}

function _finish(place) {
  // Start from the stored copy: reorderStory() changed orderIndex there, and
  // saving our in-memory copy would put the story back at the end.
  _story = {
    ...(getStoryById(_story.id) || _story),
    place,
    placeQuote: place ? (_selectedPlace?.quote || null) : null,
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

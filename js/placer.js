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
          ? 'Places we heard in the story. Pick one, then move the pin if needed.'
          : 'Type a place name and we\'ll find it on the map.'}
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

      <div id="placer-map" class="map-area card" style="height:236px;margin-top:14px;border-radius:18px;display:none"></div>
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

    <div class="row gap12" style="position:fixed;left:24px;right:24px;bottom:22px">
      <button class="btn btn-secondary" id="placer-add-place" style="padding:0 16px;display:none">
        <svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        Add place
      </button>
      <button class="btn btn-secondary grow" id="placer-skip-place">Skip — no place</button>
      <button class="btn btn-primary grow" id="placer-confirm-place" disabled>Confirm place</button>
    </div>
  `;

  // Wire suggestions
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

    // Auto-select and geocode the first detected place immediately
    const firstCard = container.querySelector('.place-suggestion');
    if (firstCard) {
      firstCard.classList.add('selected');
      _selectedPlace = _detectedPlaces[0];
      document.getElementById('place-search-input').value = _selectedPlace.name;
      _geocode(_selectedPlace.name);
    }
  }

  document.getElementById('placer2-back').onclick = () => {
    if (_sorted.length > 0) { _step = 1; _initBinarySearch(); _renderStep1(); }
    else _finish(null);
  };
  document.getElementById('place-search-btn').onclick = () => {
    const val = document.getElementById('place-search-input').value.trim();
    if (val) _geocode(val);
  };
  document.getElementById('place-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val) _geocode(val);
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
      _finish({ label: document.getElementById('place-search-input').value.trim(), lat: ll.lat, lng: ll.lng, precision: _precision });
    }
  };
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

async function _geocode(query) {
  const mapEl = document.getElementById('placer-map');
  if (!mapEl) return;
  mapEl.style.display = 'block';
  document.getElementById('placer-map-hint').style.display = 'block';
  document.getElementById('precision-section').style.display = 'block';

  // Init map if needed
  if (!_map) {
    _map = L.map('placer-map', { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(_map);
    L.control.zoom({ position: 'bottomright' }).addTo(_map);
  }

  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
      headers: { 'Accept-Language': 'en' },
    });
    const data = await res.json();
    if (!data.length) { _showToast('Place not found — try a different name.'); return; }

    const { lat, lon, display_name } = data[0];
    const ll = [parseFloat(lat), parseFloat(lon)];

    if (_marker) _marker.setLatLng(ll);
    else {
      _marker = L.marker(ll, { draggable: true }).addTo(_map);
      _marker.on('dragend', () => {
        document.getElementById('placer-confirm-place').disabled = false;
      });
    }
    _map.setView(ll, 15);
    _selectedPlace = { name: display_name, quote: '' };
    document.getElementById('placer-confirm-place').disabled = false;
    document.getElementById('placer-add-place').style.display = 'inline-flex';
  } catch (err) {
    _showToast('Could not search — check your connection.');
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

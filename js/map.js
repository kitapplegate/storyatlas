/**
 * Story Atlas — Map
 * Leaflet map for the home atlas preview and the listen screen.
 * Styled toward the atlas palette (sepia tiles, rust pins).
 */

import { getStoriesSorted, formatDuration } from './storage.js';

let _atlasMap  = null;   // home page mini-map
let _listenMap = null;   // listen page full map
const _pins    = {};     // id → L.marker

// ── Custom pin icon ──────────────────────────────────────────────

function makePinIcon(active = false) {
  const color  = active ? '#a4502c' : '#56697a';
  const ring   = active ? 'rgba(164,80,44,.22)' : 'transparent';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="38" viewBox="-16 -34 32 38">
    <circle cx="0" cy="-34" r="18" fill="${ring}"/>
    <path d="M0 0 C-4 -8 -12 -14 -12 -22 A12 12 0 1 1 12 -22 C12 -14 4 -8 0 0Z"
      fill="${color}" stroke="${active ? '#86401f' : '#3f5162'}" stroke-width="1"/>
    <circle cx="0" cy="-22" r="4.5" fill="white" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg, className: '', iconSize: [32, 38], iconAnchor: [16, 0],
  });
}

// ── Home mini-map ────────────────────────────────────────────────

export function initHomeMap(containerId) {
  const el = document.getElementById(containerId);
  if (!el || _atlasMap) return;

  _atlasMap = L.map(containerId, {
    zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    touchZoom: false,
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(_atlasMap);
  refreshHomePins();
}

export function refreshHomePins() {
  if (!_atlasMap) return;
  const stories = getStoriesSorted().filter(s => s.place);
  if (!stories.length) return;

  stories.forEach(s => {
    if (!_pins[s.id + '_home']) {
      const m = L.marker([s.place.lat, s.place.lng], { icon: makePinIcon(false) }).addTo(_atlasMap);
      _pins[s.id + '_home'] = m;
    }
  });

  const lls = stories.map(s => [s.place.lat, s.place.lng]);
  if (lls.length === 1) _atlasMap.setView(lls[0], 12);
  else _atlasMap.fitBounds(lls, { padding: [16, 16] });
}

// ── Listen map ───────────────────────────────────────────────────

export function initListenMap(containerId) {
  const el = document.getElementById(containerId);
  if (!el || _listenMap) return;

  _listenMap = L.map(containerId, {
    zoomControl: false, attributionControl: false,
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(_listenMap);
  L.control.zoom({ position: 'bottomright' }).addTo(_listenMap);
  return _listenMap;
}

/** Place all story pins on the listen map. */
export function renderListenPins(stories, activeId, onPinClick) {
  if (!_listenMap) return;

  // Clear old pins
  Object.values(_pins).forEach(m => {
    if (m._map === _listenMap) _listenMap.removeLayer(m);
  });

  stories.filter(s => s.place).forEach(s => {
    const active = s.id === activeId;
    const marker = L.marker([s.place.lat, s.place.lng], { icon: makePinIcon(active) }).addTo(_listenMap);
    if (onPinClick) marker.on('click', () => onPinClick(s));
    _pins[s.id + '_listen'] = marker;
  });
}

/** Fly to a story's pin. */
export function flyToStory(story, zoom = 14) {
  if (!_listenMap || !story.place) return;
  _listenMap.flyTo([story.place.lat, story.place.lng], zoom, { duration: 1.2 });
}

/** Add a single new pin (after placer completes). */
export function addListenPin(story, onPinClick) {
  if (!_listenMap || !story.place) return;
  if (_pins[story.id + '_listen']) _listenMap.removeLayer(_pins[story.id + '_listen']);
  const marker = L.marker([story.place.lat, story.place.lng], { icon: makePinIcon(false) }).addTo(_listenMap);
  if (onPinClick) marker.on('click', () => onPinClick(story));
  _pins[story.id + '_listen'] = marker;
}

/** Fit the listen map to show all pins. */
export function fitAllListenPins() {
  if (!_listenMap) return;
  const lls = Object.values(_pins)
    .filter(m => m._map === _listenMap)
    .map(m => m.getLatLng());
  if (lls.length > 0) _listenMap.fitBounds(lls, { padding: [40, 40] });
}

export function destroyListenMap() {
  if (_listenMap) {
    _listenMap.remove();
    _listenMap = null;
    Object.keys(_pins).forEach(k => { if (k.endsWith('_listen')) delete _pins[k]; });
  }
}

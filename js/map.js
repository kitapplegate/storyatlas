/**
 * StoryAtlas — Map
 *
 * Leaflet + OpenStreetMap Nominatim geocoding.
 * Two modes: armchair (browse) and walking (proximity alerts via Geolocation API).
 */

let _map = null;
let _markers = {};
let _walkingWatch = null;
let _walkingCallback = null;

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const PROXIMITY_METRES = 200;

// ── Init ──────────────────────────────────────────────────────────────────────

function initMap(containerId) {
  if (_map) return _map;
  _map = L.map(containerId, { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(_map);
  return _map;
}

function getMap() { return _map; }

// ── Geocoding ─────────────────────────────────────────────────────────────────

/**
 * Geocode a place string using Nominatim.
 * Returns { lat, lng, displayName } or null.
 */
async function geocode(query) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// ── Markers ───────────────────────────────────────────────────────────────────

const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="14" cy="36" rx="5" ry="2" fill="rgba(0,0,0,0.2)"/>
    <path d="M14 0C8.48 0 4 4.48 4 10c0 7.5 10 26 10 26S24 17.5 24 10C24 4.48 19.52 0 14 0z" fill="#5c6bc0"/>
    <circle cx="14" cy="10" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -38],
});

/**
 * Add or update a map pin for a chunk.
 * @param {object} chunk - full chunk with place: { label, lat, lng }
 * @param {function} onOpen - called with chunkId when popup opens
 */
function pinChunk(chunk, onOpen) {
  if (!_map || !chunk.place || !chunk.place.lat) return;
  const { lat, lng, label } = chunk.place;

  // Remove old marker for this chunk if it exists
  if (_markers[chunk.id]) {
    _map.removeLayer(_markers[chunk.id]);
  }

  const marker = L.marker([lat, lng], { icon: pinIcon }).addTo(_map);
  const popupHtml = `
    <div class="popup-title">${escHtml(chunk.title || 'Untitled')}</div>
    <div class="popup-body">${escHtml((chunk.cleaned || chunk.raw || '').slice(0, 200))}${(chunk.cleaned || chunk.raw || '').length > 200 ? '…' : ''}</div>
    <div style="margin-top:8px; font-size:12px; color:#666">📍 ${escHtml(label || '')}</div>
  `;
  marker.bindPopup(popupHtml, { maxWidth: 280 });
  if (onOpen) marker.on('popupopen', () => onOpen(chunk.id));
  _markers[chunk.id] = marker;
}

function removePin(chunkId) {
  if (_markers[chunkId]) {
    _map.removeLayer(_markers[chunkId]);
    delete _markers[chunkId];
  }
}

function flyToChunk(chunk) {
  if (!_map || !chunk.place) return;
  _map.flyTo([chunk.place.lat, chunk.place.lng], 13, { duration: 1.2 });
  if (_markers[chunk.id]) _markers[chunk.id].openPopup();
}

function fitAllPins() {
  const pins = Object.values(_markers);
  if (!pins.length) return;
  if (pins.length === 1) {
    _map.setView(pins[0].getLatLng(), 10);
  } else {
    const group = L.featureGroup(pins);
    _map.fitBounds(group.getBounds().pad(0.15));
  }
}

// ── Walking mode ──────────────────────────────────────────────────────────────

/**
 * Start watching the user's position; call cb(nearbyChunks) when within PROXIMITY_METRES.
 */
function startWalking(chunks, cb) {
  _walkingCallback = cb;
  if (!navigator.geolocation) {
    cb(null, 'Geolocation is not supported by your browser.');
    return;
  }
  _walkingWatch = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const nearby = chunks.filter(c => {
        if (!c.place || !c.place.lat) return false;
        return haversineMetres(latitude, longitude, c.place.lat, c.place.lng) <= PROXIMITY_METRES;
      });
      if (nearby.length) cb(nearby);
    },
    (err) => cb(null, err.message),
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
}

function stopWalking() {
  if (_walkingWatch !== null) {
    navigator.geolocation.clearWatch(_walkingWatch);
    _walkingWatch = null;
  }
  _walkingCallback = null;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function haversineMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toRad(deg) { return deg * Math.PI / 180; }

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export { initMap, getMap, geocode, pinChunk, removePin, flyToChunk, fitAllPins, startWalking, stopWalking };

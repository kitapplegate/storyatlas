/**
 * Story Atlas — Geocode
 * Turns a spoken place name into a spot on the map.
 *
 * Two public OpenStreetMap-based services are used:
 *   - Nominatim: exact. Best for towns and street addresses.
 *   - Photon:    forgiving of spelling. Speech recognition mishears names
 *                ("Sanger Ridge" for "Sangre Ridge"), and Photon can still
 *                find them when it knows roughly where to look.
 *
 * Only place names (never audio or transcripts) are sent.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const PHOTON    = 'https://photon.komoot.io/api/';
const NEAR_KM   = 250;   // a spelling-tolerant match must be this close to a known place

// Kinds of result that are an area rather than a particular spot.
const AREA_KINDS = /^(country|state|region|province|county|city|town|municipality|village|hamlet|suburb|neighbourhood|quarter|district|borough|locality)$/;

let _lastNominatim = 0;
const _sleep = ms => new Promise(r => setTimeout(r, ms));

/** Distance between two { lat, lng } points in kilometres. */
export function distanceKm(a, b) {
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** How far to zoom the map in for a kind of place. */
export function zoomFor(kind) {
  if (/country/.test(kind)) return 5;
  if (/state|region|province/.test(kind)) return 7;
  if (/county/.test(kind)) return 10;
  if (/city|town|municipality/.test(kind)) return 12;
  if (/village|hamlet|suburb|neighbourhood|quarter|district|borough|locality/.test(kind)) return 14;
  return 16;
}

/** Pin precision label for a kind of place. */
export function precisionFor(kind) {
  if (AREA_KINDS.test(kind)) return /suburb|neighbourhood|quarter|district|borough/.test(kind) ? 'Neighborhood' : 'Town';
  return /road|street|residential|highway/.test(kind) ? 'Street' : 'Exact spot';
}

export const isArea = kind => AREA_KINDS.test(kind || '');

/** Exact lookup. Returns [{ lat, lng, label, kind }]. Waits its turn: one request a second. */
export async function searchExact(query) {
  const wait = _lastNominatim + 1100 - Date.now();
  if (wait > 0) await _sleep(wait);
  _lastNominatim = Date.now();
  const res = await fetch(`${NOMINATIM}?format=json&limit=5&q=${encodeURIComponent(query)}`, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error('lookup failed: ' + res.status);
  return (await res.json()).map(r => ({
    lat: parseFloat(r.lat), lng: parseFloat(r.lon),
    label: r.display_name, kind: r.addresstype || r.type || '',
  }));
}

/** Spelling-tolerant lookup, leaning toward `near` when given. Same result shape. */
export async function searchFuzzy(query, near) {
  let url = `${PHOTON}?limit=5&lang=en&q=${encodeURIComponent(query)}`;
  if (near) url += `&lat=${near.lat}&lon=${near.lng}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('lookup failed: ' + res.status);
  const data = await res.json();
  return (data.features || []).map(f => {
    const p = f.properties || {};
    const parts = [p.name, p.street && p.street !== p.name ? p.street : null, p.city || p.county, p.state, p.country];
    return {
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
      label: [...new Set(parts.filter(Boolean))].join(', '),
      kind: p.type === 'house' ? (p.osm_value || 'house') : (p.type || p.osm_value || ''),
    };
  });
}

/** Closest results first, when there is somewhere to measure from. */
function _byDistance(results, near) {
  if (!near) return results;
  return [...results].sort((a, b) => distanceKm(a, near) - distanceKm(b, near));
}

/**
 * Find one place by name.
 * @param {string} query
 * @param {{lat:number,lng:number}|null} near  a spot the place is probably close to
 * @returns {{ results: object[], sure: boolean, used: string }}
 *   `sure` is false when the only matches came from the spelling-tolerant
 *   search with nothing nearby to check them against.
 */
export async function findPlace(query, near = null, { skipExact = false } = {}) {
  query = query.trim();
  let failures = 0;   // both services failing is an error; one failing is not
  // 1. Exact, then exact with trailing words dropped ("Grand Rapids Michigan with").
  const words = query.split(/\s+/);
  let used = query;
  for (let attempt = 0; attempt < 3; attempt++) {
    // (skipExact: the caller already tried the full name and got nothing.)
    const hits = attempt === 0 && skipExact ? [] : await searchExact(used).catch(() => { failures++; return []; });
    if (hits.length) return { results: _byDistance(hits, near), sure: true, used };
    if (attempt === 0) {
      // 2. Before trimming, let the forgiving search try the full name.
      const fuzzy = await searchFuzzy(query, near).catch(() => { failures++; return []; });
      if (fuzzy.length) {
        if (!near) return { results: fuzzy, sure: false, used: query };
        const close = _byDistance(fuzzy, near).filter(r => distanceKm(r, near) <= NEAR_KM);
        if (close.length) return { results: close, sure: true, used: query };
      }
    }
    if (words.length < 2) break;
    words.pop();
    used = words.join(' ').replace(/,$/, '');
  }
  if (failures >= 2) throw new Error('place lookup unavailable');
  return { results: [], sure: false, used: query };
}

/**
 * Pick the best pin for a story from the places heard in it.
 * Towns found along the way tell us where to look for the harder names.
 *
 * @param {string[]} names      place names heard, in the order spoken
 * @param {{lat,lng}|null} near where this storyteller's other stories are
 * @returns {null | { name, place, sure, alternatives }}
 */
export async function autoPlace(names, near = null) {
  names = names.slice(0, 3);
  if (!names.length) return null;

  // First pass: exact lookups. Areas (towns, states) become anchors.
  const exact = [];
  for (const name of names) {
    const hits = await searchExact(name).catch(() => []);
    exact.push(hits);
  }
  let anchor = near;
  for (const hits of exact) {
    const area = _byDistance(hits, near).find(h => isArea(h.kind));
    if (area) { anchor = area; break; }
  }

  // Second pass: resolve each name, most particular place wins.
  let best = null;
  for (let i = 0; i < names.length; i++) {
    let results = _byDistance(exact[i], anchor), sure = results.length > 0;
    if (!results.length) {
      const found = await findPlace(names[i], anchor, { skipExact: true }).catch(() => ({ results: [], sure: false }));
      results = found.results; sure = found.sure;
    }
    // A particular place (a school, a street) that turned up far from where
    // the story is set is probably a different one with the same name.
    if (results.length && anchor && !isArea(results[0].kind) && distanceKm(results[0], anchor) > NEAR_KM) {
      const local = (await searchFuzzy(names[i], anchor).catch(() => []))
        .filter(r => distanceKm(r, anchor) <= NEAR_KM);
      if (local.length) { results = _byDistance(local, anchor); sure = true; }
      else sure = false;
    }
    if (!results.length) continue;
    const cand = { name: names[i], place: results[0], sure, alternatives: results.slice(1, 5) };
    const score = (sure ? 2 : 0) + (isArea(results[0].kind) ? 0 : 1);
    if (!best || score > best.score) best = { ...cand, score };
  }
  if (!best) return null;
  const { score, ...out } = best;
  return out;
}

/**
 * Story Atlas — Pure helper functions for testing.
 * These are extracted/re-exported from their source modules so tests can
 * import them without needing browser APIs (localStorage, IndexedDB, DOM).
 */

// ── From storage.js ──────────────────────────────────────────────

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function formatDuration(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function assignEra(story, totalStories) {
  if (story.ageAtEvent != null) {
    const age = story.ageAtEvent;
    if (age < 18) return 'Childhood';
    if (age < 30) return 'Youth';
    if (age < 55) return 'Work';
    return 'Later';
  }
  if (totalStories < 2) return null;
  const pct = story.orderIndex / (totalStories - 1);
  if (pct < 0.2) return 'Childhood';
  if (pct < 0.4) return 'Youth';
  if (pct < 0.6) return 'Work';
  if (pct < 0.8) return 'Family';
  return 'Later';
}

/** Sort stories by orderIndex ascending (life order). */
export function sortByLifeOrder(stories) {
  return [...stories].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/** Sort stories by createdAt descending (newest first). */
export function sortByCreatedAt(stories) {
  return [...stories].sort((a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
}

// ── From transcriber.js ──────────────────────────────────────────

export function splitIntoLines(text) {
  if (!text) return [];
  text = text.replace(/\b(uh|um|er|hmm|hm),?\s*/gi, '');
  text = text.replace(/\s{2,}/g, ' ').trim();
  if (!text) return [];
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!/[.!?]$/.test(text)) text += '.';
  text = text.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map(s => s.trim()).filter(Boolean);
}

export function detectPlaces(text) {
  if (!text) return [];
  const places = [];
  const seen = new Set();

  const stopWords = new Set(['i','we','they','he','she','the','a','an','my','our','his','her','their',
    'this','that','it','which','what','there','here','some','any','all','just','then','when','very']);

  function addMatch(raw, contextStart, contextEnd) {
    const words = raw.trim().split(/\s+/);
    if (words.every(w => stopWords.has(w.toLowerCase()) || w.length < 2)) return;
    const name = words.map(w => /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    const key  = name.toLowerCase();
    if (key.length < 3 || seen.has(key)) return;
    seen.add(key);
    const start = Math.max(0, contextStart - 10);
    const end   = Math.min(text.length, contextEnd + 20);
    places.push({ name, quote: text.slice(start, end).trim() });
  }

  const wordPattern = /\b(?:in|at|near|outside|around|from|to|by|through|across)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})/gi;
  let m;
  while ((m = wordPattern.exec(text)) !== null) {
    addMatch(m[1], m.index, m.index + m[0].length);
  }

  const streetSuffixes = 'street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|place|pl|court|ct|circle|cir|highway|hwy';
  const addrPattern = new RegExp(
    `\\b(?:at|on|from|near)\\s+(\\d+\\s+[a-zA-Z]+(?:\\s+[a-zA-Z]+){0,2}\\s+(?:${streetSuffixes})(?:[,.]?\\s+[a-zA-Z]+(?:\\s+[a-zA-Z]+){0,2})?)`,
    'gi'
  );
  while ((m = addrPattern.exec(text)) !== null) {
    addMatch(m[1], m.index, m.index + m[0].length);
  }

  return places;
}

// ── From backup.js ───────────────────────────────────────────────

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateStory(s) {
  if (!s || typeof s !== 'object') return false;
  if (typeof s.id !== 'string' || !ID_RE.test(s.id)) return false;
  if (s.title !== undefined && typeof s.title !== 'string') return false;
  if (s.duration !== undefined && typeof s.duration !== 'number') return false;
  if (s.place != null) {
    if (typeof s.place !== 'object') return false;
    const { lat, lng } = s.place;
    if (lat != null && (typeof lat !== 'number' || lat < -90  || lat > 90))  return false;
    if (lng != null && (typeof lng !== 'number' || lng < -180 || lng > 180)) return false;
  }
  if (s.transcriptLines !== undefined && !Array.isArray(s.transcriptLines)) return false;
  return true;
}

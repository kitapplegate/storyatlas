/**
 * Story Atlas — Storage v2
 * Audio-first data model. Each profile's data sits in localStorage under its own
 * key (the first profile uses 'storyatlas_v2'); 'storyatlas_profiles' is the index.
 *
 * Data shape:
 *   { storyteller: { name, dob }, stories: Story[] }
 *
 * Story shape:
 *   {
 *     id: string,
 *     title: string,
 *     audioDataUrl: string|null,   // legacy only — audio now lives in IndexedDB (audiostore.js)
 *     duration: number,            // seconds
 *     transcriptStatus: 'pending'|'transcribing'|'done'|'failed',
 *     transcriptLines: string[],   // sentences from transcription
 *     place: { label, lat, lng, precision } | null,
 *     placeQuote: string|null,     // snippet that triggered the place suggestion
 *     era: string|null,            // 'Childhood'|'Youth'|'Work'|'Family'|'Later'
 *     ageAtEvent: number|null,
 *     orderIndex: number,
 *     createdAt: ISO string,
 *     uploadStatus: 'local'|'uploaded',  // for future Firebase sync
 *   }
 */

import { putAudio, deleteAudio } from './audiostore.js';

const STORAGE_KEY  = 'storyatlas_v2';          // legacy single-atlas key (first profile keeps it)
const PROFILES_KEY = 'storyatlas_profiles';

// ── Profiles ─────────────────────────────────────────────────────
// A profile is one atlas on this device. Index shape:
//   { activeId: string|null, profiles: [{ id, name, key, createdAt }] }
// Each profile's stories live under its own localStorage `key`.

function _readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function _loadProfileIndex() {
  const idx = _readJson(PROFILES_KEY);
  if (idx && Array.isArray(idx.profiles)) return idx;
  // First run with profiles: adopt the existing single atlas, if there is one.
  const fresh  = { activeId: null, profiles: [] };
  const legacy = _readJson(STORAGE_KEY);
  if (legacy && (legacy.storyteller?.name || legacy.stories?.length)) {
    fresh.profiles.push({
      id: generateId(),
      name: legacy.storyteller?.name || 'My atlas',
      key: STORAGE_KEY,
      createdAt: new Date().toISOString(),
    });
    _saveProfileIndex(fresh);
  }
  return fresh;
}

function _saveProfileIndex(idx) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(idx)); return true; }
  catch (e) { console.warn('StoryAtlas: could not save profiles', e); return false; }
}

function _activeKey() {
  const idx = _loadProfileIndex();
  const p   = idx.profiles.find(x => x.id === idx.activeId);
  return p ? p.key : STORAGE_KEY;
}

/** Profiles on this device, with a display name and story count each. */
function getProfiles() {
  return _loadProfileIndex().profiles.map(p => {
    const data = _readJson(p.key);
    return {
      id: p.id,
      name: data?.storyteller?.name || p.name,
      storyCount: data?.stories?.length || 0,
    };
  });
}

function getActiveProfileId() {
  const idx = _loadProfileIndex();
  return idx.profiles.some(p => p.id === idx.activeId) ? idx.activeId : null;
}

/** Pass null to sign out. */
function setActiveProfile(id) {
  const idx = _loadProfileIndex();
  idx.activeId = idx.profiles.some(p => p.id === id) ? id : null;
  _saveProfileIndex(idx);
}

/** Create a profile, make it active, and return its id (null if it didn't save). */
function createProfile(name) {
  const idx = _loadProfileIndex();
  const id  = generateId();
  // The legacy key is free only if no profile already owns it.
  const key = idx.profiles.length === 0 && !_readJson(STORAGE_KEY) ? STORAGE_KEY : `${STORAGE_KEY}:${id}`;
  idx.profiles.push({ id, name, key, createdAt: new Date().toISOString() });
  idx.activeId = id;
  if (!_saveProfileIndex(idx)) return null;
  saveData({ storyteller: { name, dob: '' }, stories: [] });
  return id;
}

function loadData() {
  try {
    const raw = localStorage.getItem(_activeKey());
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted — fall through */ }
  return { storyteller: { name: '', dob: '' }, stories: [] };
}

/** Returns false if the browser refused the write (storage full or blocked). */
function saveData(data) {
  try {
    localStorage.setItem(_activeKey(), JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('StoryAtlas: could not save', e);
    return false;
  }
}

// ── Stories ──────────────────────────────────────────────────────

function getAllStories() {
  return loadData().stories;
}

function getStoryById(id) {
  return loadData().stories.find(s => s.id === id) || null;
}

/** Upsert a story. New stories get orderIndex = max + 1. Returns false if it didn't save. */
function saveStory(story) {
  const data = loadData();
  const idx = data.stories.findIndex(s => s.id === story.id);
  if (idx >= 0) {
    data.stories[idx] = story;
  } else {
    const maxOrder = data.stories.reduce((m, s) => Math.max(m, s.orderIndex ?? 0), -1);
    story.orderIndex = maxOrder + 1;
    data.stories.push(story);
  }
  return saveData(data);
}

function deleteStory(id) {
  const data = loadData();
  data.stories = data.stories.filter(s => s.id !== id);
  saveData(data);
  deleteAudio(id).catch(() => {});
}

/**
 * Move recordings saved before 2026-10-30 (base64 in localStorage) into
 * IndexedDB. A story keeps its audioDataUrl until its blob is safely stored.
 * Returns how many were moved.
 */
async function migrateAudioToIndexedDB() {
  const legacy = getAllStories().filter(s => s.audioDataUrl);
  let moved = 0;
  for (const s of legacy) {
    try {
      const blob = await (await fetch(s.audioDataUrl)).blob();
      await putAudio(s.id, blob);
      const data  = loadData();
      const story = data.stories.find(x => x.id === s.id);
      if (story) { story.audioDataUrl = null; story.hasAudio = true; }
      if (saveData(data)) moved++;
    } catch (e) {
      console.warn('StoryAtlas: could not move audio for', s.id, e);
    }
  }
  return moved;
}

/** Returns stories sorted by orderIndex ascending. */
function getStoriesSorted() {
  return [...getAllStories()].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/**
 * Insert `id` before or after `refId` in the life order.
 * relation: 'before' | 'after'
 */
function reorderStory(id, refId, relation) {
  const data = loadData();
  const stories = [...data.stories].sort((a, b) => a.orderIndex - b.orderIndex);
  const movingIdx = stories.findIndex(s => s.id === id);
  const refIdx    = stories.findIndex(s => s.id === refId);
  if (movingIdx < 0 || refIdx < 0 || movingIdx === refIdx) return;

  const [moving] = stories.splice(movingIdx, 1);
  const insertAt = relation === 'before' ? refIdx : refIdx + 1;
  stories.splice(Math.max(0, insertAt > movingIdx ? insertAt - 1 : insertAt), 0, moving);
  stories.forEach((s, i) => { s.orderIndex = i; });
  data.stories = stories;
  saveData(data);
}

// ── Storyteller ──────────────────────────────────────────────────

function getStoryteller() {
  return loadData().storyteller;
}

function saveStoryteller(info) {
  const data = loadData();
  data.storyteller = { ...data.storyteller, ...info };
  saveData(data);
}

// ── Helpers ──────────────────────────────────────────────────────

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Format seconds as m:ss */
function formatDuration(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Assign an era label from ageAtEvent or orderIndex heuristic.
 * Eras: Childhood (0-17), Youth (18-29), Work (30-49), Family (30-55), Later (55+)
 * Falls back to position in life order if age unknown.
 */
function assignEra(story, totalStories) {
  if (story.ageAtEvent != null) {
    const age = story.ageAtEvent;
    if (age < 18) return 'Childhood';
    if (age < 30) return 'Youth';
    if (age < 55) return 'Work';
    return 'Later';
  }
  // Fallback: divide life order into 5 buckets
  if (totalStories < 2) return null;
  const pct = story.orderIndex / (totalStories - 1);
  if (pct < 0.2) return 'Childhood';
  if (pct < 0.4) return 'Youth';
  if (pct < 0.6) return 'Work';
  if (pct < 0.8) return 'Family';
  return 'Later';
}

export {
  loadData, saveData,
  getAllStories, getStoryById, saveStory, deleteStory,
  getStoriesSorted, reorderStory, migrateAudioToIndexedDB,
  getStoryteller, saveStoryteller,
  getProfiles, getActiveProfileId, setActiveProfile, createProfile,
  generateId, formatDuration, assignEra,
};

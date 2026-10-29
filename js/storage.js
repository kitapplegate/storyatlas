/**
 * Story Atlas — Storage v2
 * Audio-first data model. All data in localStorage under 'storyatlas_v2'.
 *
 * Data shape:
 *   { storyteller: { name, dob }, stories: Story[] }
 *
 * Story shape:
 *   {
 *     id: string,
 *     title: string,
 *     audioDataUrl: string|null,   // base64 data URL of the recording
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

const STORAGE_KEY = 'storyatlas_v2';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted — fall through */ }
  return { storyteller: { name: '', dob: '' }, stories: [] };
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage full (likely a large audio blob)
    console.warn('StoryAtlas: storage quota exceeded', e);
  }
}

// ── Stories ──────────────────────────────────────────────────────

function getAllStories() {
  return loadData().stories;
}

function getStoryById(id) {
  return loadData().stories.find(s => s.id === id) || null;
}

/** Upsert a story. New stories get orderIndex = max + 1. */
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
  saveData(data);
}

function deleteStory(id) {
  const data = loadData();
  data.stories = data.stories.filter(s => s.id !== id);
  saveData(data);
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
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
  getStoriesSorted, reorderStory,
  getStoryteller, saveStoryteller,
  generateId, formatDuration, assignEra,
};

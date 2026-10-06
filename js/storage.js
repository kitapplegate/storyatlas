/**
 * StoryAtlas — Storage
 * All data lives in localStorage under the key 'storyatlas_v1'.
 * Data shape:
 *   { storyteller: { name, dob }, chunks: Chunk[] }
 *
 * Chunk shape:
 *   { id, title, raw, cleaned, place: { label, lat, lng }|null,
 *     era: string|null, orderIndex: number, createdAt: ISO,
 *     photo: dataURL|null, complete: boolean }
 */

const STORAGE_KEY = 'storyatlas_v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted */ }
  return { storyteller: { name: 'My Story', dob: '' }, chunks: [] };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Chunks ───────────────────────────────────────────────────────────────────

function getAllChunks() {
  return loadData().chunks;
}

function getChunkById(id) {
  return loadData().chunks.find(c => c.id === id) || null;
}

function saveChunk(chunk) {
  const data = loadData();
  const idx = data.chunks.findIndex(c => c.id === chunk.id);
  if (idx >= 0) {
    data.chunks[idx] = chunk;
  } else {
    // assign orderIndex = max + 1 (will be re-sorted by ordering question)
    const maxOrder = data.chunks.reduce((m, c) => Math.max(m, c.orderIndex ?? 0), -1);
    chunk.orderIndex = maxOrder + 1;
    data.chunks.push(chunk);
  }
  saveData(data);
}

function deleteChunk(id) {
  const data = loadData();
  data.chunks = data.chunks.filter(c => c.id !== id);
  saveData(data);
}

/** Returns chunks sorted by orderIndex ascending */
function getChunksSorted() {
  return [...getAllChunks()].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/**
 * Move chunk with `id` to before OR after the reference chunk.
 * relation: 'before' | 'after'
 */
function reorderChunk(id, refId, relation) {
  const data = loadData();
  const chunks = [...data.chunks].sort((a, b) => a.orderIndex - b.orderIndex);
  const movingIdx = chunks.findIndex(c => c.id === id);
  const refIdx    = chunks.findIndex(c => c.id === refId);
  if (movingIdx < 0 || refIdx < 0 || movingIdx === refIdx) return;

  // Remove the chunk, re-insert at new position
  const [moving] = chunks.splice(movingIdx, 1);
  const insertAt = relation === 'before' ? refIdx : refIdx + 1;
  chunks.splice(Math.max(0, insertAt > movingIdx ? insertAt - 1 : insertAt), 0, moving);

  // Re-assign orderIndex
  chunks.forEach((c, i) => { c.orderIndex = i; });
  data.chunks = chunks;
  saveData(data);
}

// ── Storyteller ──────────────────────────────────────────────────────────────

function getStoryteller() {
  return loadData().storyteller;
}

function saveStoryteller(info) {
  const data = loadData();
  data.storyteller = { ...data.storyteller, ...info };
  saveData(data);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export {
  loadData, saveData,
  getAllChunks, getChunkById, saveChunk, deleteChunk, getChunksSorted, reorderChunk,
  getStoryteller, saveStoryteller,
  generateId
};

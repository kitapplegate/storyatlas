/**
 * Story Atlas — Backup
 * One JSON file with every story and its audio (base64), so a family can keep
 * a copy off the device and restore it in any browser. Restore only adds
 * stories that aren't already here; it never overwrites.
 */

import { getStoriesSorted, getStoryteller, saveStoryteller, saveStory } from './storage.js';
import { getAudio, putAudio, deleteAudio, requestPersistence } from './audiostore.js';

const FORMAT = 'storyatlas-backup';

function _blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Build the backup file and hand it to the browser as a download. Returns the story count. */
export async function downloadBackup() {
  const storyteller = getStoryteller();
  const stories = [];
  for (const s of getStoriesSorted()) {
    let audio = s.audioDataUrl || null;
    if (!audio) {
      const blob = await getAudio(s.id).catch(() => null);
      if (blob) audio = await _blobToDataUrl(blob);
    }
    stories.push({ ...s, audioDataUrl: null, audio });
  }

  const backup = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), storyteller, stories };
  const name   = (storyteller.name || 'stories').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  const date   = new Date().toISOString().slice(0, 10);

  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `story-atlas-${name}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return stories.length;
}

/**
 * Read a backup file and add any stories not already saved here.
 * Returns { added, skipped, failed }. Throws if the file isn't a Story Atlas backup.
 */
// Upper limit for a backup file. A backup is ~29 MB per hour of audio (48 kbps
// plus base64), so 500 MB is roughly 17 hours. Much past that the browser can't
// hold the file as one string anyway.
const MAX_BACKUP_BYTES = 500 * 1024 * 1024;

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function _validateStory(s) {
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

export async function restoreBackup(file) {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('That backup file is too large to restore (limit 500 MB).');
  }

  let backup;
  try { backup = JSON.parse(await file.text()); } catch { backup = null; }
  if (!backup || backup.format !== FORMAT || backup.version !== 1 || !Array.isArray(backup.stories)) {
    throw new Error("That file isn't a Story Atlas backup.");
  }

  const existing = new Set(getStoriesSorted().map(s => s.id));
  let added = 0, skipped = 0, failed = 0;

  // Oldest life-order first, so restored stories keep their order after any already here
  const incoming = [...backup.stories].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  for (const { audio, ...story } of incoming) {
    if (!story.id || existing.has(story.id)) { skipped++; continue; }
    if (!_validateStory(story)) {
      console.warn('StoryAtlas: skipping malformed story', story.id);
      skipped++;
      continue;
    }
    let audioStored = false;
    try {
      if (audio) {
        await putAudio(story.id, await (await fetch(audio)).blob());
        audioStored = true;
      }
      const fresh = { ...story, audioDataUrl: null, hasAudio: audioStored };
      delete fresh.orderIndex;   // saveStory appends it after what's already here
      if (saveStory(fresh)) {
        added++;
      } else {
        // metadata save failed — remove orphaned audio to avoid leaking storage
        if (audioStored) { try { await deleteAudio(story.id); } catch {} }
        failed++;
      }
    } catch (e) {
      console.warn('StoryAtlas: could not restore', story.id, e);
      if (audioStored) { try { await deleteAudio(story.id); } catch {} }
      failed++;
    }
  }

  if (!getStoryteller().name && backup.storyteller?.name) {
    saveStoryteller({ name: backup.storyteller.name });
  }
  if (added) requestPersistence();
  return { added, skipped, failed };
}

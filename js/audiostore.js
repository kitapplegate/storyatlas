/**
 * Story Atlas — Audio store
 * Recordings live in IndexedDB as Blobs, keyed by story id. localStorage only
 * holds the small story metadata — it caps out around 5 MB, which base64 audio
 * filled after roughly 15 minutes of recordings.
 */

const DB_NAME  = 'storyatlas';
const STORE    = 'audio';
let _dbPromise = null;

function _db() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB not available')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    // Let a later call retry instead of caching the failure forever
    _dbPromise.catch(() => { _dbPromise = null; });
  }
  return _dbPromise;
}

function _tx(mode, fn) {
  return _db().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error || new Error('Audio save aborted'));
  }));
}

export function putAudio(id, blob) { return _tx('readwrite', s => s.put(blob, id)); }
export function getAudio(id)       { return _tx('readonly',  s => s.get(id)); }
export function deleteAudio(id)    { return _tx('readwrite', s => s.delete(id)); }

/**
 * Ask the browser not to clear our data under storage pressure (and, on
 * Safari, after 7 days without a visit). Safe to call repeatedly.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch { return false; }
}

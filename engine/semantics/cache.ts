/**
 * Tiny IndexedDB key/value cache. ~50 lines, no dependencies.
 *
 * Used to memoize Wiktionary responses with a TTL so we don't hammer their
 * REST API and don't re-fetch on every reload.
 */

const DB_NAME = 'lyrical-phonetics-cache';
const STORE = 'kv';
const VERSION = 1;

let _db: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _db;
}

type CacheEntry<T> = { value: T; expiresAt: number };

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry) return resolve(null);
        if (entry.expiresAt < Date.now()) return resolve(null);
        resolve(entry.value);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
      tx.objectStore(STORE).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Generic on-disk cache for large Eventor payloads (result lists, split times).
 *
 * The slow part when opening big events (e.g. O-ringen, 12 000+ participants) is
 * downloading the multi-MB XML from Eventor. This cache stores the raw response
 * on disk in the OS cache directory so that re-opening the same event – or
 * switching between the result list and the analysis view – is instant.
 *
 * Design goals:
 * - Two levels: an in-memory map for the current session and a file cache that
 *   survives app restarts.
 * - TTL: entries expire after {@link EVENT_RESULT_CACHE_TTL_MS} so corrected
 *   results are eventually re-fetched.
 * - Size cap: least-recently-used entries are evicted once the cache exceeds
 *   {@link MAX_CACHE_BYTES}.
 * - Best effort: any cache failure silently falls back to the network. The
 *   cache must never throw to its callers.
 * - The files live under `FileSystem.cacheDirectory`, which iOS/Android may also
 *   purge automatically under storage pressure.
 */

/** Default time-to-live for cached result/split-times payloads (24 hours). */
export const EVENT_RESULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Maximum total size of the on-disk cache before LRU eviction kicks in. */
const MAX_CACHE_BYTES = 40 * 1024 * 1024;

/**
 * Never write to the cache if doing so would leave the device with less free
 * disk space than this. This keeps the app from contributing to a full device
 * (which can otherwise make features like Analysis fail on low-storage phones).
 */
const MIN_FREE_DISK_BYTES = 250 * 1024 * 1024;

const CACHE_SUBDIRECTORY = 'eventdata/';
const INDEX_FILE = 'index.json';

type CacheIndexEntry = {
  savedAt: number;
  lastAccessAt: number;
  size: number;
  file: string;
};

type CacheIndex = Record<string, CacheIndexEntry>;

const memoryCache = new Map<string, string>();

let indexCache: CacheIndex | null = null;
let indexLoadPromise: Promise<CacheIndex> | null = null;

function getBaseDirectory() {
  const baseDirectory = FileSystem.cacheDirectory;
  if (!baseDirectory || Platform.OS === 'web') {
    return null;
  }

  return `${baseDirectory}${CACHE_SUBDIRECTORY}`;
}

/**
 * Returns true only when persisting {@link estimatedBytes} would still leave the
 * device with at least {@link MIN_FREE_DISK_BYTES} free. If the free space can't
 * be determined we allow the write (it is guarded by try/catch anyway).
 */
async function hasRoomToCache(estimatedBytes: number): Promise<boolean> {
  try {
    if (typeof FileSystem.getFreeDiskStorageAsync !== 'function') {
      return true;
    }

    const freeBytes = await FileSystem.getFreeDiskStorageAsync();
    if (typeof freeBytes !== 'number' || !Number.isFinite(freeBytes)) {
      return true;
    }

    return freeBytes - estimatedBytes >= MIN_FREE_DISK_BYTES;
  } catch {
    return true;
  }
}

async function ensureCacheDirectory() {
  const directoryUri = getBaseDirectory();
  if (!directoryUri) {
    return null;
  }

  try {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  } catch {
    // Directory likely already exists; ignore.
  }

  return directoryUri;
}

function hashKey(key: string) {
  // djb2 – small, fast, good enough to avoid filename collisions.
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33) ^ key.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function toFileName(key: string) {
  const safePrefix = key.replace(/[^0-9A-Za-z]/g, '_').slice(0, 40);
  return `${safePrefix}_${hashKey(key)}.xml`;
}

async function loadIndex(): Promise<CacheIndex> {
  if (indexCache) {
    return indexCache;
  }

  if (indexLoadPromise) {
    return indexLoadPromise;
  }

  indexLoadPromise = (async () => {
    const directoryUri = await ensureCacheDirectory();
    if (!directoryUri) {
      indexCache = {};
      indexLoadPromise = null;
      return indexCache;
    }

    try {
      const info = await FileSystem.getInfoAsync(`${directoryUri}${INDEX_FILE}`);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(`${directoryUri}${INDEX_FILE}`);
        indexCache = JSON.parse(raw) as CacheIndex;
      } else {
        indexCache = {};
      }
    } catch {
      indexCache = {};
    }

    indexLoadPromise = null;
    return indexCache;
  })();

  return indexLoadPromise;
}

async function saveIndex() {
  const directoryUri = getBaseDirectory();
  if (!directoryUri || !indexCache) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(`${directoryUri}${INDEX_FILE}`, JSON.stringify(indexCache));
  } catch {
    // Best effort – a failed index write only means we may re-fetch later.
  }
}

async function removeEntry(directoryUri: string, index: CacheIndex, key: string) {
  const entry = index[key];
  if (!entry) {
    return;
  }

  try {
    await FileSystem.deleteAsync(`${directoryUri}${entry.file}`, { idempotent: true });
  } catch {
    // Ignore – the file may already be gone (e.g. OS purge).
  }

  delete index[key];
  memoryCache.delete(key);
}

async function enforceSizeCap(directoryUri: string, index: CacheIndex) {
  let totalBytes = Object.values(index).reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes <= MAX_CACHE_BYTES) {
    return;
  }

  const entriesByAge = Object.entries(index).sort(
    ([, a], [, b]) => a.lastAccessAt - b.lastAccessAt,
  );

  for (const [key, entry] of entriesByAge) {
    if (totalBytes <= MAX_CACHE_BYTES) {
      break;
    }

    await removeEntry(directoryUri, index, key);
    totalBytes -= entry.size;
  }
}

/**
 * Returns the cached payload for {@link key} if present and not older than
 * {@link ttlMs}. Returns null on any miss/expiry/error so the caller falls back
 * to the network.
 */
export async function getCachedEventData(key: string, ttlMs: number): Promise<string | null> {
  const memoryHit = memoryCache.get(key);
  if (memoryHit !== undefined) {
    // Still honour the TTL for the in-memory copy.
    const index = await loadIndex();
    const entry = index[key];
    if (entry && Date.now() - entry.savedAt <= ttlMs) {
      return memoryHit;
    }
    memoryCache.delete(key);
  }

  try {
    const directoryUri = await ensureCacheDirectory();
    if (!directoryUri) {
      return null;
    }

    const index = await loadIndex();
    const entry = index[key];
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.savedAt > ttlMs) {
      await removeEntry(directoryUri, index, key);
      void saveIndex();
      return null;
    }

    const fileUri = `${directoryUri}${entry.file}`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      // The OS may have purged the file; drop the stale index entry.
      delete index[key];
      void saveIndex();
      return null;
    }

    const content = await FileSystem.readAsStringAsync(fileUri);
    entry.lastAccessAt = Date.now();
    memoryCache.set(key, content);
    void saveIndex();
    return content;
  } catch {
    return null;
  }
}

/**
 * Stores {@link value} on disk under {@link key}, updating the LRU index and
 * evicting old entries if the size cap is exceeded. Failures are swallowed.
 */
export async function setCachedEventData(key: string, value: string): Promise<void> {
  memoryCache.set(key, value);

  try {
    const directoryUri = await ensureCacheDirectory();
    if (!directoryUri) {
      return;
    }

    // Skip persisting when the device is low on storage (or access is denied),
    // so caching never blocks or degrades result/analysis loading. The parsed
    // data is still returned to the caller either way.
    if (!(await hasRoomToCache(value.length))) {
      return;
    }

    const index = await loadIndex();
    const file = toFileName(key);
    const fileUri = `${directoryUri}${file}`;

    await FileSystem.writeAsStringAsync(fileUri, value);

    const info = await FileSystem.getInfoAsync(fileUri);
    const size = info.exists && typeof info.size === 'number' ? info.size : value.length;

    index[key] = {
      savedAt: Date.now(),
      lastAccessAt: Date.now(),
      size,
      file,
    };

    await enforceSizeCap(directoryUri, index);
    await saveIndex();
  } catch {
    // Best effort – if we cannot persist, the in-memory copy still helps this
    // session and the next fetch simply hits the network.
  }
}

/**
 * Convenience wrapper that stores JSON-serialisable data (e.g. the parsed and
 * slimmed result/analysis structures). This is preferred over caching the raw
 * XML for large events – an O-ringen split-times payload is ~90 MB of XML but a
 * fraction of that once parsed down to the fields the app actually displays.
 */
export async function getCachedJson<T>(key: string, ttlMs: number): Promise<T | null> {
  const raw = await getCachedEventData(key, ttlMs);
  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown): Promise<void> {
  try {
    await setCachedEventData(key, JSON.stringify(value));
  } catch {
    // Serialisation failure – skip caching, the next read falls back to network.
  }
}

/** Removes every cached event payload (used for manual cache clearing). */
export async function clearEventDataCache(): Promise<void> {
  memoryCache.clear();

  try {
    const directoryUri = getBaseDirectory();
    if (!directoryUri) {
      indexCache = {};
      return;
    }

    await FileSystem.deleteAsync(directoryUri, { idempotent: true });
    indexCache = {};
  } catch {
    indexCache = {};
  }
}

import { athena as Athena } from '../api';
import localforage from 'localforage';

const MAX_CACHED_CLIPS = 3;
const MAX_CACHE_BYTES = 512 * 1024 * 1024;
const CLIP_CHUNK_CONCURRENCY = 4;
const CLIP_INDEX_KEY = '__clip_index__';
const clipCache = new Map();
const clipStorage = localforage.createInstance({ name: 'connect', storeName: 'clip_cache' });
let cachedBytes = 0;
let storageQueue = Promise.resolve();

function cacheKey(dongleId, filename, requestedAt) {
  return `clip:${dongleId}/${filename}/${requestedAt}`;
}

function clipStateKey(dongleId) {
  return `clip-state:${dongleId}`;
}

function runStorageTask(task) {
  const result = storageQueue.then(task);
  storageQueue = result.catch(() => {});
  return result;
}

async function getPersistentIndex() {
  const index = await clipStorage.getItem(CLIP_INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

function touchPersistentClip(key) {
  return runStorageTask(async () => {
    const index = await getPersistentIndex();
    const item = index.find(entry => entry.key === key);
    if (!item) return;
    item.lastUsed = Date.now();
    await clipStorage.setItem(CLIP_INDEX_KEY, index);
  }).catch(() => {});
}

async function getPersistentClip(key) {
  try {
    const blob = await clipStorage.getItem(key);
    if (!(blob instanceof Blob)) return null;
    touchPersistentClip(key);
    return blob;
  } catch (_) {
    return null;
  }
}

function persistClip(key, entry, blob) {
  return runStorageTask(async () => {
    try {
      await clipStorage.setItem(key, blob);
      let index = (await getPersistentIndex()).filter(item => item.key !== key);
      index.push({
        key, dongleId: entry.dongleId, filename: entry.filename, requestedAt: entry.requestedAt,
        lastUsed: Date.now(), size: blob.size,
      });
      index.sort((a, b) => b.lastUsed - a.lastUsed);
      let totalBytes = index.reduce((total, item) => total + item.size, 0);
      const removed = [];
      while (index.length > MAX_CACHED_CLIPS || totalBytes > MAX_CACHE_BYTES) {
        const item = index.pop();
        totalBytes -= item.size;
        removed.push(item);
      }
      await Promise.all(removed.map(item => clipStorage.removeItem(item.key)));
      await clipStorage.setItem(CLIP_INDEX_KEY, index);
    } catch (error) {
      await clipStorage.removeItem(key).catch(() => {});
      throw error;
    }
  }).catch(() => {});
}

function saveClipState(dongleId, state) {
  return runStorageTask(() => clipStorage.setItem(clipStateKey(dongleId), state)).catch(() => {});
}

async function getCachedClipState(dongleId) {
  try {
    const [state, index] = await Promise.all([clipStorage.getItem(clipStateKey(dongleId)), getPersistentIndex()]);
    const cached = new Set(index.filter(item => item.dongleId === dongleId).map(item => item.key));
    const clips = (state?.clips || [])
      .filter(clip => cached.has(cacheKey(dongleId, clip.filename, clip.requested_at)))
      .map(clip => ({ ...clip, cached: true }));
    return { clips, cameras: {} };
  } catch (_) {
    return { clips: [], cameras: {} };
  }
}

async function markCachedClips(dongleId, state) {
  const index = await getPersistentIndex().catch(() => []);
  const cached = new Set(index.filter(item => item.dongleId === dongleId).map(item => item.key));
  return {
    ...state,
    clips: (state.clips || []).map(clip => ({
      ...clip,
      cached: cached.has(cacheKey(dongleId, clip.filename, clip.requested_at)),
    })),
  };
}

function invalidatePersistentClips(dongleId, predicate) {
  return runStorageTask(async () => {
    const index = await getPersistentIndex();
    const removed = index.filter(item => item.dongleId === dongleId && predicate(item));
    await Promise.all(removed.map(item => clipStorage.removeItem(item.key)));
    if (removed.length) {
      const removedKeys = new Set(removed.map(item => item.key));
      await clipStorage.setItem(CLIP_INDEX_KEY, index.filter(item => !removedKeys.has(item.key)));
    }
  }).catch(() => {});
}

function reconcilePersistentClips(dongleId, clips) {
  const available = new Set(clips.map(clip => `${clip.filename}/${clip.requested_at}`));
  return invalidatePersistentClips(dongleId, item => !available.has(`${item.filename}/${item.requestedAt}`));
}

function evictClipCache() {
  const completeEntries = [...clipCache.entries()]
    .filter(([, entry]) => entry.blob)
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
  while (completeEntries.length > MAX_CACHED_CLIPS || cachedBytes > MAX_CACHE_BYTES) {
    const [key, entry] = completeEntries.shift();
    clipCache.delete(key);
    cachedBytes -= entry.blob.size;
  }
}

function invalidateCachedClip(dongleId, filename) {
  for (const [key, entry] of clipCache) {
    if (entry.dongleId !== dongleId || entry.filename !== filename) continue;
    entry.invalidated = true;
    clipCache.delete(key);
    if (entry.blob) cachedBytes -= entry.blob.size;
  }
  return invalidatePersistentClips(dongleId, item => item.filename === filename);
}

function getClipBlob(dongleId, filename, requestedAt, onProgress) {
  const key = cacheKey(dongleId, filename, requestedAt);
  let entry = clipCache.get(key);
  if (!entry) {
    entry = {
      blob: null, dongleId, filename, requestedAt, lastUsed: Date.now(), listeners: new Set(), loaded: 0, total: 0,
    };
    entry.promise = (async () => {
      const reportProgress = (loaded, total) => {
        entry.loaded = loaded;
        entry.total = total;
        for (const listener of entry.listeners) listener(loaded, total);
      };
      const persistentBlob = await getPersistentClip(key);
      if (persistentBlob) {
        if (entry.invalidated) return persistentBlob;
        entry.blob = persistentBlob;
        entry.loaded = persistentBlob.size;
        entry.total = persistentBlob.size;
        cachedBytes += persistentBlob.size;
        evictClipCache();
        reportProgress(persistentBlob.size, persistentBlob.size);
        return persistentBlob;
      }
      const chunks = [];
      let loaded = 0;
      let size;
      let chunkBytes;
      let nextOffset = 0;

      while (size === undefined || nextOffset < size) {
        const offsets = Array.from(
          { length: chunkBytes ? Math.min(CLIP_CHUNK_CONCURRENCY, Math.ceil((size - nextOffset) / chunkBytes)) : 1 },
          (_, index) => nextOffset + (index * (chunkBytes || 0)),
        );
        // Requests are parallel within each batch; batches bound device and browser memory use.
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.all(offsets.map(offset => call(dongleId, 'getClipChunk', { filename, offset })));
        for (const result of results) {
          if (size === undefined) size = result.size;
          if (result.size !== size || result.offset !== nextOffset) throw new Error('Clip changed during download');
          const binary = atob(result.data);
          const chunk = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) chunk[i] = binary.charCodeAt(i);
          if (!chunk.length && nextOffset < size) throw new Error('Clip download returned an empty chunk');
          if (!chunkBytes) chunkBytes = chunk.length;
          chunks.push(chunk);
          loaded += chunk.length;
          nextOffset += chunk.length;
          reportProgress(loaded, size);
        }
      }
      if (loaded !== size) throw new Error(`Clip download ended at ${loaded} of ${size} bytes`);
      const blob = new Blob(chunks, { type: 'video/mp4' });
      if (entry.invalidated) return blob;
      entry.blob = blob;
      entry.lastUsed = Date.now();
      cachedBytes += entry.blob.size;
      evictClipCache();
      persistClip(key, entry, blob);
      return entry.blob;
    })().catch(error => {
      if (clipCache.get(key) === entry) clipCache.delete(key);
      throw error;
    });
    clipCache.set(key, entry);
  }

  entry.lastUsed = Date.now();
  if (onProgress) {
    entry.listeners.add(onProgress);
    if (entry.total) onProgress(entry.loaded, entry.total);
  }
  return entry.promise.finally(() => entry.listeners.delete(onProgress));
}

function getActiveClipTransfer(dongleId) {
  const active = [...clipCache.values()]
    .filter(entry => entry.dongleId === dongleId && !entry.blob && !entry.invalidated)
    .sort((a, b) => b.lastUsed - a.lastUsed)[0];
  if (!active) return null;
  return {
    filename: active.filename,
    requestedAt: active.requestedAt,
    loaded: active.loaded,
    total: active.total,
  };
}

async function call(dongleId, method, params) {
  const payload = await Athena.postJsonRpcPayload(dongleId, { jsonrpc: '2.0', id: crypto.randomUUID(), method, params });
  if (!payload) throw new Error('Athena request failed');
  if (payload.error) throw new Error(payload.error.message || 'Athena request failed');
  return payload.result;
}

export const clipsAthena = {
  async getClipState(dongleId, params) {
    const state = await call(dongleId, 'getClipState', params);
    await reconcilePersistentClips(dongleId, state.clips || []);
    await saveClipState(dongleId, state);
    return markCachedClips(dongleId, state);
  },

  getCachedClipState,

  getActiveClipTransfer,

  createClip(dongleId, params) {
    return call(dongleId, 'createClip', params);
  },

  async deleteClip(dongleId, params) {
    const result = await call(dongleId, 'deleteClip', params);
    await invalidateCachedClip(dongleId, params.filename);
    return result;
  },

  async getClipUrl(dongleId, filename, requestedAt, onProgress) {
    return URL.createObjectURL(await getClipBlob(dongleId, filename, requestedAt, onProgress));
  },
};

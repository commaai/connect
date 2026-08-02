import { athena as Athena } from '../api';

const ATHENA_URL_ROOT = import.meta.env.VITE_CLIPS_ATHENA_URL_ROOT?.replace(/\/$/, '');
const MAX_CACHED_CLIPS = 3;
const MAX_CACHE_BYTES = 512 * 1024 * 1024;
const CLIP_CHUNK_BYTES = 512 * 1024;
const CLIP_CHUNK_CONCURRENCY = 4;
const clipCache = new Map();
let cachedBytes = 0;

function cacheKey(dongleId, filename, requestedAt) {
  return `${dongleId}/${filename}/${requestedAt}`;
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
}

function getClipBlob(dongleId, filename, requestedAt, onProgress) {
  const key = cacheKey(dongleId, filename, requestedAt);
  let entry = clipCache.get(key);
  if (!entry) {
    entry = {
      blob: null, dongleId, filename, lastUsed: Date.now(), listeners: new Set(), loaded: 0, total: 0,
    };
    entry.promise = (async () => {
      const reportProgress = (loaded, total) => {
        entry.loaded = loaded;
        entry.total = total;
        for (const listener of entry.listeners) listener(loaded, total);
      };
      const chunks = [];
      let loaded = 0;
      let size;
      let nextOffset = 0;

      while (size === undefined || nextOffset < size) {
        const offsets = Array.from(
          { length: size === undefined ? 1 : Math.min(CLIP_CHUNK_CONCURRENCY, Math.ceil((size - nextOffset) / CLIP_CHUNK_BYTES)) },
          (_, index) => nextOffset + index * CLIP_CHUNK_BYTES,
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
      return entry.blob;
    })().catch(error => {
      clipCache.delete(key);
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

async function call(dongleId, method, params) {
  if (!ATHENA_URL_ROOT) {
    const payload = await Athena.postJsonRpcPayload(dongleId, { jsonrpc: '2.0', id: crypto.randomUUID(), method, params });
    if (!payload) throw new Error('Athena request failed');
    if (payload.error) throw new Error(payload.error.message || 'Athena request failed');
    return payload.result;
  }
  const response = await fetch(`${ATHENA_URL_ROOT}/${dongleId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'Athena request failed');
  return payload.result;
}

export const clipsAthena = {
  getClipState(dongleId, params) {
    return call(dongleId, 'getClipState', params);
  },

  createClip(dongleId, params) {
    return call(dongleId, 'createClip', params);
  },

  async deleteClip(dongleId, params) {
    const result = await call(dongleId, 'deleteClip', params);
    invalidateCachedClip(dongleId, params.filename);
    return result;
  },

  async getClipUrl(dongleId, filename, requestedAt, onProgress) {
    if (ATHENA_URL_ROOT) {
      return `${ATHENA_URL_ROOT}/${dongleId}/clips/${encodeURIComponent(filename)}?v=${encodeURIComponent(requestedAt)}`;
    }

    return URL.createObjectURL(await getClipBlob(dongleId, filename, requestedAt, onProgress));
  },
};

import { athena as Athena } from '../api';
import localforage from 'localforage';
import { deviceVersionAtLeast } from '../utils';
import { webrtcConnectionManager } from '../utils/webrtc';

const activeDownloads = new Map();
const supportRequests = new Map();
const clipStorage = localforage.createInstance({ name: 'connect', storeName: 'clip_cache' });

function supportCacheKey(dongleId) {
  return `clip-support:${dongleId}`;
}

function cacheKey(dongleId, filename, requestedAt) {
  return `clip:${dongleId}/${filename}/${requestedAt}`;
}

async function invalidateClip(dongleId, filename) {
  const prefix = `clip:${dongleId}/${filename}/`;
  for (const [key, entry] of activeDownloads.entries()) {
    if (key.startsWith(prefix)) {
      entry.controller.abort();
      entry.listeners.clear();
      activeDownloads.delete(key);
    }
  }
  const keys = await clipStorage.keys().catch(() => []);
  await Promise.all(keys.filter(key => key.startsWith(prefix)).map(key => clipStorage.removeItem(key))).catch(() => {});
}

async function getClipBlob(dongleId, filename, requestedAt, onProgress) {
  const key = cacheKey(dongleId, filename, requestedAt);
  const stored = await clipStorage.getItem(key).catch(() => null);
  if (stored instanceof Blob) return stored;

  let entry = activeDownloads.get(key);
  if (!entry) {
    entry = { controller: new AbortController(), listeners: new Set(), loaded: 0, total: 0 };
    entry.promise = webrtcConnectionManager.downloadClip(dongleId, filename, (loaded, total) => {
      entry.loaded = loaded;
      entry.total = total;
      for (const listener of entry.listeners) listener(loaded, total);
    }, entry.controller.signal).then(async (blob) => {
      if (activeDownloads.get(key) === entry) await clipStorage.setItem(key, blob).catch(() => {});
      return blob;
    }).finally(() => {
      if (activeDownloads.get(key) === entry) activeDownloads.delete(key);
    });
    activeDownloads.set(key, entry);
  }

  if (onProgress) {
    entry.listeners.add(onProgress);
    if (entry.total) onProgress(entry.loaded, entry.total);
  }
  return entry.promise.finally(() => entry.listeners.delete(onProgress));
}

async function call(dongleId, method, params) {
  const payload = await Athena.postJsonRpcPayload(dongleId, { jsonrpc: '2.0', id: crypto.randomUUID(), method, params });
  if (!payload) throw new Error('Athena request failed');
  if (payload.error) throw new Error(payload.error.message || 'Athena request failed');
  return payload.result;
}

export function deviceSupportsClips(device) {
  if (!deviceVersionAtLeast(device, '0.11.2')) return Promise.resolve(false);
  if (!supportRequests.has(device.dongle_id)) {
    const request = clipStorage.getItem(supportCacheKey(device.dongle_id)).then(async (cachedCommitTimestamp) => {
      if (Number(cachedCommitTimestamp) > 0) return true;
      const version = await call(device.dongle_id, 'getVersion');
      const commitTimestamp = Number(version.commit_date);
      const supported = Number.isFinite(commitTimestamp) && commitTimestamp > 0;
      if (supported) await clipStorage.setItem(supportCacheKey(device.dongle_id), commitTimestamp);
      return supported;
    }).then((supported) => {
      if (!supported) supportRequests.delete(device.dongle_id);
      return supported;
    });
    supportRequests.set(device.dongle_id, request);
    request.catch(() => supportRequests.delete(device.dongle_id));
  }
  return supportRequests.get(device.dongle_id);
}

export const clipDevice = {
  async getClipState(dongleId, params) {
    return call(dongleId, 'getClipState', params);
  },

  createClip(dongleId, params) {
    return call(dongleId, 'createClip', params);
  },

  async deleteClip(dongleId, params) {
    await invalidateClip(dongleId, params.filename);
    return call(dongleId, 'deleteClip', params);
  },

  async getClipUrl(dongleId, filename, requestedAt, onProgress) {
    return URL.createObjectURL(await getClipBlob(dongleId, filename, requestedAt, onProgress));
  },
};

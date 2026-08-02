import { athena as Athena } from '../api';

const ATHENA_URL_ROOT = import.meta.env.VITE_CLIPS_ATHENA_URL_ROOT?.replace(/\/$/, '');

async function call(dongleId, method, params) {
  if (!ATHENA_URL_ROOT) {
    const payload = await Athena.postJsonRpcPayload(dongleId, { jsonrpc: '2.0', id: crypto.randomUUID(), method, params });
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

  deleteClip(dongleId, params) {
    return call(dongleId, 'deleteClip', params);
  },

  async getClipUrl(dongleId, filename, requestedAt) {
    if (!ATHENA_URL_ROOT) throw new Error('Clip playback endpoint is not configured');
    return `${ATHENA_URL_ROOT}/${dongleId}/clips/${encodeURIComponent(filename)}?v=${encodeURIComponent(requestedAt)}`;
  },
};

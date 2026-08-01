// UI-development stand-in for the device-side Athena clip API.
// Jobs live outside React so leaving the route viewer does not cancel them.
// Replace this adapter with Athena calls once the device API is finalized.
const STORAGE_KEY = 'connect.mockClips.v1';
const RETENTION_MS = 10 * 60 * 1000;
const READY_CLIP_BUDGET = 2 * 1024 * 1024 * 1024;

const clips = new Map();

const clone = clip => ({ ...clip });

function updateProgress(clip) {
  if (clip.status !== 'encoding') return false;

  const progress = Math.max(0, Math.min((Date.now() - clip.createdAt) / clip.mockEncodingDuration, 1));
  clip.progress = progress;
  if (progress === 1) {
    clip.status = 'ready';
    clip.size = Math.round(((clip.endTime - clip.startTime) / 1000 / clip.speedup) * clip.bitrate * 125000);
    return true;
  }
  return false;
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...clips.values()]));
  } catch {
    // The mock still works for this session when storage is unavailable.
  }
}

function evict() {
  const now = Date.now();
  const newestFirst = [...clips.values()]
    .filter(clip => now - clip.createdAt < RETENTION_MS)
    .sort((a, b) => b.createdAt - a.createdAt);
  const retained = [];
  let readyBytes = 0;
  let retainedReadyClip = false;

  newestFirst.forEach((clip) => {
    updateProgress(clip);
    if (clip.status === 'ready') {
      const fits = readyBytes + (clip.size || 0) <= READY_CLIP_BUDGET;
      if (!fits && retainedReadyClip) return;
      readyBytes += clip.size || 0;
      retainedReadyClip = true;
    }
    retained.push(clip);
  });

  clips.clear();
  retained.forEach(clip => clips.set(clip.id, clip));
}

function hydrate() {
  if (typeof window === 'undefined') return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return;
    stored.forEach((clip) => {
      if (clip?.id && clip?.route) clips.set(clip.id, clip);
    });
    evict();
    persist();
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

hydrate();

function allClips(dongleId) {
  evict();
  const result = [...clips.values()]
    .filter(clip => !dongleId || clip.route.startsWith(`${dongleId}|`) || clip.route.startsWith(`${dongleId}/`))
    .map((clip) => {
      updateProgress(clip);
      return clone(clip);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  persist();
  return result;
}

export const clipDevice = {
  async list(dongleId) {
    await new Promise(resolve => setTimeout(resolve, 350));
    return allClips(dongleId);
  },

  async create({ route, camera, bitrate, speedup, filename, startTime, endTime }) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const id = `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clip = {
      id,
      route,
      camera,
      bitrate,
      speedup,
      filename,
      startTime,
      endTime,
      createdAt: Date.now(),
      status: 'encoding',
      progress: 0,
      size: null,
      mockEncodingDuration: 8000,
    };
    clips.set(id, clip);
    evict();
    persist();
    return clone(clip);
  },

  async download(id) {
    const clip = clips.get(id);
    if (!clip) throw new Error('Clip not found on device');
    if (updateProgress(clip)) persist();
    if (clip.status !== 'ready') throw new Error('Clip is not ready');

    // The real implementation will return/visit a streaming device URL.
    const contents = `Mock comma device clip\n${JSON.stringify(clone(clip), null, 2)}\n`;
    return URL.createObjectURL(new Blob([contents], { type: 'video/mp4' }));
  },
};

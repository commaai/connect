// UI-development stand-in for the device-side Athena clip API.
// Jobs live outside React so leaving the route viewer does not cancel them.
// Replace this adapter with Athena calls once the device API is finalized.
const clips = new Map();

const clone = clip => ({ ...clip });

function updateProgress(clip) {
  if (clip.status !== 'encoding') return;

  const progress = Math.min((Date.now() - clip.createdAt) / clip.mockEncodingDuration, 1);
  clip.progress = progress;
  if (progress === 1) {
    clip.status = 'ready';
    clip.size = Math.round(((clip.endTime - clip.startTime) / 1000 / clip.speedup) * clip.bitrate * 125000);
  }
}

function clipsForRoute(route) {
  return [...clips.values()]
    .filter(clip => clip.route === route)
    .map((clip) => {
      updateProgress(clip);
      return clone(clip);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export const clipDevice = {
  async list(route) {
    await new Promise(resolve => setTimeout(resolve, 350));
    return clipsForRoute(route);
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
    return clone(clip);
  },

  async download(id) {
    const clip = clips.get(id);
    if (!clip) throw new Error('Clip not found on device');
    updateProgress(clip);
    if (clip.status !== 'ready') throw new Error('Clip is not ready');

    // The real implementation will return/visit a streaming device URL.
    const contents = `Mock comma device clip\n${JSON.stringify(clone(clip), null, 2)}\n`;
    return URL.createObjectURL(new Blob([contents], { type: 'video/mp4' }));
  },
};

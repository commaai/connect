// Persistent browser stand-in for the device-side Athena clip API.
// Keep this module wire-compatible so replacing it with the real transport does not change UI code.
const STORAGE_KEY = 'connect.mockClips.v2';
const RETENTION_SECONDS = 10 * 60;
const READY_CLIP_BUDGET = 2 * 1024 * 1024 * 1024;
const MOCK_ENCODING_SECONDS = 8;

const CAMERA_FILES = ['fcamera', 'ecamera', 'dcamera'];
const BITRATES = [5, 8, 12];
const SPEEDUPS = [1, 2, 5, 10];
const clips = new Map();

const now = () => Date.now() / 1000;

function publicClip(clip) {
  const result = { ...clip };
  delete result.mock_dongle_id;
  delete result.mock_encoding_duration;
  return result;
}

function updateProgress(clip) {
  if (clip.status !== 'encoding') return;
  clip.progress = Math.max(0, Math.min((now() - clip.created_at) / clip.mock_encoding_duration, 1));
  if (clip.progress === 1) {
    clip.status = 'ready';
    clip.size = Math.round(((clip.source_end_time - clip.source_start_time) / clip.speedup) * clip.bitrate * 125000);
    clip.fn = `clips/${clip.id}.mp4`;
  }
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
  const newestFirst = [...clips.values()]
    .filter(clip => now() - clip.created_at < RETENTION_SECONDS)
    .sort((a, b) => b.created_at - a.created_at);
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
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore unavailable browser storage in the mock.
    }
  }
}

hydrate();

function createMockVideo(clip) {
  if (typeof MediaRecorder === 'undefined') return Promise.reject(new Error('Video previews are not supported by this browser'));
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  const stream = canvas.captureStream(20);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];

  return new Promise((resolve, reject) => {
    let timer;
    recorder.ondataavailable = event => chunks.push(event.data);
    recorder.onerror = () => {
      clearInterval(timer);
      stream.getTracks().forEach(track => track.stop());
      reject(new Error('Could not create mock video'));
    };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      resolve(URL.createObjectURL(new Blob(chunks, { type: mimeType })));
    };
    recorder.start();
    let frame = 0;
    timer = setInterval(() => {
      const progress = frame / 30;
      context.fillStyle = '#12181c';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#30393e';
      context.fillRect(0, 255, canvas.width, 105);
      context.fillStyle = '#fff';
      context.font = '24px sans-serif';
      context.fillText(clip.filename || 'comma clip', 28, 48);
      context.font = '16px sans-serif';
      context.fillStyle = 'rgba(255,255,255,.65)';
      context.fillText(`${clip.camera} · ${Math.round(progress * 100)}%`, 28, 78);
      context.fillStyle = '#55c2ff';
      context.fillRect(28, 320, (canvas.width - 56) * progress, 5);
      frame += 1;
      if (frame > 30) {
        clearInterval(timer);
        recorder.stop();
      }
    }, 50);
  });
}

function clipsForDevice(dongleId) {
  evict();
  const result = [...clips.values()]
    .filter(clip => clip.mock_dongle_id === dongleId)
    .map((clip) => {
      updateProgress(clip);
      return publicClip(clip);
    })
    .sort((a, b) => b.created_at - a.created_at);
  persist();
  return result;
}

export const clipsStub = {
  async getClipsState(dongleId, { routes = [] } = {}) {
    await new Promise(resolve => setTimeout(resolve, 350));
    return {
      version: 1,
      capabilities: {
        cameras: CAMERA_FILES,
        bitrates: BITRATES,
        speedups: SPEEDUPS,
        max_duration: 30 * 60,
      },
      clips: clipsForDevice(dongleId),
      routes: Object.fromEntries(routes.map(route => [route, {
        cameras: Object.fromEntries(CAMERA_FILES.map(camera => [camera, { available_ranges: [[0, 24 * 60 * 60]] }])),
      }])),
    };
  },

  async createClips(dongleId, request) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const existing = clipsForDevice(dongleId).filter(clip => clip.request_id === request.request_id);
    if (existing.length) return { request_id: request.request_id, clips: existing };
    const created = request.clips.map((settings) => {
      const id = `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const clip = {
        id,
        request_id: request.request_id,
        mock_dongle_id: dongleId,
        route: request.route,
        camera: settings.camera,
        bitrate: settings.bitrate,
        speedup: settings.speedup,
        filename: settings.filename
          ? `${settings.filename.replace(/\.mp4$/i, '')}.mp4`
          : `comma-clip-${settings.camera}-${Math.round(request.source_start_time)}-${Math.round(request.source_end_time)}.mp4`,
        source_start_time: request.source_start_time,
        source_end_time: request.source_end_time,
        created_at: now(),
        status: 'encoding',
        progress: 0,
        fn: null,
        size: null,
        error: null,
        mock_encoding_duration: MOCK_ENCODING_SECONDS,
      };
      clips.set(id, clip);
      return publicClip(clip);
    });
    evict();
    persist();
    return { request_id: request.request_id, clips: created };
  },

  async deleteClips(dongleId, { clip_ids: clipIds }) {
    await new Promise(resolve => setTimeout(resolve, 150));
    const deviceClipIds = new Set(clipsForDevice(dongleId).map(clip => clip.id));
    const deleted = [];
    const failed = [];
    clipIds.forEach((clipId) => {
      if (!deviceClipIds.has(clipId)) failed.push(clipId);
      else {
        clips.delete(clipId);
        deleted.push(clipId);
      }
    });
    persist();
    return { deleted, failed };
  },

  async getClipUrl(dongleId, clipId) {
    const clip = clipsForDevice(dongleId).find(candidate => candidate.id === clipId);
    if (!clip) throw new Error('Clip not found on device');
    if (clip.status !== 'ready') throw new Error('Clip is not ready');
    return createMockVideo(clip);
  },
};

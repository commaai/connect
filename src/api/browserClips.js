import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import localforage from 'localforage';

let ffmpeg;
let loadPromise;
const browserClipStorage = localforage.createInstance({ name: 'connect', storeName: 'browser_clip_cache' });

function clipIndexKey(dongleId) {
  return `clips:${dongleId}`;
}

function clipBlobKey(dongleId, clipId) {
  return `blob:${dongleId}/${clipId}`;
}

export async function getBrowserClips(dongleId, route) {
  const clips = await browserClipStorage.getItem(clipIndexKey(dongleId)).catch(() => []);
  return Array.isArray(clips) ? clips.filter(clip => !route || clip.route === route) : [];
}

export async function saveBrowserClip(dongleId, clip, blob) {
  const clipId = clip.cache_id || `${clip.requested_at}-${crypto.randomUUID()}`;
  const storedClip = { ...clip, cache_id: clipId, local: true };
  await browserClipStorage.setItem(clipBlobKey(dongleId, clipId), blob);
  try {
    const clips = await browserClipStorage.getItem(clipIndexKey(dongleId)).catch(() => []);
    const withoutExisting = Array.isArray(clips) ? clips.filter(item => item.cache_id !== clipId) : [];
    await browserClipStorage.setItem(clipIndexKey(dongleId), [storedClip, ...withoutExisting]);
  } catch (error) {
    await browserClipStorage.removeItem(clipBlobKey(dongleId, clipId)).catch(() => {});
    throw error;
  }
  return storedClip;
}

export async function getBrowserClipBlob(dongleId, clipId) {
  const blob = await browserClipStorage.getItem(clipBlobKey(dongleId, clipId));
  if (!(blob instanceof Blob)) throw new Error('This browser clip is no longer available');
  return blob;
}

export async function deleteBrowserClip(dongleId, clipId) {
  await browserClipStorage.removeItem(clipBlobKey(dongleId, clipId));
  const clips = await browserClipStorage.getItem(clipIndexKey(dongleId)).catch(() => []);
  if (Array.isArray(clips)) {
    await browserClipStorage.setItem(clipIndexKey(dongleId), clips.filter(clip => clip.cache_id !== clipId));
  }
}

async function getFFmpeg() {
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (!loadPromise) loadPromise = ffmpeg.load({ coreURL, wasmURL });
  await loadPromise;
  return ffmpeg;
}

function selectedQcameraSegments(route, files, startTime, endTime) {
  if (!route?.segment_numbers || !files) return [];
  const routeStart = route.start_time_utc_millis;
  return route.segment_numbers.flatMap((segmentNumber, index) => {
    const segmentStart = (route.segment_start_times[index] - routeStart) / 1000;
    const segmentEnd = (route.segment_end_times[index] - routeStart) / 1000;
    if (segmentStart >= endTime || segmentEnd <= startTime) return [];
    const file = files[`${route.fullname}--${segmentNumber}/qcameras`];
    return file?.url ? [{ segmentStart, url: file.url }] : [];
  });
}

export function browserClipAvailability(route, files, startTime, endTime) {
  if (!route?.segment_numbers || !files || endTime <= startTime) return false;
  const expected = route.segment_numbers.filter((segmentNumber, index) => {
    const segmentStart = (route.segment_start_times[index] - route.start_time_utc_millis) / 1000;
    const segmentEnd = (route.segment_end_times[index] - route.start_time_utc_millis) / 1000;
    return segmentStart < endTime && segmentEnd > startTime;
  });
  return expected.length > 0 && expected.every(segmentNumber => files[`${route.fullname}--${segmentNumber}/qcameras`]?.url);
}

export async function createBrowserClip({ route, files, startTime, endTime, bitrate, speedup, onProgress }) {
  const segments = selectedQcameraSegments(route, files, startTime, endTime);
  if (!segments.length) throw new Error('Qcamera footage is not uploaded for this range');

  const worker = await getFFmpeg();
  const requestId = crypto.randomUUID();
  const inputNames = segments.map((segment, index) => `qcamera-${requestId}-${index}.ts`);
  const inputListName = `qcamera-${requestId}.txt`;
  const outputName = `clip-${requestId}.mp4`;
  const progressHandler = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  worker.on('progress', progressHandler);

  try {
    await Promise.all(segments.map(async ({ url }, index) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not download qcamera footage (${response.status})`);
      await worker.writeFile(inputNames[index], new Uint8Array(await response.arrayBuffer()));
    }));
    await worker.writeFile(inputListName, new TextEncoder().encode(inputNames.map(name => `file '${name}'`).join('\n')));

    const sourceOffset = Math.max(0, startTime - segments[0].segmentStart);
    const sourceDuration = endTime - startTime;
    const exitCode = await worker.exec([
      '-ss', String(sourceOffset), '-f', 'concat', '-safe', '0', '-i', inputListName,
      '-an', '-vf', `trim=duration=${sourceDuration},setpts=(PTS-STARTPTS)/${speedup}`, '-c:v', 'libx264', '-preset', 'superfast',
      '-b:v', `${bitrate}M`, '-movflags', '+faststart', outputName,
    ]);
    if (exitCode !== 0) throw new Error('Browser transcoding failed');
    const data = await worker.readFile(outputName);
    return new Blob([data.buffer], { type: 'video/mp4' });
  } finally {
    worker.off('progress', progressHandler);
    await Promise.all(inputNames.map(name => worker.deleteFile(name).catch(() => {})));
    await worker.deleteFile(inputListName).catch(() => {});
    await worker.deleteFile(outputName).catch(() => {});
  }
}

import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

let ffmpeg;
let loadPromise;

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
  const inputName = `qcamera-${crypto.randomUUID()}.ts`;
  const outputName = `clip-${crypto.randomUUID()}.mp4`;
  const progressHandler = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  worker.on('progress', progressHandler);

  try {
    const responses = await Promise.all(segments.map(async ({ url }) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not download qcamera footage (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const input = new Uint8Array(responses.reduce((total, bytes) => total + bytes.length, 0));
    let offset = 0;
    for (const bytes of responses) {
      input.set(bytes, offset);
      offset += bytes.length;
    }
    await worker.writeFile(inputName, input);

    const sourceOffset = Math.max(0, startTime - segments[0].segmentStart);
    const sourceDuration = endTime - startTime;
    const exitCode = await worker.exec([
      '-ss', String(sourceOffset), '-i', inputName, '-t', String(sourceDuration),
      '-an', '-vf', `setpts=PTS/${speedup}`, '-c:v', 'libx264', '-preset', 'ultrafast',
      '-b:v', `${bitrate}M`, '-movflags', '+faststart', outputName,
    ]);
    if (exitCode !== 0) throw new Error('Browser transcoding failed');
    const data = await worker.readFile(outputName);
    return new Blob([data.buffer], { type: 'video/mp4' });
  } finally {
    worker.off('progress', progressHandler);
    await worker.deleteFile(inputName).catch(() => {});
    await worker.deleteFile(outputName).catch(() => {});
  }
}

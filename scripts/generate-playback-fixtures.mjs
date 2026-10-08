import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_FIXTURE_DIR = resolve(root, 'test-results/playback-fixtures');
export const FIXTURE_SECONDS = 12;
export const VIDEO_START_OFFSET = 1500;

// All media comes from FFmpeg's test pattern and quiet sine generator. No route
// recordings, downloaded media, credentials, or generated binaries are committed.
export async function generatePlaybackFixtures(directory = DEFAULT_FIXTURE_DIR, ffmpeg = 'ffmpeg') {
  await mkdir(directory, { recursive: true });
  for (const variant of ['silent', 'audio']) {
    const destination = resolve(directory, variant);
    await mkdir(destination, { recursive: true });
    const inputs = ['-f', 'lavfi', '-i', `testsrc2=size=320x200:rate=24:duration=${FIXTURE_SECONDS}`];
    if (variant === 'audio') inputs.push('-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${FIXTURE_SECONDS}`);
    const audio = variant === 'audio' ? ['-af', 'volume=0.02', '-c:a', 'aac', '-b:a', '48k'] : ['-an'];
    await execute(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', ...inputs,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-pix_fmt', 'yuv420p',
      '-profile:v', 'baseline', '-g', '24', '-keyint_min', '24', '-sc_threshold', '0',
      ...audio, '-t', String(FIXTURE_SECONDS), '-f', 'hls', '-hls_time', '2',
      '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
      '-hls_segment_filename', resolve(destination, 'segment-%03d.ts'), resolve(destination, 'index.m3u8'),
    ]);
  }
  await execute(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', 'testsrc2=size=128x80:rate=1:duration=12', '-vf', 'tile=12x1',
    '-frames:v', '1', '-update', '1', resolve(directory, 'sprite.jpg'),
  ]);
  const audioManifest = await readFile(resolve(directory, 'audio/index.m3u8'), 'utf8');
  await writeFile(resolve(directory, 'gap.m3u8'), audioManifest.replace('segment-002.ts', '#EXT-X-GAP\nsegment-002.ts'));
  const manifest = {
    version: 2, seconds: FIXTURE_SECONDS, videoStartOffset: VIDEO_START_OFFSET,
    provenance: 'FFmpeg testsrc2 and a quiet 440 Hz sine, generated locally',
    scenarios: ['audio', 'silent', 'missing-map', 'missing-segment', 'gap', 'fatal-manifest', 'stalled'],
    events: [{ type: 'event', route_offset_millis: VIDEO_START_OFFSET, route_offset_nanos: 0,
      data: { event_type: 'first_road_camera_frame' } }],
    coords: Array.from({ length: FIXTURE_SECONDS + 3 }, (_, t) => ({ t, lng: -117.161 + t * 0.0001, lat: 32.711 + t * 0.00005 })),
  };
  await writeFile(resolve(directory, 'fixture.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] || DEFAULT_FIXTURE_DIR);
  await generatePlaybackFixtures(directory, process.env.FFMPEG || 'ffmpeg');
  console.log(`Generated playback fixtures in ${directory}`);
}

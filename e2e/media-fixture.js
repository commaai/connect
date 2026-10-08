import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const directory = '/tmp/connect-playback-fixture';
export function createMediaFixture() {
  mkdirSync(directory, { recursive: true });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '12',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '30',
    '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0',
    '-hls_segment_filename', `${directory}/part-%d.ts`, `${directory}/index.m3u8`]);
}
export function fixtureManifest() {
  let segment = 0;
  return readFileSync(`${directory}/index.m3u8`, 'utf8')
    .replace(/#EXTINF:([^,]+),/g, (_match, duration) => `#EXTINF:${duration},${segment++}`);
}
export function fixtureSegment(number) {
  return readFileSync(`${directory}/part-${number}.ts`);
}

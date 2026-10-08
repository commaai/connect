# Video playback validation

Run `bun install`, `bun start`, then open `http://localhost:3000/demo`.
The demo includes missing qcamera, thumbnails, GPS, and qlog cases. Audio
must also be checked with an audio-enabled public route or device route.

## Automated checks

- `bun run lint`
- `bun run test --pool=threads --maxWorkers=2`
- `bun run build:production`

Unit/component tests cover observed media time, queued and superseded seeks,
initial HLS loading at a ranged position, independent pause/speed controls,
late camera offsets, paused seeking, buffering, native HLS audio detection,
loop bounds, missing-segment errors, delayed loading feedback, timeout/retry, autoplay rejection, stale
callbacks, native mute controls, and preserving the player in map view.
These tests mock media decoding; they do not prove browser compatibility.

## Browser and device checks (not yet verified)

Repeat on desktop Chrome/Firefox/Safari, iOS Safari and its installed PWA,
and Android Chrome and its installed PWA. Use real devices for audio.

1. Open a route directly, then a selected-range URL. Confirm the initial
   video frame, timeline, map marker, and displayed time agree.
2. Play, pause, change speed while paused, jump forward/back, and rapidly click different timeline
   positions. Confirm the final request wins and paused seeks finish.
3. Play through a segment boundary and a selected loop. Seek to both ends.
4. Switch Video/Map and return. Confirm position is retained and map view
   is muted. Check native fullscreen and native mute controls.
5. Unmute an audio route, seek repeatedly, pause/resume, and switch routes.
   Confirm audio stays synchronized without rate oscillation.
6. Throttle/disconnect the network, then restore it. Confirm position does
   not advance without video and Retry resumes at the last confirmed time.
7. Test missing qcamera and missing thumbnails. Confirm errors are usable
   and the rest of the route view remains accessible.
8. Background/resume the browser and PWA, rotate the device, and navigate
   between routes while loading. Confirm no stale error or position leaks.

Record browser/OS versions and loading/seek timings before opening a PR.

## Known limits

The current demo route has no audio in the inspected first segment. A disabled
mute button is expected for that sample; it is not an audio compatibility test.
Audio-enabled routes, real-device playback, PWA background/resume, and visual
review still need verification. Missing video produces a recoverable error;
this implementation does not automatically skip deleted video segments or
reconstruct route time from playlists with omitted segments.

## Latest automated results

- 131 tests passed across 14 files.
- Lint: 0 warnings, 0 errors.
- Production build: passed; the existing large-chunk warning remains.
- Diff whitespace check: passed.

## Gallery regression verification

The empty-playlist mobile drive capture failure was reproduced locally. Failed
media sources are now detached and native controls are hidden while an error
is displayed. Autoplay prompts retain their source so the Play gesture works.

`node scripts/build-gallery.mjs --output node_modules/.cache/gallery-after-fix`
passed all 30 desktop/mobile viewport captures with Puppeteer's headless browser,
including drive/mobile and drive/desktop. The screenshot stability assertion
was unchanged. Mobile viewport screenshots do not verify real iOS/Android
media playback or installed PWAs.

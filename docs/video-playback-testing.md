# Video playback testing

Run `bun install --frozen-lockfile`, `bun run test`, `bun run lint`, and
`bun run build:development`. Run tests separately from the build: the app
integration tests have a five-second timeout and can time out under contention.

Start `bun start` and open `/demo`. The **Normal playback** route uses the public
demo drive without modifying its metadata. Other routes exercise missing logs,
GPS, thumbnails, and unavailable video. Demo routes share the public drive's
stream; the single-segment file-list mutations do not remove segments from HLS.

The native video element owns the playback clock and its controls. Native HLS
is preferred when advertised; hls.js handles browsers without native HLS and
can recover if an advertised native stream fails. Timeline seeks are explicit
commands. Video events confirm the playback position used by the map, timeline,
timestamp, and current-segment file actions.

Before submitting, exercise this checklist on desktop, iOS Safari, Android
Chrome, and installed iOS and Android PWAs. Viewport emulation does not validate
mobile media behavior. Use both a silent route and a route recorded with audio.

- Open a whole drive and a selected range from a fresh URL. Verify the first
  camera-frame offset and that a selected range repeats at its boundaries.
- Pause, resume, and change speed. Seek repeatedly with the native scrubber,
  timeline, keyboard arrows, and ten-second buttons, including while paused.
- Unmute and repeat playback, seeks, and range looping. Check for audio glitches
  and that a browser permission refusal leaves a usable paused player.
- Enter and exit native fullscreen. Switch between video and map, and verify
  map position and time continue to follow the media position.
- Throttle or disconnect the network while loading and seeking. Verify the
  timeline stops when video stalls, recovery resumes from that position, and
  terminal errors offer a retry. Retry must preserve the requested position.
- Exercise a route with an unavailable segment. Seek to another available
  segment after an error, and verify timestamps and file actions match it.
- Change routes, close the drive, and navigate back. Verify old video requests,
  audio, and pending play promises cannot affect the new player.
- Background and foreground the browser/PWA, including screen lock with audio.
  Verify the UI reflects the browser's actual playback or pause behavior.

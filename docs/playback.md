# Playback state

The video is the playback clock. `offset` is the observed route time in
milliseconds; `currentOffset()` reads it without adding elapsed wall time.
Media frames/timeupdate/seeked report the current route's video time plus its
`videoStartOffset`. Stale route events cannot publish progress.

Play, pause, speed and seek actions express intent. A seek request is separate
from observed progress and is applied when metadata permits it. Seeks and loop
endpoints use route milliseconds, converted into video seconds and intersected
with media duration and seekable ranges. A paused endpoint stays visible;
playing at an endpoint resumes from the loop start, including zero.
Relative jumps accumulate from the pending command until the native seek is
complete. Its acknowledgement clears only that command, so a late completion
cannot discard a newer seek; subsequent jumps use the observed media position.

On the hls.js path, known playlist fragments exclude declared gaps even when
MSE advertises a continuous seekable range. Seeks and loop restarts choose the
next available fragment within the selection, or the preceding playable point.
A selection containing only gaps exposes an error. Valid unloaded fragments
remain seekable; native HLS uses the browser's own seekable information.
If HLS skips beyond a loop's end, observed progress permits a bounded restart;
repeated attempts without progress expose a range error instead of a fatal
recovery cycle. Choosing another valid range resumes the same loader.

`DriveVideo` uses native HLS when the video advertises support, otherwise the
bundled, lazy-loaded hls.js. Native track discovery or HLS codec discovery
controls audio availability. Buffering ends when data or active progress
resumes. Playback-policy rejection exposes a Play button; fatal errors and a
20-second loading timeout expose Retry. Cleanup removes media listeners,
frame callbacks, loading timers and the HLS instance on route change/unmount.
The player remains mounted when switching to the map so the map follows the
same observed clock.

Run `bun run test`, `bun run lint`, and `bun run build:production`.
Unit tests cover command/observation separation, range conversion, native and
HLS event handling, audio discovery, policy rejection, retry, late events,
natural end ordering and same-route resets. Browser/device verification
requires real HLS playback, not these mocked media events alone.

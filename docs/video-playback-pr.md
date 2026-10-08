# Suggested PR title

Make route playback follow the native video clock

# Suggested description

Route playback currently follows an independent Redux clock, requiring periodic
seeks and playback-rate adjustments to keep the video synchronized. This change
uses a native video element with native HLS on iPhone/iPad and HLS.js elsewhere.
Observed media positions drive the map, timeline, and displayed route time;
requested seeks stay separate until the media element applies them.

- Remove wall-clock advancement, drift correction, ReactPlayer, and global
  buffering state.
- Separate pause from playback speed so changing speed cannot resume a paused
  route, and resume preserves the selected speed.
- Start HLS loading at the latest requested position, queue early seeks, and
  retain the player when switching to the map.
- Add delayed loading feedback, bounded media-error recovery, explicit Retry
  and autoplay Play actions, and a message for ranges outside available video.
- Synchronize native play, pause, rate, and mute controls with Connect's controls.
- Add component and whole-app regressions and a manual device-testing checklist.

Related: https://github.com/commaai/connect/issues/769

## Validation

Automated tests, lint, and the production build were run locally. See
[video-playback-testing.md](video-playback-testing.md) for the commands and the
remaining browser/device checks. Unit tests mock media decoding. Desktop visual
review and iOS/Android browser and installed-PWA testing, especially audio,
still need verification. Do not describe these platforms as tested yet.

## Related implementations reviewed

Design ideas were compared with [#788](https://github.com/commaai/connect/pull/788),
[#823](https://github.com/commaai/connect/pull/823), and
[#834](https://github.com/commaai/connect/pull/834). In particular, #788 separates
pause from speed and targets initial HLS loading; #823 distinguishes selections
without video from retryable loading failures; #834 examines playlist gaps and
bounded media recovery. This branch keeps the native video controls and uses
confirmed media-position updates rather than a fallback wall clock.

Automatic skipping and time remapping for playlists with omitted segments are
not included. Deleted or unavailable video can report an error and offer Retry.
The production code removes more lines than it adds; regression tests add
coverage. Review the complete diff and fill in actual device results before
submitting this PR.

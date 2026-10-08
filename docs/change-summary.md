# Connect playback and dashboard changes

This document summarizes the changes made for the video playback and dashboard work, including follow-up fixes for route selection and map zoom behavior.

## Video playback

- Reworked the video player so playback time drives the timeline and related state, with more reliable loading, seeking, and handling for media errors and browser autoplay restrictions.
- Improved media behavior across desktop and mobile browsers, including iOS behavior when a route has audio.
- Playback speed controls are available on iOS and use touch-sized buttons. Files retry keeps its error visible while the refresh is running and has a larger touch target.
- Updated the DriveView media layout to keep the video, map, and timeline working together.
- Added desktop-only timeline hover previews that show the corresponding video frame. The previews are available on both the dashboard route cards and the DriveView timeline.
- Added regression tests for playback state and the video player.

## Route and media loading

- Added explicit Files loading failure and retry handling, including corresponding action types and tests.
- Improved route-card navigation and its Back/Close behavior.
- Prevented the DriveMap from throwing when route selection clears the route line before the map's route source is ready. Added a regression test for this lifecycle case.
- A direct refresh on a route fetches only that route's metadata; it is no longer marked as a complete dashboard list. The dashboard now checks route metadata on mount, so returning to it loads the full selected date range, including when the route request finishes after navigation.

## Dashboard map and scrolling

- Reused the existing map in the dashboard Navigation component to display loaded route paths; removed the duplicate lower map.
- Fetches route coordinates for visible dashboard routes and draws their paths on the map. The map initially fits the loaded route bounds.
- The dashboard map begins expanded and smoothly collapses as the page scrolls, then stays pinned below the navigation bar. Device information and filters remain pinned while the route list scrolls with the page.
- On mobile, the map, device header, and filters use the app header's 64px sticky offset, preventing a gap where scrolling route content could show above the map. Map resizing is coalesced to animation frames, and mobile browser toolbar-only height changes are ignored to avoid scroll jumps.
- Preserves the map viewport after the user pans or zooms. Automatic route-bound fitting and late device-location updates no longer reset the user's chosen view; explicit search and geolocation actions can still move the map.
- Added tests for route geometry, route bounds, map sizing, and preserving map zoom after interaction.

## Verification performed

- Focused tests for the dashboard map viewport and map sizing passed (3 tests).
- Focused tests for route-map initialization, DriveView, and app behavior passed (30 tests).
- The full test suite passed (136 tests across 21 files).
- Development build succeeded. It reports the existing warning about large output chunks.
- Lint, editor diagnostics, and `git diff --check` passed for the most recent map changes.


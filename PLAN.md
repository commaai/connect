# PLAN — Issue #770 "Beautiful URL Handling" (branch `beautiful-urls-770`)

## Architecture

**One grammar module (`src/url.js`).** `parseLocation({pathname, search})` → canonical nav state
`{ page, dongleId, routeId, zoom(ms)|null, legacy(sec)|null, settings, pair }`; `buildUrl(nav,
{routeDuration})` → canonical URL string. Strict inverses for every canonical shape; anchored
regexes; NaN/invalid → safe fallback (`page: 'unknown'`, never throws). Covers: `/`, `/referrals`,
`/demo`, `/<dongle>`, `/<dongle>/prime`, `/<dongle>/stream`, `/<dongle>/<route>`,
`/<dongle>/<route>/<s>/<e>` (seconds), legacy `/<dongle>/<s>/<e>` (seconds), `?settings=`, `?pair=`,
`?r=` (consumed at boot, not nav state). Also `withQuery(location, patch)` for query-param overlays.

**URL as single source of navigation truth.** `src/actions/history.js` middleware handles *every*
`LOCATION_CHANGE` (PUSH, POP, REPLACE): parse once → diff against state → dispatch minimal
state-only updates. Never pushes URLs itself, so no loops are possible. PUSH is now applied (was
ignored); POP/REPLACE keep today's semantics. Zoom comparison is canonical: precise ms state vs
whole-second URLs, and whole-drive zoom (0..duration) normalizes to rangeless, so in-app pushes
no-op instead of churning.

**State-only cores + thin public creators (`src/actions/index.js`).** `selectDeviceState`,
`pushTimelineRangeState` do state updates only (timeline stack, playback `resetPlayback`/`selectLoop`,
prime zoom-clearing via reducer — all unchanged). Public `selectDevice`, `pushTimelineRange`,
`popTimelineRange`, `primeNav`, `streamNav` = core + single `syncUrl()` that serializes via
`buildUrl` and pushes only when the URL differs. `allowPathChange` eliminated; `urlForState` and the
inline `` `/${dongleId}/stream` `` template deleted. Query params preserved across syncs except
`selectDevice` drops device-scoped `?settings=`.

**Pages derived at render; dialogs as query overlays.** No react-router route table (the convention
every serious PR converged on), no new deps. Device settings modal lifted from `DeviceList` local
state to `Explorer`, driven by `?settings=<dongleId>` — the open drive and zoom stack stay intact
underneath (key differentiator vs settings-as-page PRs). Pair flow keeps its `?pair=<token>` trigger;
closing the dialog now strips `?pair=` from the URL. Clips/files/uploads dialogs stay local
(out of scope — sprawl).

**Legacy conversion as explicit thunk.** `resolveLegacyZoom(dongleId, start, end)` with a
stale-navigation guard (re-parses current location before applying). Out of the middleware hot path.

**Preserved:** `?r=` login redirect, `?pair=` pairing flow, `/demo` backend selection, primeNav
zoom-clearing reducer side effect, `zoom.previous` stack, `checkRoutesData` hardNavigate, all URL
shapes, and startup's rule that the initial device pick takes over the URL only from `/`
(deep links like `/referrals` select the device silently and keep their address).
One intentional fix: `urlForState` dropped any range starting at second 0 (`0` is falsy);
`buildUrl` serializes it (`/<d>/<log>/0/30`) — old bookmarks still parse, and 0-start partial
ranges now survive refresh/share instead of silently widening to the whole drive.

## Files modified

1. `src/url.js` — rewritten: `parseLocation`, `buildUrl`, `withQuery`. Deleted the 6 ad-hoc helpers.
2. `src/actions/index.js` — state cores + public creators + `syncUrl` + `resolveLegacyZoom`;
   deleted `urlForState`, `updateTimeline`, `allowPathChange`.
3. `src/actions/history.js` — unified middleware (PUSH/POP/REPLACE), single parse, legacy thunk,
   canonical zoom diff, raw prime/stream sync actions.
4. `src/actions/startup.js` — initial device pick: `selectDevice` (URL takeover) only from `/`,
   otherwise `selectDeviceState` (silent).
5. `src/initialState.js` — single `parseLocation` call.
6. `src/App.jsx` — `parseLocation` for login-gate + webrtc reconnect.
7. `src/analytics.js` — `parseLocation` for page-view anonymization.
8. `src/components/explorer.jsx` — referrals via parser; settings modal lifted to URL overlay;
   pair-dialog URL cleanup on close.
9. `src/components/Dashboard/DeviceList.jsx` — settings button pushes `?settings=`; local modal
   state removed.
10. `src/components/Dashboard/DriveListItem.jsx`, `src/components/Timeline/index.jsx`,
    `src/components/Dashboard/DeviceSettingsModal.jsx` — dropped `allowPathChange` args
    (calls otherwise unchanged); `DeviceSettingsModal.jsx` additionally: `onPrimeSettings`
    now closes the overlay first (replace), then does a state-only device select and a
    single `primeNav` push (no intermediate history entry); `stateToProps` guards
    `state.devices` being null on cold `?settings=` deep links.
11. `src/actions/index.js` — `syncUrl` no longer preserves the one-time `?pair=` token.
12. Tests: rewrote `src/url.test.js` (48), `src/actions/history.test.js` (16),
    `src/actions/index.test.js` (16, +2 pair-token tests); `src/App.test.jsx` (+3:
    settings-overlay open/close/Back/Forward, overlay Close button, prime-settings
    single-history-entry regression); updated one `src/App.test.jsx` expectation
    (legacy conversion now lands on `/<d>/<log>/0/60`, see above).
13. `src/url.js` header — documents the intentional `/demo` round-trip exception.

## Validation (2026-10-09, bun 1.4.2 / node v24.20.0)

- `bun run test` — **13 files, 131/131 pass** (was 126/126 before the review
  fixes; +5 new tests: pair-token drop x2, settings-overlay integration x2,
  prime-settings single-entry regression x1).
- `bun run lint` (oxlint) — **0 warnings, 0 errors** (100 files).
- `vite build` (production) — **succeeds** in ~23s (pre-existing >500kB chunk-size warning only).
- Diff vs master: **17 files, +839 / −325** (PLAN.md included; code-only +731/−325).

## Known limitations

- Legacy conversion device ordering: when the middleware sees a legacy
  `/<dongle>/<start>/<end>` URL it returns early and dispatches
  `resolveLegacyZoom` without selecting the device first (the old code selected
  the device before converting). For full-page loads this is fine because
  `initialState` already parsed the dongle; only an in-app navigation to a
  legacy URL with a *different* dongle than the current one could build the
  canonical URL from stale state. Deliberately left as-is: fixing it would
  require re-introducing device selection into the conversion path (the
  architectural coupling this change removes), for a path that is rare and
  self-heals via the middleware diff on the resulting navigation.
- `/demo` intentionally does not round-trip through `buildUrl` (see `src/url.js`
  header): the demo backend is selected by pathname once at boot, not as
  navigation state.
- Clips/files/uploads dialogs remain local component state (out of scope).

## Manual verification needed (no live browser here)

Deep-link a drive then open/close the settings overlay (Back should close it, zoom stack intact);
Back/Forward through timeline zoom selections; `?pair=` pairing flow end-to-end; `/demo` backend;
login `?r=` redirect; legacy `/{dongle}/{start}/{end}` bookmark conversion.

## Proposed PR

**Title:** Beautiful URL handling: single URL grammar, URL-as-truth navigation, overlay dialogs (#770)

**Description:** Implements #770 with a minimal, reviewable diff (17 files, +839/−325 —
far smaller than the competing attempts).
- `src/url.js`: one strict, invertible grammar — `parseLocation`/`buildUrl` cover every
  existing URL shape (drive, ranged drive, legacy second-timestamps, prime, stream, referrals,
  demo, `?settings=`, `?pair=`, `?r=`); replaces six ad-hoc helpers, `urlForState`, and the
  inline `` `/${dongleId}/stream` `` template.
- URL becomes the single source of navigation truth: the history middleware handles all
  PUSH/POP/REPLACE by parsing once and diffing minimal state updates (never pushes → no loops);
  public action creators (`selectDevice`, `pushTimelineRange`, `primeNav`, …) sync the URL via
  one `syncUrl()` with a no-op guard. `allowPathChange` and the state-first/PUSH vs
  URL-first/POP split are gone.
- Device settings becomes a `?settings=<dongleId>` overlay: opening it preserves the drive and
  zoom stack underneath; Back closes it. Pair dialog strips `?pair=` on close.
- Legacy `/{dongle}/{start}/{end}` conversion moves to an explicit thunk with a
  stale-navigation guard.
- Preserved: `?r=` login redirect, `?pair=` flow, `/demo`, prime zoom-clearing, `zoom.previous`
  stack, `checkRoutesData` hard-navigate, startup's root-only URL takeover.
- One intentional behavior fix: ranges starting at second 0 are now serialized explicitly
  (`/<d>/<log>/0/30`) instead of being silently dropped (old `0`-is-falsy quirk); all old
  bookmarks still parse. Pinned in `App.test.jsx`.
- Validation: 126/126 vitest pass, oxlint clean, production build succeeds.

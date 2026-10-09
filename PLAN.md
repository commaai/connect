# PLAN — Issue #770 "Beautiful URL Handling" (branch `beautiful-urls-770`)

## Architecture

**One grammar module (`src/url.js`).** `parseLocation({pathname, search})` → canonical nav state
`{ page, dongleId, routeId, zoom(ms)|null, legacy(sec)|null, settings, pair }`; `buildUrl(nav,
{routeDuration})` → canonical URL string. Strict inverses for every canonical shape; anchored
regexes; NaN/invalid → safe fallback (`page: 'unknown'`, never throws). Covers: `/`, `/referrals`,
`/demo`, `/<dongle>`, `/<dongle>/prime`, `/<dongle>/stream`, `/<dongle>/<route>`,
`/<dongle>/<route>/<s>/<e>` (ms), legacy `/<dongle>/<s>/<e>` (sec), `?settings=`, `?pair=`, `?r=`
(consumed at boot, not nav state). Also `withQuery(location, patch)` for query-param overlays.

**URL as single source of navigation truth.** `src/actions/history.js` middleware handles *every*
`LOCATION_CHANGE` (PUSH, POP, REPLACE): parse once → diff against state → dispatch minimal
state-only updates. Never pushes URLs itself, so no loops are possible. PUSH is now applied (was
ignored); POP/REPLACE keep today's semantics.

**State-only cores + thin public creators (`src/actions/index.js`).** `selectDeviceState`,
`pushTimelineRangeState` do state updates only (timeline stack, playback `resetPlayback`/`selectLoop`,
prime zoom-clearing via reducer — all unchanged). Public `selectDevice`, `pushTimelineRange`,
`popTimelineRange`, `primeNav`, `streamNav` = core + single `syncUrl()` that serializes via
`buildUrl` and pushes only when the URL differs. `allowPathChange` eliminated; `urlForState` and the
inline `` `/${dongleId}/stream` `` template deleted. Query params preserved across syncs except
`selectDevice` drops device-scoped `?settings=`.

**Pages derived at render; dialogs as query overlays.** No react-router route table (matches the
convention every serious PR converged on), no new deps. Device settings modal lifted from
`DeviceList` local state to `Explorer`, driven by `?settings=<dongleId>` — the open drive and zoom
stack stay intact underneath (key differentiator vs settings-as-page PRs). Pair flow keeps its
`?pair=<token>` trigger (documented in the grammar); closing the dialog now strips `?pair=` from
the URL. Clips/files/uploads dialogs stay local (out of scope — sprawl).

**Legacy conversion as explicit thunk.** `resolveLegacyZoom(dongleId, start, end)` with a
stale-navigation guard (re-parses current location before applying). Out of the middleware hot path.

**Preserved:** `?r=` login redirect, `?pair=` pairing flow, `/demo` backend selection, primeNav
zoom-clearing reducer side effect, `zoom.previous` stack, `checkRoutesData` hardNavigate, all URL
shapes. One intentional fix: `urlForState` dropped a range starting at second 0 (`0` is falsy);
`buildUrl` serializes it (`/<d>/<log>/0/30`) — more predictable, old bookmarks still parse.

## Files to modify

1. `src/url.js` — rewrite: `parseLocation`, `buildUrl`, `withQuery`. Delete 6 ad-hoc helpers.
2. `src/actions/index.js` — state cores + public creators + `syncUrl` + `resolveLegacyZoom`;
   delete `urlForState`, `updateTimeline`, `allowPathChange`.
3. `src/actions/history.js` — unified middleware (PUSH/POP/REPLACE), single parse, legacy thunk.
4. `src/actions/startup.js` — drop `allowPathChange` arg.
5. `src/initialState.js` — single `parseLocation` call.
6. `src/App.jsx` — `parseLocation` for login-gate + webrtc reconnect.
7. `src/analytics.js` — `parseLocation` for page-view anonymization.
8. `src/components/explorer.jsx` — referrals via parser; settings modal lifted to URL overlay;
   pair-dialog URL cleanup on close.
9. `src/components/Dashboard/DeviceList.jsx` — settings button pushes `?settings=`; remove local
   modal state.
10. `src/components/Dashboard/DriveListItem.jsx`, `src/components/DriveView/index.jsx`,
    `src/components/Timeline/index.jsx`, `src/components/Dashboard/DeviceSettingsModal.jsx` —
    drop `allowPathChange` args (calls unchanged otherwise).
11. Tests: rewrite `src/url.test.js`, `src/actions/history.test.js`, `src/actions/index.test.js`.

## Validation

`bun run test` (vitest, full suite), `bun run lint` (oxlint), `vite build` (production).
New tests: parser/serializer round-trips incl. legacy + invalid; middleware PUSH/POP/REPLACE,
no-op guard, legacy thunk + stale guard, overlay open/close, zoom preservation.
Manual verification needed (no live browser here): deep-link drive + settings overlay, Back/Forward
through zoom stack and overlays, `?pair=` flow, `/demo`, login `?r=` redirect.

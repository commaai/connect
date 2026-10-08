# Routing and state ownership

## One direction

`history.location → parseUrl → ROUTE_CHANGED → routeReducer → render/load`

`src/routing/routes.js` owns the URL grammar and serialization. Every PUSH,
POP and REPLACE passes through `src/actions/history.js`. UI actions navigate;
they do not also mutate selection. Startup parses the supplied history location
with the same parser. The authentication callback and demo backend selection
remain application bootstrap concerns.

## URL contract

| Surface | URL |
| --- | --- |
| Device dashboard | `/:device` |
| Drive | `/:device/drive/:drive` |
| Drive range (seconds, including fractional seconds) | `/:device/drive/:drive/:start/:end` |
| Prime | `/:device/prime` |
| Teleoperation | `/:device/stream` |
| Referrals | `/referrals` |
| Settings, standalone | `/:device/settings` |
| Add device, standalone | `/devices/add` |
| Pairing status | `/devices/pair` |
| Settings over the current page | `?dialog=settings` |
| Settings for another device over the current page | `?dialog=settings&device=:device` |
| Add device over the current page | `?dialog=add-device` |
| Device clip library | `/:device?dialog=clips` |
| Clip creation over a drive | `?dialog=clip` |
| Upload queue | `?dialog=uploads` |

Dialog queries are appended to a page URL. They preserve the underlying drive
and its range. Opening a dialog records its parent history entry; Close/Escape
returns there. A directly opened link safely replaces itself with the underlying
page. Nested dialogs therefore support browser Back and Forward naturally.
Pair tokens still use the existing `pair` query handoff; pairing results, camera
streams, form drafts, menus and destructive-action confirmations stay local.

Legacy `/:device/:drive[/:start/:end]` links are accepted and replaced with the
explicit drive form. Legacy absolute timestamp ranges use an asynchronous lookup;
its result is ignored if navigation has moved on. Invalid IDs, path shapes,
non-finite numbers and reversed ranges produce an explicit unavailable-page UI.

## State boundaries

- `state.route`: parsed page, device, drive, range, and dialog. This is navigation's
  source of truth. Flat `primeNav`, `streamNav`, `selectedRouteId` and `zoom` fields
  remain projections for existing components, not separate navigation inputs.
- `routeEntities`: loaded drives indexed by full device + drive name. Deep-link
  fetches do not replace a loaded dashboard list.
- `deviceCache`: per-device dashboard filter, list, files, subscription and queue
  snapshots restored when switching devices. Existing visibility refreshes and
  explicit refresh/pagination continue to update data. Caches live for this tab's
  session and are not persisted across reloads.
- Playback remains operational state. Dialog changes and repeated locations keep
  the same drive, zoom, loop and playback references; range changes reuse data
  and move playback to the requested start.
- Requests include device, drive, filter and limit in their identity. Superseded
  completions cannot overwrite the current selection.

Reducers use pure playback calculations; they no longer import the singleton
store through playback helpers or device defaults.

## Adding a route or argument

1. Extend `parseUrl` and `serializeUrl` together, with validation and round-trip
   coverage in `src/url.test.js`.
2. Use `navigate`, `openDialog`, and `closeDialog` from `src/routing/actions.js`.
   Build link hrefs with `serializeUrl`.
3. Render from `state.route`. Add data effects to the history/load boundary only
   when their cache key changes; never reset unrelated state in a click handler.
4. Add a cold-entry and Back/Forward case to `src/App.test.jsx`. State reuse cases
   belong in `src/routing/reducer.test.js`.

Settings and pairing share `src/routing/panel.js`: a bounded desktop panel and
an inset-aware mobile sheet, using the existing modal focus/Escape handling.

# Navigation

The URL selects the visible page, drive range, and dialog. Redux keeps loaded
data and playback state. Opening a dialog on the same drive does not reload the
drive or restart playback.

## URL contract

`D` is a 16-character lowercase hexadecimal device ID. `R` is a timestamp route
ID (`2026-08-06--12-00-00`) or a modern route ID (`0000010a--a51155e496`).

| Path | View |
| --- | --- |
| `/` | Remembered device, or first device in the sorted sidebar |
| `/demo` | Demo dashboard |
| `/D` | Device dashboard |
| `/D/R` | Entire drive |
| `/D/R/start/end` | Drive range, in seconds with up to three decimal places |
| `/D/startMs/endMs` | Legacy timestamp lookup; replaced with the resolved drive URL |
| `/D/prime` | Prime subscription or checkout |
| `/D/stream` | Live stream |
| `/referrals` | Referrals |
| `/auth` | Authentication callback |
| `/D/settings` | Alias for `/D?modal=settings` |

Ranges start at or after zero, end strictly after their start, and resolve to
safe integral milliseconds. For example, `/D/R/1.001/2.002` means 1001–2002 ms,
without rounding to whole seconds. Invalid paths render a not-found screen.
After metadata arrives, an end beyond the drive duration is shortened with a
URL replacement that preserves query and hash. A start outside the drive shows
an error and a **View full drive** action instead of playing a different range.

Dashboard dates use `?from=startMs&to=endMs`, for example
`/D?from=1790812800000&to=1790985599999`. Both values are required, nonnegative
safe integers within JavaScript's date range, with `to` strictly greater than
`from`. Missing, invalid, or duplicated values do not select a custom filter.
Dates are epoch milliseconds; a drive's path range remains relative seconds.
Drive links carry explicit dashboard dates so closing the drive restores its
filtered list. Dashboard links without dates use the existing one-year default.
Saving the filter replaces its dialog entry; Back restores the prior filter.

Dialogs use query arguments, keeping their background view:

| `modal` | Supported background |
| --- | --- |
| `settings`, `settings-unpair`, `settings-uploads` | Any application page with a settings device |
| `add-device` | Any application page |
| `filter`, `device-clips` | Dashboard |
| `drive-info`, `drive-files`, `drive-clips`, `drive-uploads` | Drive |
| `prime-cancel`, `prime-switch` | Prime |

Settings default to the device in the path. `modalDevice=D` explicitly selects a
different settings device without changing the drive underneath. The settings
path alias always addresses its path device. Owner/superuser checks still apply.

Prime accepts `plan=data` or `plan=nodata`. Clip libraries accept
`clip=filename.mp4&clipAction=view` or `clipAction=delete`. These URLs select UI;
destructive operations still require an explicit confirmation button click.
Pending Prime portal/checkout responses belong to their initiating location,
device and request. Navigation, unmount or a newer attempt invalidates them, so
a late response cannot redirect the user away from their current view.

Invalid or repeated managed query selectors are ignored for the affected view:
ambiguous dialogs do not open, ambiguous plans do not select a plan, and ambiguous
clips do not select a clip. The background page remains usable. Unrelated query
arguments and hashes survive dialog opening, closing, and alias normalization.

## Data flow

1. `parseLocation` in `src/url.js` validates the complete location and returns a
   normalized view description. `pathForState`, `withFilter`, `withModal`, and `withClip` build
   destinations. `selectLocation` reuses parsed results while the URL is unchanged.
2. Actions in `src/actions/navigation.js` push or replace a location. Components
   request navigation instead of toggling competing global page flags.
3. `onHistoryMiddleware` applies initial, PUSH, REPLACE, and POP locations through
   the same path. It changes device/drive/range only when needed and requests
   missing data. Async legacy lookup results cannot redirect newer navigation.
4. Metadata reducers reconcile the selected drive once its duration is known.
   Ranges are checked against that duration before playback. Network failures
   display recovery controls instead of leaving a permanent loading state.

`initialState.js` uses the same parser before the first render. Startup loads
profile/devices and resolves `/` while retaining its query and hash. Auth return
links go through `safeReturnTo` and must remain on a supported internal page.

## State ownership and lifetime

| State | Owner and lifetime |
| --- | --- |
| Page/dialog/clip selection | Router location; reload and browser history restore it |
| Active device and drive selection | Reconciled from location by history middleware |
| Dashboard date filter | Explicit `from`/`to` URL values, or the default dashboard range; independent of drive zoom |
| `deviceSession` | Increments on device selection; pending requests from earlier visits cannot affect a later visit to the same device |
| Dashboard `routes`, `lastRoutes`, `routesMeta` | Filtered/paginated list; single-drive fetches never claim list coverage |
| `routeCache` | Enriched drive metadata and explicit missing results for the active device |
| Files and upload status | Active device; responses from obsolete requests cannot overwrite the current device |
| Playback offset, speed, and loop | Preserved across overlays; same-drive range changes keep speed/pause while updating the loop; a different drive resets playback |
| Unsaved settings/form input | Component state; discarded on close, retained while navigating nested settings dialogs |
| Camera and media resources | Owning component; cleaned up when that view closes |

A route cache entry includes events, coordinates, and location enrichment.
Enrichment reads the cache as well as the dashboard list, so an old deep-linked
drive does not trigger a repeated fetch/dispatch loop. Cache changes never add
out-of-filter drives to the dashboard. Caches reset when the device changes.

Enrichment request maps own only in-flight work. Concurrent callers share the
same request; success, failure and an empty geocoder result all settle and remove
that pending entry. A later visit can retry without reloading the application.
Network/server failures are not cached as successful empty data; missing (404)
segments retain the existing empty-segment behavior. IndexedDB is optional:
failed reads fall back to the network, and failed writes do not discard loaded
data. Successfully loaded data remains in Redux and, when available, IndexedDB.

Dialog history entries record their opener. Close goes Back only when that
opener matches the expected parent; a pasted link replaces itself with its
parent. Zoom ancestry belongs to the destination history entry, so browser Back
cannot create a chain pointing into the future. The drive back arrow retains
stepwise zoom-out behavior; browser Back/Forward restore their recorded ranges.

## Extending navigation

Add a path or query selector to `url.js` first, with parser/builder round-trip
tests. Declare where a dialog is valid and how malformed/duplicate selectors are
handled. Then connect the component to the parsed location and make its triggers
request navigation. Global dialogs belong outside the responsive drawer.

Fetch data only when it is missing. Guard asynchronous results by device and
request identity; data arriving after navigation may enrich an applicable cache,
but must not replace the current selection. Keep network effects out of reducers.

Test cold entry, reload-equivalent initial state, PUSH/REPLACE/Back/Forward,
closing, unauthorized access, and stale responses. Assert reference reuse for
unrelated navigation, not just identical values. Whole-app coverage lives in
`src/App.test.jsx`; URL, history, cache, file queue, clip, and camera tests cover
the corresponding boundaries.

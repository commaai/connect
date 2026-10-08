# Navigation URLs

The browser location is the authority for page, device, drive selection and major
modal selection. `src/url.js` parses/validates that location. User controls issue
history commands; `src/actions/history.js` handles every `LOCATION_CHANGE`
(PUSH, POP, REPLACE and initial entry) and updates the existing Redux projections.
Components render those projections and the parsed page/modal. There is no
state-to-URL observer or second routing framework.

## Pages and major modals

| URL | View |
| --- | --- |
| `/` | Select the remembered available device, otherwise the first available device; show pairing when there are no devices |
| `/demo` | Existing demo backend and default demo dashboard |
| `/:dongleId` | Device dashboard |
| `/:dongleId/:logId` | Whole drive, including public shared drives |
| `/:dongleId/:logId/:start/:end` | Drive range; offsets in seconds, up to three decimal places (exact milliseconds) |
| `/:dongleId/:startMs/:endMs` | Compatible absolute timestamp link; look up its drive, then replace this entry with the corresponding relative range |
| `/:dongleId/prime` | Prime checkout or subscription management, according to account/device data |
| `/:dongleId/stream` | Teleoperation |
| `/referrals` | Referrals |
| `/auth/` | Existing OAuth return flow |
| `?modal=settings` | Device settings above the current dashboard or drive |
| `?modal=uploads` | Upload queue above the current dashboard or drive |
| `?modal=pair` | Pairing scanner above home, dashboard, drive, Prime or referrals |
| `?modal=filter` | Dashboard date filter |
| `?modal=clips` | Dashboard clip inventory or drive clip creation/inventory |

Modal queries also work on `/` and `/demo` after their default device is loaded;
settings, uploads, filter and clips require a selected device. Direct aliases
`/:dongleId/settings` and `/:dongleId/uploads` open the corresponding modal above
that dashboard. Closing them returns to `/:dongleId`.

`setModal` retains the entire background pathname, other query arguments, hash
and local history state. Opening settings for a different sidebar device
intentionally navigates to that device's dashboard first. Closing a modal pushes
the background URL, so browser Back reopens it and Forward closes it. Direct entry
and refresh use the same parser and modal host. Direct URLs display UI; writes
still require the existing explicit user controls.

Account menus, file/info menus, map/video choice, mute, draft inputs, clip preview
blob URLs, tooltips, onboarding hints, unpair/clip-delete/subscription confirmation
steps and teleop settings remain local workflow state. They are not independent
pages. Parent modal close or owner change invalidates local confirmations and
pending scanner/clip work. Pairing token completion/error feedback remains owned
by the existing one-shot pairing flow; opening the scanner does not pair a device.

## Validation and reuse

Dongle IDs match exactly 16 lowercase hex characters. Log IDs accept both the
existing date/time form and the newer `8 hex--10 hex` form. Unknown paths show a
missing-page message for signed-in users; protected paths retain the login gate
for signed-out users. Missing, negative, reversed, nonfinite, overprecision,
unsafe or extra drive-range arguments select the whole valid drive. Once metadata
loads, a range beyond the end is clamped; a start beyond the drive selects the
whole drive. Legacy lookup failure/empty results keep the original URL; results
from an abandoned entry cannot replace subsequent navigation.

Unknown, repeated or inapplicable `modal` arguments are ignored. Other query
arguments are preserved and do not affect navigation. Existing OAuth `code` and
`provider`, pairing `pair`, login-return `r`, Stripe completion/cancellation and
analytics `ci` payloads remain owned by their features; login-return targets must
be supported local pages.

A query-only transition does not select a drive, clear files, reset the loop or
command playback. The background DriveView/video/map component tree stays
mounted. A changed range reuses the current route and loaded assets, and issues
an intentional playback reset/loop selection. Range-back predecessors are local
history-entry state, so browser Back/Forward and intervening modal entries cannot
make the range button oscillate. They do not override the URL's current range.

Route metadata requests belong to each store and are keyed by device, selected
route, filter and limit. Obsolete responses cannot replace current selection.
Metadata loaded for one cold drive is marked separately from a full dashboard
listing; opening a drive already present in a dashboard reuses that data.

## Adding a route or argument

1. Extend `parseNavigation` and its validation in `src/url.js`; add a formatter
   when the route has parameters. Add parser/round-trip cases in `src/url.test.js`.
2. For a new major modal, add its permitted background pages to `modalPages` and
   render it once in `NavigationModals`. Open/close it with `setModal`; keep draft
   values and async ownership inside the feature.
3. Only add a history projection if data/playback consumers need it. Apply it in
   `onHistoryMiddleware` when the relevant parsed identity changes, never from a
   component effect that writes the URL back. Rendering-only query arguments can
   read the parsed descriptor directly.
4. Cover direct entry, history traversal and retained objects/component identity.
   Use the real public demo source documented in `src/test-data/README.md`, or
   browser primitive/command checks that need no invented records. Test doubles
   are unit evidence; verify actual media behavior at `/demo` separately.

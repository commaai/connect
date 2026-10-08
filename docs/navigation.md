# URL navigation

`src/url.js` is the URL grammar. UI navigation actions write history; the
`LOCATION_CHANGE` middleware publishes that location, parses it, and reconciles
the selected device and drive for PUSH, REPLACE, and browser Back/Forward alike.
Components derive page/dialog visibility from that same parsed location.

## Paths

| URL | View |
| --- | --- |
| `/` | Sign-in or the selected/default device |
| `/demo` | Demo device dashboard |
| `/referrals` | Referrals |
| `/:device` | Device dashboard |
| `/:device/prime` | Prime |
| `/:device/stream` | Livestream |
| `/:device/:drive` | Whole drive |
| `/:device/:drive/:start/:end` | Drive range in relative seconds, up to millisecond precision |
| `/:device/:startUtcMs/:endUtcMs` | Legacy link; resolves to a drive and replaces the entry |

Device IDs are 16 lowercase hexadecimal characters; drive IDs are 20 hexadecimal
characters or hyphens, matching existing route IDs. Relative ranges include zero,
must be increasing nonnegative safe millisecond values, and are bounded to the
loaded drive. Invalid ranges select the whole drive; unknown path suffixes fall
back to the device dashboard. Invalid device IDs select the home page.

## Dialogs

Add `?dialog=...` to preserve the underlying page:

- `settings`, `settings-uploads`, `unpair`: optionally `&device=:device` targets
  another owned device. Existing owner/superuser checks still apply.
- `pair`, `filter`: device pairing and the date filter.
- `files`, `info`, `uploads`: drive file list, drive information, upload queue.
- `clips`: device clip inventory, or clip creation on a drive.
- `clip`, `delete-clip`: include `&clip=:filename` for preview or confirmation.
- `prime-switch`, `prime-cancel`: subscription confirmation on the Prime page.

Drive dialogs require a drive path; clip dialogs require a dashboard or drive;
billing dialogs require Prime. Invalid dialog/device/filename arguments are
ignored. Filenames allow letters, digits, dots, underscores, and hyphens, with an
alphanumeric first character and at most 255 characters.

Opening a dialog pushes an entry. Closing an entry opened by the app goes Back;
closing a cold link replaces it with its parent dialog/page. Other query
parameters and the hash survive dialog changes and legacy conversion. Sign-in
continuations preserve the complete encoded path, query, and hash. Visiting a
confirmation URL never performs its mutation.

## Reuse and extensions

The dashboard list and individual-drive cache have separate lifetimes. A cold
drive fetch cannot masquerade as a complete dashboard; returning to the dashboard
loads its list. Identical pending metadata requests share a promise within one
store. Device-session revisions and navigation revisions reject stale results.
Dialog-only changes and repeated effective drive ranges preserve playback,
metadata, file state, and map/timeline data. Route/device identity keys isolate
local forms and transactional UI when changing their target.

To add a route or dialog, extend the parser/builder and its validation first,
derive visibility from the parsed location, and navigate through history actions.
Add cold-entry and Back/Forward tests, plus stale-response tests for new async
effects. Keep local form values and DOM menu anchors in component state.

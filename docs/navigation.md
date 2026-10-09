# Navigation

The URL describes the visible page and dialog. `parseLocation` in `src/url.js`
normalizes it once. Initial state and the history middleware use that same
parser, rather than independently interpreting path segments.

## Page paths

| Path | Page |
| --- | --- |
| `/` | Default device dashboard |
| `/demo` | Public demo entry, canonicalized to its device |
| `/{device}` | Device dashboard |
| `/{device}/{route}` | Entire drive |
| `/{device}/{route}/{start}/{end}` | Drive range, in seconds |
| `/{device}/prime` | Prime subscription |
| `/{device}/stream` | Livestream/teleoperation |
| `/referrals` | Referrals |
| `/auth/...` | Authentication callback, not an explorer route |

Device IDs must be exactly 16 lowercase hexadecimal characters. Route IDs use
the existing 20-character hexadecimal/dash format. Ranges must be nonnegative,
ordered, finite, and representable as safe integer milliseconds. Drive ranges
accept up to three decimal places; `0/20.125` preserves a zero start and a
20,125 ms end. Incomplete ranges and extra path segments are not interpreted as
valid drive links.

Legacy `/{device}/{startMs}/{endMs}` links are resolved to an entire drive and
canonicalized with **replace**, not push. A response from a previous page cannot
redirect a newer page; a dialog opened during the lookup is retained.

## Dialog arguments

Dialogs use `?dialog=...` on the page underneath them. This retains the drive
and its exact range, and makes browser Back/Forward restore dialog visibility.

| Argument | Context |
| --- | --- |
| `settings`, `unpair` | Device settings and unpair confirmation |
| `uploads` | Device or drive upload queue |
| `pair` | QR pairing |
| `date-range` | Dashboard date filter |
| `account` | Account menu; Manage account still opens the existing external site |
| `cancel-subscription`, `change-plan` | Prime management |
| `downloads`, `info`, `clips` | Drive menus |
| `clip-preview`, `clip-delete` | A drive clip's preview or delete confirmation |

`settingsDevice={device}` targets another device without selecting it or
discarding the background drive. Settings-originated upload queues include this
argument; drive queues do not. A dashboard upload link without an explicit
target uses that dashboard's device.

`clip={filename}` identifies a clip for preview or delete confirmation. The
filename is URL-encoded and must match a record returned by the device's clip
list. A URL never directly authorizes deletion or supplies an arbitrary file
to a download API. Destructive operations still require the existing explicit
confirmation.

For example:

```text
/0000aaaa0000aaaa/2026-08-06--12-00-00/0/20.125?dialog=settings&settingsDevice=1111bbbb1111bbbb
/0000aaaa0000aaaa/prime?dialog=change-plan
/0000aaaa0000aaaa/2026-08-06--12-00-00?dialog=clip-preview&clip=my+clip.mp4
```

`openDialog` preserves unrelated arguments and hashes, and pushes only when
the requested dialog changes. `closeDialog` replaces the current entry, so a
cold-linked dialog can close without navigating outside the app. Nested
dialogs can close to a parent with `closeDialog('settings')` or
`closeDialog('clips')`. Reserved target arguments are removed when no longer
needed. Form fields, loading states, and submission errors remain local;
visibility comes from navigation state.

## Reconciliation and reuse

The history middleware handles PUSH, POP, and REPLACE uniformly. It forwards
the router action first, stores normalized navigation, and reconciles only
changed device/drive state. Actions dispatched during reconciliation cannot
write another history entry. Query-only dialog changes do not reselect the
device, reset playback, or refetch route metadata.

Same-device drive navigation reuses loaded routes. Selecting a drive outside
the cache fetches that drive and retains previously loaded drives. Responses
from superseded requests cannot overwrite the current device or selection.

To add a page, extend `parseLocation` and the path formatter, then add parser
and whole-app history tests. To add a dialog, register its name/context in
`src/url.js`, use `openDialog`/`closeDialog`, and derive visibility from
`state.navigation.dialog`. Test a cold URL, Back/Forward, and dismissal—not
only a button click.

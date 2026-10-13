# Navigation

The URL selects the page, drive range, and open dialog. Redux retains fetched data
and playback state; components retain temporary inputs and request progress.

## Flow

1. Navigation actions in `src/actions/index.js` write a location to history.
2. `LOCATION_CHANGE` runs `syncLocation` in `src/actions/history.js` for pushes,
   replacements, and browser Back/Forward.
3. `parseLocation` in `src/url.js` validates the location and creates one
   `navigation` value. `applyNavigation` in `src/reducers/navigation.js` derives
   device/drive selection and playback range from it.
4. `syncLocation` requests missing device or route data. When metadata arrives,
   the reducer derives the selected drive again from the current navigation.
5. Components render the page and dialog described by `state.navigation`.

Startup uses the same flow after profile and devices load. Choosing the default
device and converting a legacy timestamp URL replace the current history entry.
Async legacy conversion checks that the location is still current before replacing it.

## URLs

Existing paths remain supported. Here `device` is a dongle ID and `drive` is a log ID.

| Path | View |
| --- | --- |
| `/`, `/demo` | Default device, or pairing when no device is available |
| `/referrals`, `/auth/` | Referrals and authentication |
| `/:device` | Device dashboard |
| `/:device/:drive` | Whole drive |
| `/:device/:drive/:start/:end` | Drive range, in seconds including fractions |
| `/:device/prime`, `/:device/stream` | Prime and livestream |
| `/:device/:start/:end` | Legacy absolute timestamps in milliseconds |

`?dialog=...` opens a dialog over the selected page:

- `pair`, `filter`: pairing and date filter.
- `settings`, `settings-uploads`, `unpair`: device settings and its nested views.
  Optional `device=<dongle ID>` targets another device while retaining the page.
- `files`, `info`, `uploads`: drive menus and upload queue.
- `clips`, `clip`, `delete-clip`: clip inventory, viewer, and confirmation.
  The last two require `clip=<filename.mp4>`.
- `switch-prime`, `cancel-prime`: Prime confirmations.

The parser checks each dialog's required page and parameters. A confirmation URL
opens the confirmation; the user still presses its action button. Unrelated query
parameters and the hash survive dialog changes, normalization, and authentication.

`openDialog` records the parent location in the new history entry. Closing returns
to that parent with Back when available; a direct link replaces itself with its
parent view. Nested settings and clip dialogs follow the same rule.

## Data and playback

Changing a dialog preserves the current drive, loaded routes, files, filter,
playback position, and speed. Changing the effective drive range resets playback.
A whole-drive URL and an explicit `0/duration` range have the same effective range.
Application ranges use milliseconds, so zero starts and fractional seconds survive
round trips through the URL.

Timeline selections record their parent location in history. The drive's Go Back
button returns one zoom level when that parent belongs to the same drive; a direct
range link falls back to the whole drive. Browser Back/Forward follows those same
locations without a second range stack in Redux.

Dashboard lists and individual drive metadata have separate caches. Opening a
drive directly does not mark a partial list as a loaded dashboard. Requests are
deduplicated by device and requested list/range or drive; a late response can fill
its cache without selecting the wrong drive. File responses must match the active
drive, and closing an upload dialog invalidates its pending polling request.

To add a page or dialog, extend `parseLocation`/`pathFor` and its rendering branch,
then add any necessary effects to `syncLocation`. Keep button actions as history
writes. Cover direct loading, Back/Forward, closing a direct-linked dialog, and
preservation of unrelated state in the URL, history, or application tests.

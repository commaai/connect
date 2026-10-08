# Navigation and application state

The URL owns navigation. Use this flow for links, buttons, and browser history:

```
push / replace / back / forward
  → connected-react-router LOCATION_CHANGE
  → url.js parseLocation
  → reducers/navigation.js
  → render from state.navigation
  → actions/history.js loads missing data
```

The store is initialized from its own history's location. A refresh and a client-side
navigation use the same parser. Navigation actions in `actions/navigation.js` only
write history; they do not select devices or drives in Redux first. History effects
run after the reducer, for every history action, and never write navigation fields.
The one asynchronous redirect converts old timestamp links, using `replace` only if
the user is still at the location that requested the conversion.

## URLs

| URL | Destination |
| --- | --- |
| `/` | Dashboard; startup chooses the saved device or the first available device |
| `/:dongleId` | Device dashboard |
| `/:dongleId/:routeId` | Whole drive |
| `/:dongleId/:routeId/:start/:end` | Drive range in seconds (decimal seconds supported) |
| `/:dongleId/prime` | Prime checkout or management |
| `/:dongleId/stream` | Livestream / teleoperation |
| `/referrals` | Referrals |
| `/demo` | Demo dashboard; the synthetic device's existing URLs also work |
| `/:dongleId/:startTimestamp/:endTimestamp` | Legacy absolute millisecond range, resolved to a drive |

Add a modal to the page underneath it with a search parameter:

| Search parameters | Modal |
| --- | --- |
| `?modal=settings&device=:dongleId` | Device settings |
| `?modal=uploads&device=:dongleId` | Upload queue |
| `?modal=clips&device=:dongleId` | Clip inventory; drive pages also offer clip creation |
| `?modal=clips&device=:dongleId&clip=:filename` | Clip preview (requires an available device and clip) |
| `?modal=pair` | Pair a device |
| `?modal=filter` | Date filter on a device dashboard |

Device modals default to the device in the path if `device` is omitted. An explicit
`device` can refer to another device without changing the underlying page's selection.
`openModal` preserves other query parameters and the hash. Close returns to the parent
history entry for modals opened in the app; a cold link closes in place using `replace`.
History state records only whether an in-app parent exists; rendering never depends
on that history state. Settings drafts survive opening and closing their upload queue.

Unknown paths fall back to the dashboard. Invalid device/route IDs are not accepted
as partial matches. Invalid or incomplete drive ranges select the whole drive. Once
a drive is loaded, its requested range is bounded by its duration; a start beyond the
end selects the whole drive. Unknown modal names and invalid modal arguments are
ignored. An unavailable modal device displays a closable message; an unavailable
clip leaves its inventory open. Empty or failed
legacy lookups leave the original URL intact. Unrelated query arguments are ignored
by navigation and retained when opening/closing modals. Stripe return arguments are
read by the parser, so query-only history changes update Prime too.

Authentication callbacks (`/auth`), pairing tokens (`pair`), and login return links
(`r`) are startup protocols. Their credentials and results are handled by the existing
authentication/pairing code, not stored as navigation state. Sign-in retains the full
requested path, search, and hash.

## State ownership and lifetime

- **Navigation:** `state.navigation` is the parsed URL. Its route ID and modal are
  never independently edited. The selected device (`state.dongleId`) retains context
  on account pages such as referrals, which have no device argument.
- **Application data:** Redux owns the profile, devices, subscriptions, route metadata,
  and files. `routes` is the filtered dashboard list. `routeCache` retains loaded drives
  for the selected device, including drives fetched through deep links. A single-drive
  response cannot replace the dashboard list or mark that list as loaded.
- **Playback:** `currentRoute` and effective `zoom` are derived from navigation and
  available metadata. A changed drive or range resets playback. Modal/query-only
  changes preserve playback and data references. Browser history also replaces the
  old manually maintained stack of previous zoom ranges.
- **Local UI:** Form drafts, menus, media controls, progress, and destructive-action
  confirmations stay local. A drive's media stays mounted through range/modal changes;
  changing the drive resets its local state. Leaving the drive releases its media.
  Camera scanning, clip URLs, and upload polling are cleaned up when their owning
  views close, including closing through browser history.

Device changes invalidate device-scoped data, while retaining the profile and device
list. Requests are deduplicated per store and per drive/filter, and results from an
obsolete device visit or filter are ignored. A late drive response may populate the
active device's cache, but cannot change the selected drive. Caches last for the active
device session; this is intentionally not a new persistent or multi-device cache layer.

## Adding a route or argument

1. Extend the documented `Navigation` shape and parser in `url.js`; add a URL builder
   if the destination needs arguments. Keep parsing pure and validate each argument.
2. Render the page from `state.navigation.page` or add the overlay to `NavigationModals`.
   Use `navigate`, `openModal`, or a normal router link to reach it.
3. If new data is needed, add an effect keyed to the relevant navigation arguments.
   Do not reset unrelated data or introduce a state-to-URL effect.
4. Cover parsing/serialization, cold entry, Back/Forward, and the affected state lifetime.

This keeps React Router 5 and the existing Redux store. Replacing the router, moving
all application data to URL state, or introducing a second navigation store would add
migration and synchronization work without improving this application's route model.

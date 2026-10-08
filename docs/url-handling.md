# URL handling

`src/url.js` defines page paths and dialog query names. `parseUrl` returns a page,
device, drive, optional range, and dialog. `buildUrl` builds page links;
`withModal` changes dialog parameters while preserving other query parameters.

Navigation actions write history. `src/actions/history.js` applies PUSH, REPLACE,
and POP through one sequence: publish the location, select a changed device,
update a changed drive path, fetch device metadata, and apply Prime/stream state.
Dialog-only navigation preserves the drive, playback, and loaded routes. Stale
legacy timestamp lookups cannot redirect after newer navigation.

Supported pages: device dashboard, whole/ranged drive, legacy timestamp range,
Prime checkout/management, stream, and referrals. Supported dialog names:
`settings`, `unpair`, `uploads` (with `device`), `date`, `pair`, `prime-cancel`,
and `prime-switch`. Dialogs use `?modal=:name` over a page URL.

Run `bun run test` for parser, cold-entry, browser-history, dialog, and state-reuse
coverage. Clip preview/deletion dialogs and route upload-menu navigation still
need URL integration before complete modal coverage can be claimed.

# URL handling

`src/url.js` defines page paths and dialog query names. `parseUrl` returns a page,
device, drive, optional range, and dialog. `buildUrl` builds page links;
`withModal` changes dialog parameters while preserving other query parameters.

Navigation actions write history. `src/actions/history.js` applies PUSH, REPLACE,
and POP through one sequence: publish the location, select a changed device,
update a changed drive path, fetch device metadata, and apply Prime/stream state.
Dialog-only navigation preserves the drive, playback, and loaded routes. Stale
legacy timestamp lookups cannot redirect after newer navigation.
Successful legacy conversions replace their history entry and retain query
arguments and hashes, so Back does not revisit the redirect. Dialog navigation
also preserves the current hash.
Returning to the previous drive range restores the existing zoom selection only
after history publishes its URL. Referrals rendering also uses the parsed page,
including trailing-slash URLs. Shared device, pairing, and clip dialog hosts stay
mounted over both normal pages and the stream view.

Supported pages: device dashboard, whole/ranged drive, legacy timestamp range,
Prime checkout/management, stream, and referrals. Supported dialog names:
`settings`, `unpair`, `uploads` (with `device`), `date`, `pair`, `prime-cancel`,
and `prime-switch`. Dialogs use `?modal=:name` over a page URL. Clip preview and
deletion confirmation use `?modal=clip&device=:id&clip=:filename` and
`?modal=clip-delete&device=:id&clip=:filename`. The filename is encoded as a query
value and resolved against the device's clip inventory. Deletion always requires
confirmation; missing clips and offline devices display a closeable error.

Run `bun run test` for parser, cold-entry, browser-history, dialog, and state-reuse
coverage. The drive's upload-menu action opens the shared `uploads` dialog;
closing it returns to the same drive path and retains loaded data.

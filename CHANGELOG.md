# Changelog

## Unreleased

- Open device settings through `/:device/settings`, including direct entry and browser history, while retaining owner-only controls.
- Apply pushed URLs as well as Back/Forward navigation to the selected page and drive.
- Parse supported URLs consistently, reject invalid ranges, and preserve range links starting at zero seconds.
- Replace legacy timestamp links without adding a history entry or letting stale lookups override newer navigation.
- Keep drive file metadata across zoom changes and load dashboard data when closing a directly opened drive.
- Open pairing at `/pair`, date filters at `/:device/filter`, and the upload queue at `/:device/settings/uploads`.
- Keep fractional-second ranges in copied links. Use browser history for earlier ranges and the drive arrow to view the whole drive.
- Let newly selected drives load independently of pending requests and ignore stale route and file responses.
- Preserve date filters in `from`/`to` URL parameters across reloads, drive links, and browser history.
- Retain unfinished settings fields while visiting uploads, without carrying drafts to another device.
- React to signed-out navigation without a reload and keep the full login return URL.
- Show a recoverable not-found page for unsupported paths.
- Reuse individually loaded drives without replacing the dashboard list or its date coverage, including empty and missing-route states.
- Keep the selected drive visible when its URL's dashboard date filter changes.
- Address drive uploads, Prime plan switching, Prime cancellation, and device unpair confirmation through validated `dialog` parameters; navigation never confirms an action.
- Update an open filter form when browser navigation changes its date range, and preserve query parameters when a missing public drive redirects to sign-in.

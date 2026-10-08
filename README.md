# comma connect

The web and mobile companion application for [openpilot](https://github.com/commaai/openpilot)

Try it with your openpilot device:
- **stable:** https://connect.comma.ai
- **latest:** https://latest.connect-d5y.pages.dev/

## Development
* Install bun: https://bun.sh/docs/installation
* Install dependencies: `bun install`
* Start dev server: `bun start`
* Demo mode: Navigate to `/demo` to test locally without a comma device.

API and useradmin URL roots can be overridden at build time with
`VITE_COMMA_URL_ROOT`, `VITE_ATHENA_URL_ROOT`, `VITE_BILLING_URL_ROOT`, and
`VITE_USERADMIN_URL_ROOT`. Docker Compose accepts the same variables.

## Contributing

* Use best practices
* Write test cases
* Keep files small and clean
* Use branches / pull requests to isolate work. Don't do work that can't be merged quickly, find ways to break it up

## URL state

`src/url.js` is the location boundary: `parseLocation()` validates a pathname
and query into page, device, drive, range, and modal state. Path builders and
compatibility selectors use the same grammar. Drive ranges use seconds in the
URL and integer milliseconds in state; legacy timestamp links resolve with
`replace` and cannot redirect over newer navigation.

`src/actions/history.js` reconciles every initial, PUSH, POP, and REPLACE location
against existing state. Query-only changes reuse route data, zoom, and playback.
Specific-drive fetches merge into cached routes without pretending to cover the
dashboard's date filter.

Modals overlay the current path, for example
`/:dongleId/:logId/0/20?modal=settings&device=:settingsDongleId`.
The `modalPages` registry lists supported overlays and their pages; `showModal()`
changes only the reserved `modal`/`device` query keys. Closing pushes the underlying
page so Back/Forward can restore the overlay, including after a cold entry.
Unknown paths show a fallback; invalid modal parameters leave a valid page alone.

## Libraries Used
There's a ton of them, but these are worth mentioning because they sort of affect everything.

 * `React` - Object oriented components with basic lifecycle callbacks rendered by state and prop changes.
 * `Redux` - Sane formal *global* scope. This is not a replacement for component state, which is the best way to store local component level variables and trigger re-renders. Redux state is for global state that many unrelated components care about. No free-form editing, only specific pre-defined actions. [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?hl=en) can be very helpful.
 * `@material-ui` - Lots of fully featured highly customizable components for building the UIs with. Theming system with global and per-component overrides of any CSS values.
 * `connected-react-router` - Mindlessly simple routing with convenient global access due to redux

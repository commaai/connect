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

## Libraries Used
There's a ton of them, but these are worth mentioning because they sort of affect everything.

 * `React` - Object oriented components with basic lifecycle callbacks rendered by state and prop changes.
 * `Redux` - Sane formal *global* scope. This is not a replacement for component state, which is the best way to store local component level variables and trigger re-renders. Redux state is for global state that many unrelated components care about. No free-form editing, only specific pre-defined actions. [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?hl=en) can be very helpful.
 * `@material-ui` - Lots of fully featured highly customizable components for building the UIs with. Theming system with global and per-component overrides of any CSS values.
 * `connected-react-router` - Mindlessly simple routing with convenient global access due to redux

## Navigation

`src/url.js` owns the URL grammar, range validation, and URL builders. Components
navigate with `openPage`, `openDrive`, or `openDialog`. The history middleware in
`src/actions/history.js` applies location changes to the device and drive selection;
unchanged selections retain their data and playback. Pages and dialogs are read
from `selectUrl(state)`, not parallel Redux flags.

Dialogs overlay their current page with `?dialog=...`. Settings, unpair, and settings
uploads can also specify `&device=<dongleId>`, independently of the underlying drive.
Other dialog names are `add-device`, `filter`, `uploads`, `cancel-prime`, and
`switch-prime`. Opening a dialog never performs its destructive or billing action.
Dialog close works from a cold link, and browser Back/Forward restores the overlay.

Drive ranges are seconds in the URL, with up to three decimal places, and integer
milliseconds in state. The drive Back button returns to the whole drive; browser
history steps through previous selections. Legacy timestamp links replace their
history entry once resolved, and stale lookups cannot redirect newer navigation.

`routes` caches fetched drives for the selected device. `routesMeta` describes the
loaded dashboard filter and its route IDs. Fetching a single drive augments the
cache without replacing that list or claiming that its filter has been loaded.

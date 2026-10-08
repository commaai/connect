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

## Navigation

`src/url.js` defines the URL grammar and builders. Components change the URL;
`applyLocation` in `src/actions/history.js` applies every initial, PUSH, POP and
REPLACE location to the device and drive selection. It changes only selections
that differ and ignores obsolete asynchronous legacy-link lookups.

Drive ranges use seconds in the URL, preserving millisecond precision and zero
starts. Browser Back/Forward walks through ranges; the drive back arrow returns
to the whole drive. Legacy timestamp links replace their entry when resolved.

Major dialogs use `?dialog=...`: `settings`, `unpair`, `settings-uploads`,
`add-device`, `filter`, `uploads`, `cancel-prime`, and `switch-plan`. Settings
also accepts `&device=<dongleId>` without changing the drive underneath. Closing
an app-opened dialog goes Back; closing a cold link replaces the entry. Unrelated
query arguments and hashes are preserved. Settings require ownership or superuser
access; confirmation URLs never perform their action automatically. Anchored menus
and transient pairing results remain local component state.

Single-drive lookups enrich the loaded routes without claiming dashboard-list
coverage. Changing just the range or dialog keeps routes, files, and playback
speed; closing a cold drive fetches the dashboard if its list has not been loaded.

## Libraries Used
There's a ton of them, but these are worth mentioning because they sort of affect everything.

 * `React` - Object oriented components with basic lifecycle callbacks rendered by state and prop changes.
 * `Redux` - Sane formal *global* scope. This is not a replacement for component state, which is the best way to store local component level variables and trigger re-renders. Redux state is for global state that many unrelated components care about. No free-form editing, only specific pre-defined actions. [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?hl=en) can be very helpful.
 * `@material-ui` - Lots of fully featured highly customizable components for building the UIs with. Theming system with global and per-component overrides of any CSS values.
 * `connected-react-router` - Mindlessly simple routing with convenient global access due to redux

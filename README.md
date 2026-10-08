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

## Routing

`src/url.js` parses locations and builds device, drive, and dialog URLs.
`src/actions/history.js` reconciles every router location change (PUSH, REPLACE,
and POP) with Redux. Reconciliation only updates changed selections; query-only
navigation keeps the current drive, playback, and cached route data.

Pages are `/`, `/demo`, `/referrals`, `/:dongleId`, `/:dongleId/prime`,
`/:dongleId/stream`, and `/:dongleId/:routeId[/startSeconds/endSeconds]`.
Legacy `/:dongleId/startMilliseconds/endMilliseconds` links resolve to a drive
and replace their history entry. A lookup cannot redirect a newer navigation.

Dialogs use `?dialog=settings|pair|filter|uploads|cancel-prime|switch-plan`.
Settings and uploads can target another accessible device with `&device=:dongleId`
without changing the page underneath. Filter dialogs belong to dashboards;
subscription confirmations belong to Prime. A URL opens a confirmation, never
performs the operation. Closing an overlay preserves unrelated query parameters
and the hash. Account menus and transient operation results remain local state.

When adding a page or dialog, extend `parseLocation` and its URL tests, then add
whole-app coverage for direct entry and browser history in `src/App.test.jsx`.

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

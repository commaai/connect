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

## URLs

`src/url.js` defines the URL grammar. Navigation actions write history;
`syncLocation` in `src/actions/history.js` applies every PUSH, REPLACE, and POP
through the same state transition after startup. Page and dialog visibility
come from the router location. Form drafts remain local component state.

| Path | View |
| --- | --- |
| `/` | Last selected device, or pairing for a new account |
| `/:dongleId` | Device dashboard |
| `/:dongleId/:logId` | Whole drive |
| `/:dongleId/:logId/:start/:end` | Drive range, in seconds (including zero and fractions) |
| `/:dongleId/prime` | Prime checkout or management |
| `/:dongleId/stream` | Teleoperation |
| `/referrals` | Referral rewards |
| `/demo` | Synthetic demo device |

Legacy `/:dongleId/:start/:end` links use absolute milliseconds and are replaced
with a drive URL after lookup. Malformed paths fall back to a device dashboard.

Use `?modal=` for `settings`, `unpair`, `pair`, `filter`, `uploads`, `files`,
`info`, `clips`, `prime-plan`, or `prime-cancel`. Drive menus require a drive
path; Prime confirmations require a Prime path and an existing subscription.
`settings`, `unpair`, and `uploads` accept `&device=:dongleId` to target a device
without changing the selected drive. Existing access checks still apply.
Opening a confirmation URL never submits it.

Dialog changes preserve the route, player, and playback position. Drive ranges
reuse metadata and files. The dashboard list and directly fetched drives are
cached separately for the selected device and cleared on device changes.
To add a route or dialog, extend the parser/builder, its rendering branch, and
the URL/navigation tests. No second navigation state or history stack is needed.

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

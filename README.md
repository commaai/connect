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

## Navigation and playback

`src/url.js` defines the URL contract. `parseLocation` produces one navigation
descriptor; the history middleware applies it on initial load and on push,
replace, Back, and Forward. Components use `navigatePage`, `navigateModal`, or
the timeline actions instead of keeping a second copy of navigation state.

| View | URL |
| --- | --- |
| Device dashboard | `/<dongle>` |
| Drive or selected range (seconds) | `/<dongle>/<route>[/<start>/<end>]` |
| Prime / live stream | `/<dongle>/prime`, `/<dongle>/stream` |
| Referrals | `/referrals` |
| Device settings | `?modal=settings&device=<dongle>` on the current page |
| Pairing / uploads / date filter | `?modal=pair`, `?modal=uploads`, `?modal=filter` |
| Drive files / information / clips | `?modal=downloads`, `?modal=info`, `?modal=clips` |
| Clip preview / delete confirmation | `?modal=clips&clip=<filename>[&confirm=delete]` |
| Prime confirmations | `?modal=prime-plan`, `?modal=prime-cancel` on the Prime page |

Demo navigation retains the `/demo` prefix. Legacy timestamp links still resolve
to drives. Overlay changes preserve the underlying drive and player; unrelated
query parameters and hashes survive navigation. Confirmation links only open a
dialog, and require the normal explicit user action to change data.

The video element is the playback clock. It reports observed route-relative
milliseconds through `videoProgress`; `seekVersion` identifies explicit seek
commands. The map and timeline read that observed position. Buffering never
advances a separate clock or repeatedly corrects the video's position.

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

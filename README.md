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

### Playback validation

Run `bun test` and `bun run build:development`, then open `/demo`. Check play/pause,
seeking while paused and playing, speed changes, timeline selections starting at
zero and later in the route, and switching between video and map. The video is
the playback clock; buffering or a browser pause should stop the map and timeline.
The missing-qcamera demo should show an error with a working Retry button.

Before releasing player changes, repeat these checks on desktop Chrome, Firefox,
and Safari, Android Chrome and its installed PWA, and iOS Safari and its installed
PWA. Include a route recorded with microphone audio: test unmuting, resuming after
backgrounding, blocked autoplay, native fullscreen controls, and seeking across
segment boundaries. The unit tests mock media APIs and do not validate decoding
or browser autoplay policies on those devices.

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

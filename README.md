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

## Testing playback without a device

Run `bun run test` for reducers, media events, and route navigation. Decoded
browser tests need Node 20+, FFmpeg with H.264/AAC encoders, and Playwright.
Install the browser tools outside this checkout:

```sh
npm install --prefix ../connect-playback-tools --no-package-lock playwright@1.62.1
node ../connect-playback-tools/node_modules/playwright/cli.js install chromium webkit
node scripts/test-playback.mjs --playwright ../connect-playback-tools/node_modules/playwright
```

The script generates a 12-second video, quiet AAC audio, GPS, events, and
thumbnails under ignored `test-results/`. Its local `/demo` backend exercises the
real player and map: pause, seeks, loops, route changes, 0.5/2/8x audio, missing
GPS, HLS gaps, HTTP 404s, and network recovery. No device, account, public route,
or downloaded recording is required. Autoplay and unsupported-native rejection
are explicitly simulated before real decode; Chromium freeze/resume tests the
desktop renderer. Physical iOS/Android audio and installed PWAs require separate
device checks.

The timeline supports wheel and two-finger pinch zoom without seeking. Click to
seek, or focus the timeline and use `+`, `-`, and `0` to zoom and reset its view.
Arrow keys seek by one second; Home/End seek to the visible range edges. The
loading comma appears only after 500 ms of continuous buffering.

Use `--browser chromium` or `--browser webkit` for one engine and `--headed` to
watch. `--playwright` or `PLAYWRIGHT_MODULE` selects external browser tools;
otherwise the script uses Playwright in this checkout. CI runs the same test and
saves `test-results/playback-report.json`, including unsupported engine codecs.
At least one decoded browser suite must pass.

To test the live public route, its minute-long segments, and a cold range link:

```sh
node scripts/test-public-playback.mjs ../connect-playback-tools/node_modules/playwright
node scripts/test-public-playback.mjs ../connect-playback-tools/node_modules/playwright --mse
```

This optional check needs comma's public API and assets. It saves default/MSE
receipts and a screenshot under `test-results/`.

For manual playback with the generated routes:

```sh
node scripts/test-playback.mjs --serve
```

Open the printed `/demo?playback=audio` URL and select **Playback baseline**.
Change `playback` to `silent`, `missing-map`, `missing-segment`, `gap`, or
`fatal-manifest` to reproduce each case. `stalled` holds later video fragments;
open `/__playback-control/reconnect` on the printed server to release them.
Ctrl+C stops the server. Set `FFMPEG` to its executable if absent from PATH;
`node scripts/generate-playback-fixtures.mjs` regenerates the files.

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

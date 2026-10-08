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

Run `bun run test` for reducer and media event tests. Real playback tests also need
Node 20+, FFmpeg with H.264/AAC encoders, and Playwright. Install browser tooling
outside this checkout to keep the application's dependencies unchanged:

```sh
npm install --prefix ../connect-playback-tools --no-package-lock playwright@1.62.1
node ../connect-playback-tools/node_modules/playwright/cli.js install chromium webkit
node scripts/test-playback.mjs --playwright ../connect-playback-tools/node_modules/playwright
```

The script generates a 12-second H.264 test pattern, a quiet AAC audio variant,
GPS coordinates, events, and thumbnails under ignored `test-results/`. It starts
a local `/demo` backend and tests decoded playback, media/map/timeline alignment,
pause, seeking, selected loops, browser history, cold route links, unmuted audio
speeds, missing GPS, HLS gaps, real HTTP 404 errors, buffering, offline recovery,
and retry. Autoplay refusal and unsupported native playback are simulated to
verify recovery into real decoded playback. It uses the application's media player
and map code. API responses, the empty map style, and generated media stay local.
No comma device, account, public route, or downloaded recording is required.

The browser checks also exercise cold range links, route changes sharing one
stream URL, 0.5/2/8x audio playback, real fragment stalls, and network reconnect.
Autoplay and unsupported native playback rejection use explicitly simulated
promise failures, followed by real decoded playback. Chromium renderer
freeze/resume is a desktop engine check, not mobile OS background validation.

Use `--browser chromium` or `--browser webkit` for one engine, `--headed` to watch,
and `--playwright` to reuse another installed Playwright package. The script also
finds Playwright in the checkout or at `PLAYWRIGHT_MODULE`. It writes browser
versions, tested cases, and unsupported HLS capabilities to
`test-results/playback-report.json`. The CI playback job runs the same script.
Playwright WebKit coverage depends on its platform's codecs and does not replace
testing audio on physical iOS/Android browsers and installed PWAs.

To check the live public demo route and seeking across its minute-long segments:

```sh
node scripts/test-public-playback.mjs ../connect-playback-tools/node_modules/playwright
```

This optional test requires network access to comma's public API and media. It
writes a separate public-route receipt; append `--mse` to test MSE directly.

To check the real public demo route separately, including seeks across its
60-second segments and a cold range link:

```sh
node scripts/test-public-playback.mjs ../connect-playback-tools/node_modules/playwright
node scripts/test-public-playback.mjs ../connect-playback-tools/node_modules/playwright --mse
```

This optional live test needs the public API and assets. It writes separate
default/MSE reports and a route screenshot under `test-results/`. The generated
fixture tests remain independent of public route availability.

For manual playback with the same generated routes:

```sh
node scripts/test-playback.mjs --serve
```

Open the printed `/demo?playback=audio` URL and select **Playback baseline**.
Change `playback` to `silent`, `missing-map`, `missing-segment`, `gap`, or
`fatal-manifest` to reproduce each case. `stalled` holds later video fragments;
open `/__playback-control/reconnect` on the printed server to release them.
Ctrl+C stops the server. Set `FFMPEG`
to the encoder executable path if it is not on PATH; use
`node scripts/generate-playback-fixtures.mjs` to regenerate the files.

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

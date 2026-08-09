# comma connect

The web and mobile companion application for [openpilot](https://github.com/commaai/openpilot)

Try it with your openpilot device:
- **stable:** https://connect.comma.ai
- **latest:** https://latest.connect-d5y.pages.dev/

## Development
* Install bun: https://bun.sh/docs/installation
* Install dependencies: `bun install`
* Start dev server: `bun start`

API and useradmin URL roots can be overridden at build time with
`VITE_COMMA_URL_ROOT`, `VITE_ATHENA_URL_ROOT`, `VITE_BILLING_URL_ROOT`, and
`VITE_USERADMIN_URL_ROOT`. Docker Compose accepts the same variables.

### Mock mode

`bun run start:mock` runs the app against a fake comma backend, so every screen
works with no comma account and no paired device. The dev server answers the API,
athena, and billing roots itself, and seeds a session token, so nothing reaches
the real services.

Pick what the fake account looks like with `VITE_MOCK_SCENARIO`:

| scenario | what you get |
| --- | --- |
| `default` | prime device with ~2 weeks of drives |
| `nodevice` | signed in with nothing paired (pair-a-device flow) |
| `noprime` | device without a subscription (prime checkout) |
| `body` | a comma body, so `/stream` teleop renders |
| `anonymous` | signed out (landing page) |

```sh
VITE_MOCK_SCENARIO=noprime bun run start:mock
```

Fixtures and the request table live in `config/mock/`. `fixtures.js` and
`handlers.js` are pure and framework-agnostic, so they can also back a browser
mock or a test runner. An unhandled request answers `501` and logs a warning
rather than failing quietly — that means the table has drifted from `src/api.js`.

Video is the one thing mock mode can't fake: `qcamera.m3u8` returns an empty
playlist, so the drive view renders with "Unable to load video". Use a real
public route URL if you need to work on playback.

### Comparing against the React app

While the svelte port is in progress, the gallery can build two source trees and
pixel-diff them, so each ported route can be checked against the React original.

Set up the baseline once:

```sh
./scripts/react-baseline.sh
```

That creates a detached worktree of `master` at `../comma-connect-react-baseline`
with **its own** `node_modules`. Both details matter: react, redux and material-ui
are gone from this branch, so a baseline sharing this repo's dependencies would
not build, and keeping it outside the repo means vite, jest and oxlint never scan
it. Re-run the script any time to refresh it; it is idempotent.

Then diff:

```sh
node scripts/build-gallery.mjs --output ./dist-gallery \
  --base ../comma-connect-react-baseline \
  --base-sha "$(git rev-parse master)" \
  --states signin
```

`--states` limits the run to states that have actually been ported; without it
the unported ones fail their readiness waits and abort the capture. Drop it once
everything is ported. The report lands in `dist-gallery/connect-gallery.html`;
a port is done when its states report `0 changed`.

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
 * `react-router-redux` - the newer one, 5.x.... Mindlessly simple routing with convenient global access due to redux

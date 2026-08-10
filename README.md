# comma connect

The web and mobile companion application for [openpilot](https://github.com/commaai/openpilot)

Try it with your openpilot device:
- **stable:** https://connect.comma.ai
- **latest:** https://latest.connect-d5y.pages.dev/

## Development
* Install bun: https://bun.sh/docs/installation
* Install dependencies: `bun install`
* Start dev server: `bun start`

Or `./live.sh`, which installs bun if it is missing, installs dependencies, starts
the dev server and opens a browser on it once it is listening. It opens the port
vite actually bound, which is not 3000 if something else already has it.

```sh
./live.sh                  # against the real comma API
./live.sh mock             # against the bundled mock backend, below
./live.sh mock noprime     # ... in a particular scenario
./live.sh noprime          # same thing; a scenario name implies mock
./live.sh scan             # with the render scan, below
./live.sh --no-open        # leave the browser alone
./live.sh -- --host        # anything after -- goes to vite
```

API and useradmin URL roots can be overridden at build time with
`VITE_COMMA_URL_ROOT`, `VITE_ATHENA_URL_ROOT`, `VITE_BILLING_URL_ROOT`, and
`VITE_USERADMIN_URL_ROOT`. Docker Compose accepts the same variables.

### Mock mode

`bun run start:mock`, or `./live.sh mock`, runs the app against a fake comma
backend, so every screen works with no comma account and no paired device. The dev server answers the API,
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
./live.sh noprime                              # the same, and opens a browser
```

`live.sh` reads the scenario names out of `config/mock/fixtures.js`, so it rejects
a typo instead of quietly giving you `default`.

Fixtures and the request table live in `config/mock/`. `fixtures.js` and
`handlers.js` are pure and framework-agnostic, so they can also back a browser
mock or a test runner. An unhandled request answers `501` and logs a warning
rather than failing quietly — that means the table has drifted from `src/api.js`.

Video is the one thing mock mode can't fake: `qcamera.m3u8` returns an empty
playlist, so the drive view renders with "Unable to load video". Use a real
public route URL if you need to work on playback.

### Render scan

`./live.sh scan` outlines each element as it is written to, labelled with what
changed and how many times, hotter the more often. It answers the question
react-scan answers for React, which is not quite the same question: svelte has no
re-render step to catch, so this watches the DOM instead, and a box that keeps
lighting up is an update nobody asked for — a `$derived` recomputing an identical
value, an `$effect` reassigning a style every frame, a list re-keyed into a full
teardown. It is only present when asked for, and draws nothing until the page
changes.

Being built on `MutationObserver` it is framework-agnostic, so it can be pointed
at another build for a before-and-after.

For the other half of the question — *why* something re-ran rather than what it
touched — `$inspect.trace()` as the first line of an `$effect` or `$derived.by`
names the reactive value that caused the run. Both are dev-only and neither is
in a production bundle.

### Visual regression gallery

`bun run build:gallery` renders every screen at desktop and mobile widths against
fixed fixtures and writes `dist-gallery/connect-gallery.html`. CI publishes the
report and diffs each run against the baseline it downloads.

To diff locally, point `--base` at another checkout of this repo and name the
commit it is at:

```sh
node scripts/build-gallery.mjs --output ./dist-gallery \
  --base ../connect-before --base-sha "$(git -C ../connect-before rev-parse HEAD)"
```

That checkout needs its own `node_modules`. `--states signin,dashboard` narrows a
run to the screens you are working on, pulling in the page a modal state opens
over. A change is clean when the report says `0 changed`.

### Tests

```sh
bun run test               # vitest, once
bun run test-watch         # re-run on change
bun run test-coverage      # with a coverage report
bun run lint               # oxlint over the .js, svelte-check over every component
```

Note the `run`. `bun test` is Bun's own runner rather than vitest, and it ignores
`vitest.config.js` — no `$lib` or `$app/*` aliases, no svelte compiler, and none
of `config/vitest/setup.js`, so everything touching a component fails to resolve
and it reads like dozens of broken tests instead of the wrong command.
`bunfig.toml` stops it and points back here.

Components mount with `@testing-library/svelte` against jsdom. Video and teleop
are deliberately not covered: mock mode serves an empty `qcamera.m3u8` and a stub
SDP that negotiates and then times out, so there is nothing truthful to assert
against until there is a real device and stream to test with.

## Contributing

* Use best practices
* Write test cases
* Keep files small and clean
* Use branches / pull requests to isolate work. Don't do work that can't be merged quickly, find ways to break it up

## Architecture
The pieces below are worth knowing because they affect everything else.

 * `Svelte 5` - Components in runes mode: `$state`, `$derived`, `$effect`, `$props`. No stores and no
   `export let`; reactivity is at the value, not the component.
 * `SvelteKit` - File-based routing under `src/routes`. Path segments are validated by matchers in
   `src/params`, so `/{dongleId}` and `/{dongleId}/{logId}` can be siblings and junk 404s instead of
   parsing into `NaN`. Server data is fetched in `load` functions rather than held globally.
   A log id in the path is what makes a URL a shared drive link, so those routes render for
   signed-out visitors; every other signed-out path gets the landing page.
 * `adapter-static` - The app is a JWT-in-localStorage SPA with `ssr = false`, built to `dist/` with an
   `index.html` fallback. That is what nginx and Cloudflare Pages already serve.
 * `Tailwind v4` - All styling. There is no component library; MUI's rendering was ported into the
   components, so `src/index.css` carries the body `line-height` MUI applied per Typography component.
   Utilities are not `!important`: a component's own scoped class or inline style outranks them, which
   is what several components rely on to reproduce what React's style props did.
 * `mapbox-gl` - Used directly. Markers are positioned by projecting in JavaScript
   (`src/lib/utils/mercator.js`) rather than asking the map, so they still render when tiles fail to load.

The only global mutable state left is playback (`src/lib/state/playback.svelte.js`), a rune class over the
same wall-clock arithmetic the old reducer used: the offset is derived from `Date.now()` rather than ticked.

`MIGRATION-REPORT.txt` has the measured before/after numbers from the React rewrite.

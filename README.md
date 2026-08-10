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
./live.sh --no-open        # don't open browser automatically
./live.sh -- --host        # anything after -- goes to vite
```

## Contributing

* Use best practices
* Write test cases
* Keep files small and clean
* Use branches / pull requests to isolate work. Don't do work that can't be merged quickly, find ways to break it up

## Architecture
The pieces below are worth knowing because they affect everything else.

 * `Svelte 5` - Components in runes mode: `$state`, `$derived`, `$effect`, `$props`. No stores and no
   `export let`; reactivity is at the value, not the component.
 * `SvelteKit` - File-based routing under `src/routes`.
 * `mapbox-gl` - Used directly. Markers are positioned by projecting in JavaScript
   (`src/lib/utils/mercator.js`).

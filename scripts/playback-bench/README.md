# Playback validation

Run from the repository root. This tooling is separate from the application bundle.

## Recorded evidence

The `evidence/` directory contains gzip-compressed, unmodified raw JSON for all four formal phases, the four superseded/rejected batches described in `docs/playback-benchmarks.md`, and archived formal runners. `manifest.json` records uncompressed sizes and SHA-256 hashes. Generated media, builds, local certificates, and private keys are excluded. Restore the evidence without running benchmarks:

```sh
python3 - <<'PY'
from pathlib import Path
import gzip, hashlib, json
source = Path('scripts/playback-bench/evidence')
target = Path('test-results/playback')
target.mkdir(parents=True, exist_ok=True)
for name, expected in json.loads((source / 'manifest.json').read_text()).items():
    data = gzip.decompress((source / (name + '.gz')).read_bytes())
    assert len(data) == expected['bytes']
    assert hashlib.sha256(data).hexdigest() == expected['sha256']
    destination = target / name
    if destination.exists() and destination.read_bytes() != data:
        raise RuntimeError(f'Refusing to overwrite different local evidence: {destination}')
    destination.write_bytes(data)
PY
python3 scripts/playback-bench/submission-report.py
```

## Reproduce measurements

```sh
bun install --frozen-lockfile
(cd scripts/playback-bench && bun install --frozen-lockfile)
(cd scripts/playback-bench && bunx playwright install chromium webkit)
EXTENDED=1 sh scripts/playback-bench/generate-media.sh
node scripts/playback-bench/prepare-baseline.mjs 109edb39ffa7a4ad3c38788ca2f39a286538ff07
(cd test-results/playback/baseline-source && bun install --frozen-lockfile --ignore-scripts)
cp scripts/playback-bench/run.mjs test-results/playback/submission-baseline-runner.mjs
BENCH_SOURCE_ROOT=test-results/playback/baseline-source/src node scripts/playback-bench/run.mjs submission-baseline
cp scripts/playback-bench/run.mjs test-results/playback/submission-final-runner.mjs
node scripts/playback-bench/run.mjs submission-final
cp scripts/playback-bench/run.mjs test-results/playback/submission-extended-runner.mjs
SUITE=extended node scripts/playback-bench/run.mjs submission-extended
cp scripts/playback-bench/run.mjs test-results/playback/submission-native-runner.mjs
SUITE=extended NATIVE_HLS=1 ENGINES=webkit node scripts/playback-bench/run.mjs submission-native
python3 scripts/playback-bench/submission-report.py
```

FFmpeg with libx264/AAC must be on PATH, or provide `FFMPEG=/absolute/path/to/ffmpeg`. Do not regenerate fixtures between compared phases. Run phases sequentially, without concurrent tests/builds/video encoding. Defaults are three trials per browser, a fresh context per scenario, 1280×800 viewport and headless Chromium/WebKit. Nonzero exit means a failed case or unavailable engine. Calibration runs (`TRIALS=1`, `CASES=...`) are excluded from reported comparisons.

The baseline is an archived original source tree, using its locked dependencies. The only baseline source instrumentation exports existing Map/Timeline classes for observation; it does not change behavior. Vite aliases source imports to that tree and deduplicates React. Original ReactPlayer obtains the same locally served HLS.js 1.4.8 as the candidate. Results record complete source-tree, runner, harness and fixture hashes, engine versions and environment.

Core: 11 scenarios × 3 trials × 2 engines. First frame is measured from real viewer mount to first decoded video-frame callback; paused seek requires the requested decoded frame within 150 ms of media position, with an 8-second deadline. Normal playback samples 30 times, about every 50 ms; captures media/clock disagreement, Redux notifications, dropped frames, pause drift, requested rates, Chromium task duration and heap. Phases use a fixed before/after order; OS filesystem caches and machine scheduling are not reset or randomized. Three trials expose variability; they do not eliminate measurement error or estimate production error rates. Include startup regressions and every failed execution.

Faults are HTTP-server 404s and 1.5-second segment delays, so native media requests cannot bypass browser routing. Recovery requires at least three new decoded frames and cleared error/buffering state. Requests served through native media may not appear in Playwright response counters; use `serverFault` counts for fault delivery. Map-error recovery is also injected by the server. Other external requests are blocked, with an empty Mapbox style; this is not a map-tile performance measurement.

Extended: actual Map GeoJSON and timeline DOM alignment, thumbnail elements, paused Map-to-Video seeking, zero/natural-end loops (wait for the end seek to settle, then require a decoded wrap and resumed playback within 8 seconds, allowing 150 ms frame quantization), minute boundaries, omitted middle minute, late camera origin, refreshed source, visible Map recovery, offline/resume, native pause/play and audio controls. A 180-second 320×180 H.264/AAC fixture uses three one-minute chunks with numbered EXTINF titles; the gap playlist omits minute 1 while retaining timestamps. Extended footage explicitly declares BT.709 to keep reference color interpretation consistent. Native HLS uses desktop WebKit with an iPhone user agent to select the native pipeline; this does not emulate physical iOS. Native cached playback can continue while Playwright is offline, so that case alone does not prove native network failure recovery.

For paused native and missing-minute seeks, canvas pixels are compared with FFmpeg reference frames (sample every 16th pixel, mean RGB error ≤12). Accurate references use output-side `-ss`; comparisons have an 8-second deadline. Image comparison supplements timestamp checks and is a low-resolution synthetic-fixture test. Audio assertions cover tracks/mute state and continued playback, not listening quality. The extended seek metric includes verification and must not be mixed with core seek latency.

See `docs/playback-validation.md` for simulator/emulator coverage and physical-device limitations. Use `submission-report.py` for the current submission evidence.

For manual original/current review on this prepared machine, run `node scripts/playback-bench/serve-comparison.mjs` and open http://localhost:33382/ (original) or http://localhost:33381/ (current). This loopback-only server is excluded from formal measurements. Use the same controls and selected ranges in both viewers.

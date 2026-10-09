# Playback submission evidence

Recorded local measurements for a draft contribution. Physical devices are unavailable; interactive simulator/emulator browser and standalone checks remain incomplete. These synthetic desktop results do not estimate production error rates.

## Matched three-run comparison

| Engine / metric | Original, trials 1 / 2 / 3 | Current, trials 1 / 2 / 3 | Median before → after |
|---|---|---|---|
| chromium: First decoded frame (ms) | 479.2 / 122.9 / 113.3 | 428.4 / 169.3 / 160.4 | 122.9 → 169.3 |
| chromium: Store notifications (~1.5 s) | 0 / 1 / 1 | 6 / 6 / 6 | 1 → 6 |
| chromium: Maximum clock/frame difference (ms) | 94.67 / 354.67 / 354.67 | 0 / 0 / 0 | 354.67 → 0 |
| chromium: Paused drift (ms) | 0 / 0 / 0 | 0 / 0 / 0 | 0 → 0 |
| chromium: Dropped frames in normal playback | 0 / 0 / 0 | 0 / 0 / 0 | 0 → 0 |
| chromium: JavaScript heap (bytes) | 11223592 / 11103604 / 11071156 | 9869096 / 9740288 / 9843468 | 11103604 → 9843468 |
| chromium: Main-thread task duration (ms) | 110.78 / 116.07 / 106.98 | 57.44 / 63.4 / 47.5 | 110.78 → 57.44 |
| chromium: Paused seek (ms; per-trial medians) | 498 / 507 / 497 | 29 / 29 / 29 | 498 → 29 |
| webkit: First decoded frame (ms) | 528 / 353 / 341 | 385 / 200 / 221 | 353 → 221 |
| webkit: Store notifications (~1.5 s) | 0 / 0 / 1 | 6 / 6 / 6 | 0 → 6 |
| webkit: Maximum clock/frame difference (ms) | 800.33 / 684 / 712.33 | 0 / 0 / 0 | 712.33 → 0 |
| webkit: Paused drift (ms) | 0 / 0 / 0 | 0 / 0 / 0 | 0 → 0 |
| webkit: Dropped frames in normal playback | 4 / 7 / 0 | 0 / 0 / 0 | 4 → 0 |
| webkit: Paused seek (ms; per-trial medians) | 491 / 218 / 494 | 56 / 55 / 53 | 491 → 55 |

These are observed samples, not statistical significance claims. First-frame and CPU regressions must be read alongside improvements. Extended seek timings include image validation and are not comparable with core seek timings.

## Acceptance executions

| Phase | Passed / total | Runtime page errors |
|---|---|---|
| submission-baseline | 31 / 66 | 0 |
| submission-final | 66 / 66 | 0 |
| submission-extended | 66 / 66 | 0 |
| submission-native | 36 / 36 | 0 |

## Failures in the original player

- chromium, trial 1, missing-manifest: No Retry control after injected 404
- chromium, trial 1, missing-fragment: No Retry control after injected 404
- chromium, trial 1, map-continuity: Map unmounted or stopped video
- chromium, trial 1, speed: Playback rate differs from requested speed
- chromium, trial 1, zero-loop: Selected loop did not wrap and continue
- chromium, trial 1, end-loop: Selected loop did not wrap and continue
- chromium, trial 2, missing-manifest: No Retry control after injected 404
- chromium, trial 2, missing-fragment: No Retry control after injected 404
- chromium, trial 2, map-continuity: Map unmounted or stopped video
- chromium, trial 2, speed: Playback rate differs from requested speed
- chromium, trial 2, zero-loop: Selected loop did not wrap and continue
- chromium, trial 2, end-loop: Selected loop did not wrap and continue
- chromium, trial 3, missing-manifest: No Retry control after injected 404
- chromium, trial 3, missing-fragment: No Retry control after injected 404
- chromium, trial 3, map-continuity: Map unmounted or stopped video
- chromium, trial 3, speed: Playback rate differs from requested speed
- chromium, trial 3, zero-loop: Selected loop did not wrap and continue
- chromium, trial 3, end-loop: Selected loop did not wrap and continue
- webkit, trial 1, cold-range: Cold range started at wrong position
- webkit, trial 1, missing-manifest: No Retry control after injected 404
- webkit, trial 1, missing-fragment: No Retry control after injected 404
- webkit, trial 1, map-continuity: Map unmounted or stopped video
- webkit, trial 1, speed: Playback rate differs from requested speed
- webkit, trial 1, zero-loop: Selected loop did not wrap and continue
- webkit, trial 2, cold-range: Cold range started at wrong position
- webkit, trial 2, missing-manifest: No Retry control after injected 404
- webkit, trial 2, missing-fragment: No Retry control after injected 404
- webkit, trial 2, map-continuity: Map unmounted or stopped video
- webkit, trial 2, speed: Playback rate differs from requested speed
- webkit, trial 2, zero-loop: Selected loop did not wrap and continue
- webkit, trial 3, missing-manifest: No Retry control after injected 404
- webkit, trial 3, missing-fragment: No Retry control after injected 404
- webkit, trial 3, map-continuity: Map unmounted or stopped video
- webkit, trial 3, speed: Playback rate differs from requested speed
- webkit, trial 3, zero-loop: Selected loop did not wrap and continue

## Method and provenance

See [tooling instructions](../scripts/playback-bench/README.md) for commands, fixture generation, isolation, assertions and measurement limits. Each raw JSON includes all scenario samples, fault counts, image evidence, hashes and environment. Formal phases ran sequentially, without concurrent tests/builds/encoding. Baseline: original archived source with test-only class exports; candidate: current local source.

Baseline commit: `109edb39ffa7a4ad3c38788ca2f39a286538ff07`.
Original source-tree SHA-256: `7bbf5cdbc1d314ccc798ed101e2ac63e77892074daa6b07870d33e17eb462c4a`.
Current source-tree SHA-256: `6057e8b7db0781cb0abbb946452a5a5558f88b7489368ea2678e7fa59816ea95`.
Runner SHA-256: `04e42a3da7fd47c3034d9d8d319d1b3ca710b51dbf24bf342d42c8e95fa2e2bb`.
Harness SHA-256: `22ce10f2b26df637b3b2db0e62dd7a580999fb3e1cfa3e1f7f16796bf85f5fe8`.

Environment: {"cpu": "Apple M4 Pro", "headless": true, "nativeHlsRequested": false, "node": "v22.22.3", "os": "darwin", "playwright": "1.62.1", "release": "25.6.0"}.

Browser versions: chromium 151.0.7922.34, webkit 26.5.

## Remaining platform evidence

123 unit tests pass across 15 files; lint, whitespace checks and full Vite application build pass (existing large-chunk warnings). The practical next step is [simulator/emulator validation](playback-validation.md) for iOS/Android browser and standalone behavior. Physical hardware/audio listening, realistic high-resolution/network stress and background/lock/resume remain evidence limitations; do not claim them tested. Desktop native HLS is additional transport evidence, not a phone test. No backend or production encoding changes.

The first extended three-run batch is preserved as `submission-extended-boundary-v1.json`: one loop check rejected a decoded frame about 33 ms before the selected start. Extended-only loop validation was corrected to allow the existing 150 ms decoded-frame tolerance. A second batch, preserved as `submission-extended-transition-v2.json`, sampled mid-seek at a fixed delay. The final assertion waits for the end seek to settle, then requires a real wrap and resumed playback within the same 8-second deadline; all extended cases were rerun three times. Production source and core comparison remained unchanged; extended/native runner hashes record those assertion changes. Archived runner snapshots match their recorded hashes. The core before/after runner code is byte-identical; only extended assertions differ between snapshots. The audio-track fix required repeating the current core, extended and native phases; the unchanged original phase was retained. The earlier current/native phases remain archived as `submission-final-before-audio.json` and `submission-native-before-audio.json`. Tool versions used: Bun 1.4.2 and FFmpeg 6.0. Historical smoothness-only comparison: the earlier candidate reduced median notifications 96→6 and Chromium task duration 73.352→62.356 ms. That measured an older source stage; current source measurements above supersede it for submission claims.

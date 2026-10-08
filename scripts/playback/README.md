# Real-media playback tests

Run `bun run test:playback` after installing the app dependencies. The command
uses the same pinned Puppeteer version as the gallery. To use an installed
Chrome, set `PUPPETEER_EXECUTABLE_PATH`; set `PUPPETEER_SKIP_DOWNLOAD=true` to
skip Puppeteer's browser download.

The runner builds an isolated test page containing the production `Media`,
`DriveVideo`, `TimeDisplay` and Redux store, then serves it with the synthetic
HLS fixture on a loopback port. Chrome decodes the real H.264/AAC stream.
HTTP failures and held responses exercise loading, stalls and recovery;
the media element, HLS implementation and media events are not mocked.
Route data and map services are supplied locally, so no comma device,
account, API credentials or external video service is needed.

The suite covers playback and audio controls, paused and rapid seeks,
pre-metadata seeks, nonzero loops, Map/video element retention, terminal
errors and Retry/Play recovery, refreshed sources, and a late video origin.
The midstream missing-fragment case requires a terminal error within five
seconds and bounds repeated 404 requests. Separate cases inject one transient
404, one, two and three consecutive 503 responses, plus one real first-byte
timeout under the production 10-second policy, and require automatic recovery
with playback intent, media identity, speed and mute state preserved.
Results are written to `test-results/playback/` (ignored by Git). Failures include
a screenshot plus media state and request/event traces; receipts include
response/abort timestamps. CI uploads these details as a failure artifact.
To focus a run or save elsewhere:

```sh
bun run test:playback --case midstream --output /tmp/playback-results
```

These are Chrome integration tests. A mobile viewport does not establish
native iOS HLS, Android browser/PWA behavior or physical audio output; those
still need platform-specific verification.

See [fixtures/README.md](fixtures/README.md) for the generated media's provenance
and regeneration command. FFmpeg is not required to run the tests.

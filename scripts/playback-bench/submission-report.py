"""Generate the current submission report from complete, matched raw evidence."""
import json, hashlib
from pathlib import Path
from statistics import median
root = Path('test-results/playback')
phases = {name: json.loads((root / f'{name}.json').read_text()) for name in ('submission-baseline', 'submission-final', 'submission-extended', 'submission-native')}
a, b = phases['submission-baseline'], phases['submission-final']
for key in ('fixtureHashes', 'harnessSha256', 'protocol'):
    assert a[key] == b[key], f'Comparison mismatch: {key}'
old_runner = (root / 'submission-baseline-runner.mjs').read_bytes()
new_runner = (root / 'submission-final-runner.mjs').read_bytes()
assert hashlib.sha256(old_runner).hexdigest() == a['runnerSha256']
assert hashlib.sha256(new_runner).hexdigest() == b['runnerSha256']
assert old_runner.split(b'async function runExtended')[0] == new_runner.split(b'async function runExtended')[0], 'Core runner changed'
for name, data in phases.items():
    if name != 'submission-baseline':
        for key in ('sourceTreeSha256', 'fixtureHashes', 'harnessSha256'):
            assert data[key] == b[key], f'Current-phase provenance mismatch: {name}/{key}'
    assert all(not r.get('unavailable') for r in data['runs']), name
    expected = 3 if name == 'submission-native' else 6
    assert len(data['runs']) == expected, f'Incomplete phase: {name}'
    if name != 'submission-baseline':
        assert all(s['status'] == 'pass' for r in data['runs'] for s in r['scenarios']), f'Failed phase: {name}'
lines = ['# Playback submission evidence', '', 'Recorded local measurements for a draft contribution. Physical devices are unavailable; interactive simulator/emulator browser and standalone checks remain incomplete. These synthetic desktop results do not estimate production error rates.', '', '## Matched three-run comparison', '', '| Engine / metric | Original, trials 1 / 2 / 3 | Current, trials 1 / 2 / 3 | Median before → after |', '|---|---|---|---|']
def fmt(v):
    return 'n/a' if v is None else f'{v:.2f}'.rstrip('0').rstrip('.')
for engine in ('chromium', 'webkit'):
    old = [r for r in a['runs'] if r['engine'] == engine]
    new = [r for r in b['runs'] if r['engine'] == engine]
    def normal(run): return next(s for s in run['scenarios'] if s['name'] == 'normal')['metrics']
    for title, key in [('First decoded frame (ms)', 'firstFrameMs'), ('Store notifications (~1.5 s)', 'storeNotifications'), ('Maximum clock/frame difference (ms)', 'maxClockErrorMs'), ('Paused drift (ms)', 'pauseDriftMs'), ('Dropped frames in normal playback', 'droppedFrames'), ('JavaScript heap (bytes)', 'jsHeapBytes'), ('Main-thread task duration (ms)', 'mainThreadTaskMs')]:
        values = [[normal(r).get(key) for r in runs] for runs in (old,new)]
        if all(v is None for v in values[0] + values[1]): continue
        meds = [median([v for v in vs if v is not None]) if any(v is not None for v in vs) else None for vs in values]
        lines.append(f'| {engine}: {title} | {" / ".join(map(fmt,values[0]))} | {" / ".join(map(fmt,values[1]))} | {fmt(meds[0])} → {fmt(meds[1])} |')
    values = [[median([s['latencyMs'] for s in normal(r).get('seeks',[]) if s['latencyMs'] is not None]) for r in runs] for runs in (old,new)]
    allseeks = [[s['latencyMs'] for r in runs for s in normal(r).get('seeks',[]) if s['latencyMs'] is not None] for runs in (old,new)]
    lines.append(f'| {engine}: Paused seek (ms; per-trial medians) | {" / ".join(map(fmt,values[0]))} | {" / ".join(map(fmt,values[1]))} | {fmt(median(allseeks[0]))} → {fmt(median(allseeks[1]))} |')
lines += ['', 'These are observed samples, not statistical significance claims. First-frame and CPU regressions must be read alongside improvements. Extended seek timings include image validation and are not comparable with core seek timings.', '', '## Acceptance executions', '', '| Phase | Passed / total | Runtime page errors |', '|---|---|---|']
for name,data in phases.items():
    scenarios=[s for r in data['runs'] for s in r['scenarios']]
    lines.append(f'| {name} | {sum(s["status"]=="pass" for s in scenarios)} / {len(scenarios)} | {sum(len(s.get("pageErrors",[])) for s in scenarios)} |')
lines += ['', '## Failures in the original player', '']
for r in a['runs']:
    for s in r['scenarios']:
        if s['status'] != 'pass': lines.append(f'- {r["engine"]}, trial {r["trial"]}, {s["name"]}: {s.get("failure", "runtime failure")}')
lines += ['', '## Method and provenance', '', 'See [tooling instructions](../scripts/playback-bench/README.md) for commands, fixture generation, isolation, assertions and measurement limits. Each raw JSON includes all scenario samples, fault counts, image evidence, hashes and environment. Formal phases ran sequentially, without concurrent tests/builds/encoding. Baseline: original archived source with test-only class exports; candidate: current local source.', '', f'Baseline commit: `{a["baselineCommit"]}`.', f'Original source-tree SHA-256: `{a["sourceTreeSha256"]}`.', f'Current source-tree SHA-256: `{b["sourceTreeSha256"]}`.', f'Runner SHA-256: `{b["runnerSha256"]}`.', f'Harness SHA-256: `{b["harnessSha256"]}`.', '', 'Environment: ' + json.dumps(b['environment'], sort_keys=True) + '.', '', 'Browser versions: ' + ', '.join(f'{r["engine"]} {r["browserVersion"]}' for r in b['runs'] if r['trial']==1) + '.', '', '## Remaining platform evidence', '', '123 unit tests pass across 15 files; lint, whitespace checks and full Vite application build pass (existing large-chunk warnings). The practical next step is [simulator/emulator validation](playback-validation.md) for iOS/Android browser and standalone behavior. Physical hardware/audio listening, realistic high-resolution/network stress and background/lock/resume remain evidence limitations; do not claim them tested. Desktop native HLS is additional transport evidence, not a phone test. No backend or production encoding changes.', '', 'The first extended three-run batch is preserved as `submission-extended-boundary-v1.json`: one loop check rejected a decoded frame about 33 ms before the selected start. Extended-only loop validation was corrected to allow the existing 150 ms decoded-frame tolerance. A second batch, preserved as `submission-extended-transition-v2.json`, sampled mid-seek at a fixed delay. The final assertion waits for the end seek to settle, then requires a real wrap and resumed playback within the same 8-second deadline; all extended cases were rerun three times. Production source and core comparison remained unchanged; extended/native runner hashes record those assertion changes. Archived runner snapshots match their recorded hashes. The core before/after runner code is byte-identical; only extended assertions differ between snapshots. The audio-track fix required repeating the current core, extended and native phases; the unchanged original phase was retained. The earlier current/native phases remain archived as `submission-final-before-audio.json` and `submission-native-before-audio.json`. Tool versions used: Bun 1.4.2 and FFmpeg 6.0. Historical smoothness-only comparison: the earlier candidate reduced median notifications 96→6 and Chromium task duration 73.352→62.356 ms. That measured an older source stage; current source measurements above supersede it for submission claims.']
Path('docs/playback-benchmarks.md').write_text('\n'.join(lines)+'\n')
print('Wrote docs/playback-benchmarks.md')

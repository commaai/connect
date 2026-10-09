// Test-only entry: mount the real viewer with synthetic metadata and local media.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MuiThemeProvider } from '@material-ui/core';
import store from '../../src/store';
import theme from '../../src/theme';
import Media from '../../src/components/DriveView/Media';
import Timeline, { Timeline as TimelineView } from '../../src/components/Timeline';
import { DriveMap } from '../../src/components/DriveMap';
import { initBackend, api } from '../../src/api/backend';
import * as Types from '../../src/actions/types';
import { seek, pause, play, resetPlayback, selectLoop } from '../../src/timeline/playback';
import { currentOffset } from '../../src/timeline';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const start = Number(params.get('start') || 0);
const duration = Number(params.get('duration') || 60);
const details = params.has('details');
if (params.has('manual')) {
  const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = '/playback-test.webmanifest'; document.head.append(manifest);
}
const mediaUrl = params.get('media') || '/media/stream.m3u8';
initBackend('/demo');
api.video.getQcameraStreamUrl = (fullname, _, signature) => `${mediaUrl}?route=${encodeURIComponent(fullname)}${signature ? `&sig=${signature}` : ''}`;
const device = { dongle_id: 'deadbeefdeadbeef', alias: 'Benchmark fixture', shared: true, is_owner: false };
const makeRoute = (id) => ({
  fullname: `deadbeefdeadbeef|${id}`, log_id: id, duration: duration * 1000,
  start_time_utc_millis: Date.UTC(2026, 1, 25), end_time_utc_millis: Date.UTC(2026, 1, 25) + duration * 1000,
  segment_start_times: Array.from({ length: Math.ceil(duration / 60) }, (_, i) => Date.UTC(2026, 1, 25) + i * 60000),
  segment_end_times: Array.from({ length: Math.ceil(duration / 60) }, (_, i) => Date.UTC(2026, 1, 25) + Math.min(duration, (i + 1) * 60) * 1000),
  videoStartOffset: 0, events: [], driveCoords: details ? Object.fromEntries(Array.from({ length: duration + 1 }, (_, t) => [t, [-117.161052 + t * .0001, 32.711483 + t * .00005]])) : [], maxqlog: 0, url: location.origin + '/media',
});
const routes = [makeRoute('00000000--0000000001'), makeRoute('00000000--0000000002')];
store.dispatch({ type: Types.ACTION_STARTUP_DATA, devices: [device], profile: { id: 'benchmark' } });
store.dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId: device.dongle_id });
store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: device.dongle_id, start: 0, end: Date.now(), routes });
store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: routes[0].log_id, start: 0, end: duration * 1000 });
store.dispatch(resetPlayback());
store.dispatch(seek(start * 1000));
window.__bench = {
  started: performance.now(), store,
  seek: (seconds) => store.dispatch(seek(seconds * 1000)),
  pause: () => store.dispatch(pause()), play: (speed = 1) => store.dispatch(play(speed)),
  loop: (startSeconds, endSeconds) => store.dispatch(selectLoop(startSeconds * 1000, endSeconds * 1000)),
  switchRoute: () => { store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: routes[1].log_id, start: 0, end: duration * 1000 }); store.dispatch(resetPlayback()); },
  updateRoute: route => store.dispatch({ type: Types.ACTION_UPDATE_ROUTE, fullname: store.getState().currentRoute.fullname, route }),
  sample: () => {
    const video = document.querySelector('video');
    return { now: performance.now(), appSeconds: currentOffset() / 1000,
      videoSeconds: video?.currentTime ?? null, frames: video?.getVideoPlaybackQuality?.().totalVideoFrames ?? 0,
      droppedFrames: video?.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0,
      buffered: video ? Array.from({ length: video.buffered.length }, (_, i) => [video.buffered.start(i), video.buffered.end(i)]) : [],
      readyState: video?.readyState, paused: video?.paused, rate: video?.playbackRate,
      buffering: store.getState().isBufferingVideo, videoCount: document.querySelectorAll('video').length,
      hasAudio: !document.querySelector('button[aria-label=Unmute]')?.disabled, muted: video?.muted,
      playlist: window.__playlist?.map(f => ({ title: f.title, start: f.start, duration: f.duration, startPTS: f.startPTS, endPTS: f.endPTS, videoStart: f.elementaryStreams?.video?.startPTS, audioStart: f.elementaryStreams?.audio?.startPTS })),
      map: window.__marker, timeline: window.__timelinePosition,
      errorVisible: /Unable to load|not uploaded|deleted|Check network|No video/.test(document.body.innerText),
      retryVisible: Boolean(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Retry')) };
  },
};
// Observe the actual map GeoJSON and timeline DOM output, not just their clock input.
async function mount() {
if (details) {
  const { default: Hls } = await import('hls.js');
  const trigger = Hls.prototype.trigger;
  Hls.prototype.trigger = function (event, data) {
    if (event === Hls.Events.LEVEL_LOADED) window.__playlist = data.details.fragments;
    return trigger.call(this, event, data);
  };
  const marker = DriveMap.prototype.updateMarkerPos;
  DriveMap.prototype.updateMarkerPos = function () {
    marker.call(this);
    const coordinates = this.map?.getMap()?.getSource('seekPoint')?._data?.coordinates;
    if (coordinates?.length) window.__marker = { now: performance.now(), coordinates: [...coordinates] };
  };
  const timeline = TimelineView.prototype.getOffset;
  TimelineView.prototype.getOffset = function () {
    timeline.call(this);
    if (this.rulerRemaining.current) window.__timelinePosition = Number.parseFloat(this.rulerRemaining.current.style.left);
  };
}
function ManualChecks() {
  const checks = ['Cold route and nonzero seek', 'Pause and resume', 'Rapid seeks and minute boundaries', 'Selected range loops at zero and near the end', 'Video and Map keep the same position', 'Audio is audible and mute works', 'Missing-minute seeks land on available footage', 'Offline and reconnect recover correctly', 'Background and lock-screen resume', 'Installed standalone PWA playback'];
  const [results, setResults] = React.useState({});
  const [device, setDevice] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const download = () => {
    const evidence = { recordedAt: new Date().toISOString(), device, userAgent: navigator.userAgent, secureContext: window.isSecureContext,
      standalone: matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone), mediaUrl,
      transport: document.querySelector('video').currentSrc.startsWith('blob:') ? 'MSE/HLS.js' : 'native HLS', checks: results, notes };
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' })); link.download = 'connect-device-checks.json'; link.click(); URL.revokeObjectURL(link.href);
  };
  return <aside style={{ padding: 24, margin: '24px 0', background: '#20252d', color: '#fff' }}><h2>Physical device checks</h2>
    <p>This test uses the real viewer and generated H.264/AAC footage. Also test the full <a href="/demo">Connect demo</a>.</p>
    <p><a href="?details=1&manual=1&duration=180&media=/media/minute/stream.m3u8">Normal stream</a> · <a href="?details=1&manual=1&duration=180&media=/media/minute/gap.m3u8">Missing middle minute</a></p>
    <label>Device model, OS version, browser version <input value={device} onChange={event => setDevice(event.target.value)} /></label>
    {checks.map(check => <label key={check} style={{ display: 'block', margin: '12px 0' }}>{check} <select value={results[check] || 'untested'} onChange={event => setResults({ ...results, [check]: event.target.value })}>{['untested', 'pass', 'fail', 'not applicable'].map(value => <option key={value}>{value}</option>)}</select></label>)}
    <label>Observations <textarea value={notes} onChange={event => setNotes(event.target.value)} /></label><p><button onClick={download}>Download device results</button></p>
  </aside>;
}
function View() {
  const [route, setRoute] = React.useState(store.getState().currentRoute);
  React.useEffect(() => store.subscribe(() => setRoute(store.getState().currentRoute)), []);
  return <main style={{ maxWidth: 1000, margin: '24px auto' }}><h1>Local playback benchmark</h1><Media /><Timeline route={route} currentRoute={route} hasRuler thumbnailsVisible />{params.has('manual') && <ManualChecks />}</main>;
}
createRoot(document.getElementById('root')).render(<Provider store={store}><MuiThemeProvider theme={theme}><View /></MuiThemeProvider></Provider>);
}
mount();

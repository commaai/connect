import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MuiThemeProvider } from '@material-ui/core';
import Media from '../../src/components/DriveView/Media';
import Theme from '../../src/theme';
import store from '../../src/store';
import { api } from '../../src/api/backend';
import * as Types from '../../src/actions/types';
import { pushTimelineRange, updateRoute } from '../../src/actions';
import { pause, play, seek, selectLoop } from '../../src/timeline/playback';
import { currentOffset } from '../../src/timeline';
import '../../src/index.css';
import 'mapbox-gl/dist/mapbox-gl.css';

// Only the data boundary is replaced: the player, HLS implementation, controls,
// reducer and media element all come from production code.
window.gtag = () => {};
const params = new URLSearchParams(location.search);
const run = params.get('run');
const initialOrigin = params.get('origin') === 'unknown' ? null : Number(params.get('origin') || 0);
api.video.getQcameraStreamUrl = (fullname, _expiry, signature) => (
  `${location.origin}/__media/${run}/${encodeURIComponent(fullname)}/audio.m3u8?signature=${signature || 'first'}`
);

const dongleId = 'aaaaaaaaaaaaaaaa';
const routes = [1, 2].map((index) => ({
  fullname: `${dongleId}|00000000--000000000${index}`,
  log_id: `00000000--000000000${index}`,
  duration: 24000,
  start_time_utc_millis: Date.UTC(2026, 0, 1),
  videoStartOffset: initialOrigin,
  share_sig: 'first',
  events: [],
  // Cached coordinates keep the real DriveMap independent of API/GPS services.
  driveCoords: Object.fromEntries(Array.from({ length: 25 }, (_, second) => (
    [second, [-117.16 + second * 0.00001, 32.71 + second * 0.00001]]
  ))),
}));
store.dispatch({ type: Types.ACTION_ROUTES_METADATA, routes, dongleId, start: 0, end: 24000 });
store.dispatch(pushTimelineRange(routes[0].log_id, 0, 24000, false));
store.dispatch(pause());

const mediaIds = new WeakMap();
let nextMediaId = 1;
const events = [];
function record(event) {
  events.push(event);
  if (events.length > 1000) events.shift();
}
store.subscribe(() => {
  const state = store.getState();
  record({ event: 'state', at: performance.now(), desiredSpeed: state.desiredPlaySpeed,
    offset: state.offset, seekId: state.seekId, route: state.currentRoute?.fullname });
});
const video = () => document.querySelector('video');
function mediaId(element) {
  if (!element) return null;
  if (!mediaIds.has(element)) {
    mediaIds.set(element, nextMediaId);
    nextMediaId += 1;
  }
  return mediaIds.get(element);
}
for (const name of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'play', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'ended', 'error', 'emptied', 'ratechange', 'volumechange']) {
  document.addEventListener(name, (event) => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    record({ event: name, at: performance.now(), mediaId: mediaId(event.target), time: event.target.currentTime,
      paused: event.target.paused, readyState: event.target.readyState, route: store.getState().currentRoute?.fullname,
      desiredSpeed: store.getState().desiredPlaySpeed });
  }, true);
}

function snapshot() {
  const element = video();
  const state = store.getState();
  const controls = document.querySelector('[aria-label="Jump back 10 seconds"]')?.parentElement.parentElement;
  const audioButton = controls?.querySelector('[aria-label="Mute"], [aria-label="Unmute"]');
  const wrapper = element?.closest('[aria-hidden]')?.parentElement;
  const ranges = [];
  for (let index = 0; element && index < element.buffered.length; index++) {
    ranges.push([element.buffered.start(index), element.buffered.end(index)]);
  }
  return {
    mediaId: mediaId(element), currentTime: element?.currentTime, paused: element?.paused,
    seeking: element?.seeking, ended: element?.ended, readyState: element?.readyState,
    duration: element?.duration, rate: element?.playbackRate, muted: element?.muted,
    decodedFrames: element?.getVideoPlaybackQuality?.().totalVideoFrames ?? element?.webkitDecodedFrameCount ?? 0,
    decodedAudioBytes: element?.webkitAudioDecodedByteCount ?? null,
    buffered: ranges, nativeError: element?.error?.code ?? null,
    desiredSpeed: state.desiredPlaySpeed, offset: currentOffset(), storedOffset: state.offset,
    seekId: state.seekId, loop: state.loop, origin: state.currentRoute?.videoStartOffset,
    route: state.currentRoute?.fullname, signature: state.currentRoute?.share_sig,
    spinner: Boolean(document.querySelector('[role="progressbar"]')),
    error: [...document.querySelectorAll('p')].map((el) => el.textContent)
      .find((text) => /Unable to load video|not uploaded yet|has been deleted/.test(text)) || null,
    clockText: controls?.querySelector('p span')?.textContent ?? null,
    playLabel: controls?.querySelector('[aria-label="Pause"], [aria-label="Unpause"]')?.getAttribute('aria-label'),
    audioEnabled: Boolean(audioButton && !audioButton.disabled),
    mapVisible: Boolean(element?.closest('[aria-hidden="true"]')),
    wrapper: wrapper ? { width: wrapper.getBoundingClientRect().width, height: wrapper.getBoundingClientRect().height,
      overflow: getComputedStyle(wrapper).overflow } : null,
  };
}

// The bridge issues real app actions; it cannot write media properties or state.
window.playbackHarness = {
  snapshot,
  events: () => events.slice(),
  seek: (offset) => store.dispatch(seek(offset)),
  pause: () => {
    store.dispatch(pause());
    record({ event: 'command-pause', at: performance.now(), desiredSpeed: store.getState().desiredPlaySpeed });
  },
  play: (speed = 1) => store.dispatch(play(speed)),
  loop: (start, end) => store.dispatch(selectLoop(start, end)),
  refresh: () => store.dispatch(updateRoute(store.getState().currentRoute.fullname, { share_sig: 'refreshed' })),
  selectRoute: (index) => {
    store.dispatch(pushTimelineRange(routes[index].log_id, 0, 24000, false));
    record({ event: 'command-route', at: performance.now(), desiredSpeed: store.getState().desiredPlaySpeed });
  },
  origin: (offset) => store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS,
    fullname: store.getState().currentRoute.fullname,
    events: [{ type: 'event', route_offset_millis: offset, data: { event_type: 'first_road_camera_frame' } }] }),
};

createRoot(document.getElementById('root')).render(
  <MuiThemeProvider theme={Theme}>
    <Provider store={store}>
      <main style={{ maxWidth: 900, margin: '20px auto', padding: 16 }}><Media /></main>
    </Provider>
  </MuiThemeProvider>,
);

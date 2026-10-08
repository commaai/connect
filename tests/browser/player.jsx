import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MuiThemeProvider } from '@material-ui/core';
import store from '../../src/store';
import Theme from '../../src/theme';
import DriveView from '../../src/components/DriveView';
import { pushTimelineRange, updateRoute } from '../../src/actions';
import * as Types from '../../src/actions/types';
import { api } from '../../src/api/backend';
import '../../src/index.css';

// Mount the production viewer and controls with deterministic route metadata.
// The browser tests serve generated HLS video; no account or comma is needed.
const mediaUrl = new URLSearchParams(window.location.search).get('media');
api.video.getQcameraStreamUrl = (_route, _exp, sig) => `${mediaUrl}?sig=${sig || ''}`;
const dongleId = '0000aaaa0000aaaa';
const logId = '2026-08-06--12-00-00';
const start = Date.UTC(2026, 7, 6, 12);
const route = {
  fullname: `${dongleId}|${logId}`, log_id: logId, duration: 20000,
  start_time_utc_millis: start, end_time_utc_millis: start + 20000,
  segment_numbers: [0], segment_start_times: [start], segment_end_times: [start + 20000],
  url: '/__video-fixture__', events: [], driveCoords: {}, maxqlog: 0,
};
store.dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId });
store.dispatch({ type: Types.ACTION_STARTUP_DATA, profile: null,
  devices: [{ dongle_id: dongleId, alias: 'Playback fixture', shared: true }] });
store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId, routes: [route], start, end: start + 20000 });
store.dispatch(pushTimelineRange(logId, 0, 20000, false));

function Fixture() {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return <>
    <div className="p-4 flex gap-4">
      <button onClick={() => store.dispatch(pushTimelineRange(logId, 8000, 12000, false))}>Select 8–12 second clip</button>
      <button onClick={() => store.dispatch(updateRoute(route.fullname, { share_sig: 'replacement' }))}>Replace source</button>
    </div>
    <DriveView />
    <output data-testid="playback-state">{JSON.stringify({ offset: state.offset, speed: state.desiredPlaySpeed,
      revision: state.seekRevision, buffering: state.isBufferingVideo })}</output>
  </>;
}

createRoot(document.getElementById('root')).render(
  <MuiThemeProvider theme={Theme}><Provider store={store}><Fixture /></Provider></MuiThemeProvider>,
);

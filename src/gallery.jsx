import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { MemoryRouter } from 'react-router-dom';
import { CssBaseline, MuiThemeProvider } from '@material-ui/core';
import MyCommaAuth from '@commaai/my-comma-auth';

import './index.css';
import Theme from './theme';
import {
  athena, billing, devices, drives, raw, video as routeVideo,
} from './api';
import { webrtcConnectionManager } from './utils/webrtc';
import AnonymousLanding from './components/anonymous';
import Explorer from './components/explorer';
import rawEvents from './gallery-fixtures/events.generated.json';
import sprite from './gallery-fixtures/5beb9b58bd12b691/0000010a--a51155e496/0/sprite.jpg?url';

const noop = () => {};
const now = Date.now();
const dongleId = '5beb9b58bd12b691';
const logId = '0000010a--a51155e496';
const duration = 925000;
const segments = Array.from({ length: 16 }, (_, index) => index);

function parseEvents(events) {
  const parsed = [];
  let engaged;
  let alert;
  let overriding;

  for (const event of events
    .map((item) => ({
      ...item,
      data: {
        ...item.data,
        alertStatus: typeof item.data?.alertStatus === 'number'
          ? ['normal', 'userPrompt', 'critical'][item.data.alertStatus]
          : item.data?.alertStatus,
      },
    }))
    .sort((a, b) => a.route_offset_millis - b.route_offset_millis)) {
    if (event.type === 'event') {
      parsed.push(event);
      continue;
    }
    const offset = event.route_offset_millis;
    if (engaged && !event.data.enabled) {
      engaged.data.end_route_offset_millis = offset;
      engaged = null;
    }
    if (!engaged && event.data.enabled) {
      engaged = { ...event, type: 'engage', data: { ...event.data } };
      parsed.push(engaged);
    }
    if (alert && event.data.alertStatus !== alert.data.alertStatus) {
      alert.data.end_route_offset_millis = offset;
      alert = null;
    }
    if (!alert && event.data.alertStatus !== 'normal') {
      alert = { ...event, type: 'alert', data: { ...event.data } };
      parsed.push(alert);
    }
    if (overriding && event.data.state !== overriding.data.state) {
      overriding.data.end_route_offset_millis = offset;
      overriding = null;
    }
    if (!overriding && ['overriding', 'preEnabled'].includes(event.data.state)) {
      overriding = { ...event, type: 'overriding', data: { ...event.data } };
      parsed.push(overriding);
    }
  }
  [engaged, alert, overriding].forEach((event) => {
    if (event) event.data.end_route_offset_millis = duration;
  });
  return parsed;
}

const route = {
  car_id: 1238,
  create_time: 1772040714,
  distance: 10.1977,
  dongle_id: dongleId,
  duration,
  end_lat: 32.8751,
  end_lng: -117.21,
  endLocation: { place: 'La Jolla', details: 'San Diego, CA' },
  end_time: '2026-02-25T17:45:55',
  end_time_utc_millis: 1772041555000,
  events: parseEvents(rawEvents),
  fullname: `${dongleId}|${logId}`,
  is_preserved: true,
  is_public: true,
  log_id: logId,
  make: 'ford',
  maxqlog: 15,
  platform: 'FORD_BRONCO_SPORT_MK1',
  procqlog: 15,
  segment_durations: segments.map((index) => (index === 15 ? 25000 : 60000)),
  segment_end_times: segments.map((index) => (
    index === 15 ? 1772041555000 : 1772040690000 + (index * 60000)
  )),
  segment_numbers: segments,
  segment_start_times: segments.map((index) => 1772040630000 + (index * 60000)),
  share_exp: '1785555165',
  share_sig: 'fake',
  start_lat: 32.7498,
  start_lng: -117.195,
  startLocation: { place: 'San Diego', details: 'California' },
  start_time: '2026-02-25T17:30:30',
  start_time_utc_millis: 1772040630000,
  // The fragment lets the unchanged timeline append its segment path while reusing this fake sprite.
  url: `${sprite}#`,
  version: '0.10.4',
};

const device = {
  alias: 'Bronco Sport',
  commacare: true,
  device_type: 'tici',
  dongle_id: dongleId,
  eligible_features: { prime_data: true },
  fetched_at: Math.floor(now / 1000),
  is_owner: true,
  last_athena_ping: Math.floor(now / 1000),
  prime: false,
  rpc: { not_car: false },
  serial: 'cb421c10',
  version: '0.10.4',
};
const profile = {
  email: 'driver@example.com',
  id: 'fake-user',
  superuser: false,
  user_id: 'fake-user',
};
const subscribeInfo = {
  allow_data: true,
  amount: 2400,
  device_online: true,
  eligible: true,
  is_prime_sim: true,
  sim_id: '89014103211118510720',
  sim_type: 'blue',
  sim_usable: true,
  trial_claimable: true,
};
const subscription = {
  amount: 2400,
  cancel_at_period_end: false,
  current_period_end: Math.floor(now / 1000) + (86400 * 25),
  next_charge_at: Math.floor(now / 1000) + (86400 * 25),
  plan: 'data',
  status: 'active',
  subscribed_at: Math.floor(now / 1000) - (86400 * 190),
  trial_end: null,
  user_id: profile.user_id,
};

MyCommaAuth.isAuthenticated = () => true;
MyCommaAuth.logOut = async () => {};
devices.fetchDevice = async () => device;
devices.fetchDeviceStats = async () => ({ all: { distance: 2461, minutes: 3814, routes: 173 } });
devices.fetchLocation = async () => ({
  lat: route.start_lat,
  lng: route.start_lng,
  time: Math.floor(now / 1000),
});
devices.listDevices = async () => [device];
athena.postJsonRpcPayload = async (_id, payload) => {
  if (payload.method === 'getMessage') return { result: { peripheralState: { voltage: 12300 } } };
  if (payload.method === 'listUploadQueue') return { result: [] };
  return { result: payload.method !== 'getNotCar' };
};
billing.getSubscribeInfo = async () => subscribeInfo;
billing.getSubscription = async () => subscription;
drives.getPreservedRoutes = async () => [route];
raw.getRouteFiles = async () => ({});
routeVideo.getQcameraStreamUrl = () => 'data:video/mp4;base64,';

const teleopConnection = {
  connectionState: 'connected',
  failReason: null,
  pc: null,
  enableJoystick: noop,
  enableVideo: noop,
  setJoystick: noop,
  setQuality: noop,
  setTimingSei: noop,
  switchCamera: noop,
};
webrtcConnectionManager.connection = teleopConnection;
webrtcConnectionManager.prewarm = noop;
webrtcConnectionManager.release = noop;
webrtcConnectionManager.reconnect = () => teleopConnection;
webrtcConnectionManager.disconnect = noop;
webrtcConnectionManager.acquire = (_id, callbacks) => {
  callbacks.onConnectionState('connected');
  callbacks.onBatteryLevel({ level: 87, charging: false });
  callbacks.onIgnition(true);
  return teleopConnection;
};

const filter = { start: route.start_time_utc_millis - 86400000, end: now };
const location = (pathname) => ({ location: { pathname, search: '', hash: '' } });
const baseState = {
  router: location(`/${dongleId}`),
  dongleId,
  device,
  devices: [device],
  profile,
  filter,
  routes: [route],
  routesMeta: { dongleId, start: filter.start, end: filter.end },
  currentRoute: null,
  lastRoutes: [route],
  files: [],
  filesUploading: {},
  filesUploadingMeta: { dongleId, fetchedAt: now },
  primeNav: false,
  streamNav: false,
  subscription: null,
  subscribeInfo: null,
  zoom: null,
  loop: null,
  segmentRange: null,
  limit: 5,
  offset: 0,
  startTime: now,
  desiredPlaySpeed: 1,
  isBufferingVideo: false,
};
const makeStore = (state = {}) => createStore(
  (current = baseState) => current,
  { ...baseState, ...state },
  applyMiddleware(thunk),
);

const bodyDevice = {
  ...device,
  alias: 'comma body',
  device_type: 'tizi',
  rpc: { not_car: true },
};
const pageStates = {
  signin: {
    dongleId: null,
    device: null,
    devices: [],
    router: location('/'),
  },
  pair: {
    dongleId: null,
    device: null,
    devices: [],
    routes: [],
    router: location('/'),
  },
  dashboard: {},
  drive: {
    currentRoute: route,
    loop: { startTime: 0, duration },
    router: location(`/${dongleId}/${logId}`),
    segmentRange: { log_id: logId, start: 0, end: duration },
    zoom: { start: 0, end: duration, previous: null },
  },
  checkout: {
    primeNav: true,
    router: location(`/${dongleId}/prime`),
    subscribeInfo,
  },
  management: {
    device: { ...device, prime: true },
    devices: [{ ...device, prime: true }],
    primeNav: true,
    router: location(`/${dongleId}/prime`),
    subscription,
  },
  teleop: {
    device: bodyDevice,
    devices: [bodyDevice],
    router: location(`/${dongleId}/stream`),
    streamNav: true,
  },
};

const pageCss = `
  html, body, #root, .preview-page, .preview-page > div {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #16181a;
  }
  .preview-page .scrollstyle { height: 100% !important; }
  .preview-page .DriveView { min-height: calc(100% - 65px); }
  .preview-page video { max-height: 300px; }
`;

const ReadyMarker = ({ state }) => {
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!cancelled) document.documentElement.dataset.galleryReady = state;
    }));
    return () => { cancelled = true; };
  }, [state]);
  return null;
};

const pageName = new URLSearchParams(window.location.search).get('gallery');
if (!Object.hasOwn(pageStates, pageName)) {
  throw new Error(`Unknown gallery state: ${pageName ?? '(missing)'}`);
}

const app = (
  <Provider store={makeStore(pageStates[pageName])}>
    <MemoryRouter>
      <MuiThemeProvider theme={Theme}>
        <CssBaseline />
        <style>{pageCss}</style>
        <div className="preview-page">
          {pageName === 'signin' ? <AnonymousLanding /> : <Explorer />}
        </div>
        <ReadyMarker state={pageName} />
      </MuiThemeProvider>
    </MemoryRouter>
  </Provider>
);

ReactDOM.createRoot(document.getElementById('root')).render(app);

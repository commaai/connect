import React, { useEffect, useRef } from 'react';
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
import AccountMenu from './components/AppHeader/AccountMenu';
import AppHeader from './components/AppHeader';
import AnonymousLanding from './components/anonymous';
import ControlsBar from './components/BodyTeleop/ControlsBar';
import Joystick from './components/BodyTeleop/Joystick';
import SettingsMenu from './components/BodyTeleop/SettingsMenu';
import { StatsPanel } from './components/BodyTeleop/StatusBar';
import Video from './components/BodyTeleop/Video';
import CommacareBadge from './components/CommacareBadge';
import DriveListEmpty from './components/Dashboard/DriveListEmpty';
import DeviceList from './components/Dashboard/DeviceList';
import Explorer from './components/explorer';
import SwitchLoading from './components/utils/SwitchLoading';
import rawEvents from './gallery-fixtures/5beb9b58bd12b691/0000010a--a51155e496/events.json';
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
athena.postJsonRpcPayload = async (_id, payload) => ({
  result: payload.method === 'getMessage'
    ? { peripheralState: { voltage: 12300 } }
    : payload.method !== 'getNotCar',
});
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

const Frame = ({ title, page, tall, children }) => (
  <section className={page ? 'page' : ''}>
    <label>{title}</label>
    <div className={`frame ${page ? 'page-frame' : ''} ${tall ? 'tall' : ''}`}>{children}</div>
  </section>
);
const Page = ({ name }) => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('gallery', name);
  return <iframe title={name} src={url.href} />;
};
const OpenSettings = () => {
  const ref = useRef(null);
  useEffect(() => ref.current?.querySelector('[title="Settings"]')?.click(), []);
  return <div ref={ref} className="menu"><SettingsMenu onQualityChange={noop} /></div>;
};

const css = `
  :root { color-scheme: light; background: white; }
  html, body { margin: 0; background: white !important; color: #111; font: 12px Arial, sans-serif; }
  body { padding: 12px; overflow: auto; }
  h1 { grid-column: 1 / -1; margin: 8px 0 0; padding-bottom: 6px; border-bottom: 1px solid #ccc; font-size: 15px; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 12px; align-items: start; }
  section { min-width: 0; }
  label { display: block; height: 16px; color: #555; font-size: 11px; }
  .frame { position: relative; height: 250px; overflow: hidden; contain: paint; transform: translateZ(0); border: 1px solid #aaa; background: #16181a; color: white; }
  .page-frame { height: 620px; }
  iframe { width: 100%; height: 100%; border: 0; }
  .tall { height: 420px; }
  .pad { padding: 16px; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
  .video, .video video { height: 100%; }
  .video video { background: #050607; }
  .stats { position: relative; min-height: 225px; }
  .menu { position: absolute; right: 16px; top: 16px; }
  .account { position: absolute; right: 16px; top: 16px; width: 250px; }
  .empty > div { min-height: 65px; }
  .joystick { width: 180px; height: 180px; margin: 34px auto 0; }
  @media (min-width: 1050px) { .page { grid-column: span 2; } }
`;

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

const Gallery = () => {
  const videoRef = useRef(null);
  const latency = {
    networkMs: 18.2,
    decodeMs: 7.4,
    displayMs: 4.8,
    devicePipelineMs: 23.1,
    totalMs: 53.5,
  };
  return (
    <MemoryRouter>
      <MuiThemeProvider theme={Theme}>
        <CssBaseline />
        <style>{css}</style>
        <main>
          <h1>Pages</h1>
          <Frame title="Sign in" page>
            <Page name="signin" />
          </Frame>
          <Frame title="Pair a device" page>
            <Page name="pair" />
          </Frame>
          <Frame title="Dashboard" page>
            <Page name="dashboard" />
          </Frame>
          <Frame title="Drive" page>
            <Page name="drive" />
          </Frame>
          <Frame title="Prime checkout" page>
            <Page name="checkout" />
          </Frame>
          <Frame title="Prime management" page>
            <Page name="management" />
          </Frame>
          <Frame title="Teleop" page>
            <Page name="teleop" />
          </Frame>

          <h1>Components</h1>
          <Frame title="App header" page>
            <AppHeader
              drawerIsOpen={false}
              viewingRoute={false}
              showDrawerButton
              handleDrawerStateChanged={noop}
            />
          </Frame>
          <Frame title="Device list" tall>
            <DeviceList selectedDevice={dongleId} handleDeviceSelected={noop} />
          </Frame>
          <Frame title="Empty route list">
            <div className="empty">
              <DriveListEmpty device={device} routes={null} />
              <DriveListEmpty device={device} routes={[]} />
            </div>
          </Frame>
          <Frame title="Account menu">
            <div className="account"><AccountMenu open profile={profile} onClose={noop} /></div>
          </Frame>
          <Frame title="Switch">
            <div className="pad">
              <SwitchLoading checked label="Public route" onChange={async () => ({})} />
              <SwitchLoading checked={false} loading label="Preserved" onChange={async () => ({})} />
            </div>
          </Frame>
          <Frame title="commacare">
            <div className="pad row"><CommacareBadge /><CommacareBadge variant="pill" /></div>
          </Frame>
          <Frame title="Teleop video: connecting" page>
            <Video
              className="video"
              videoRef={videoRef}
              connectionState="connecting"
              onConnect={noop}
              started={false}
            />
          </Frame>
          <Frame title="Teleop video: failed">
            <Video
              className="video"
              videoRef={videoRef}
              connectionState="failed"
              error="Device connection timed out"
              onConnect={noop}
              started
            />
          </Frame>
          <Frame title="Teleop controls">
            <div className="pad">
              <ControlsBar
                activeCamera="wideRoad"
                onSwitchCamera={noop}
                gamepadConnected={false}
                videoRef={videoRef}
                isLandscape={false}
                controlsDisabled={false}
              />
            </div>
          </Frame>
          <Frame title="Teleop joystick">
            <div className="joystick">
              <Joystick
                connection={null}
                activeCamera="wideRoad"
                className="relative w-full h-full"
                onGamepadChange={noop}
                onSwitchCamera={noop}
                gamepadConnected={false}
                onInputActiveChange={noop}
              />
            </div>
          </Frame>
          <Frame title="Teleop settings"><OpenSettings /></Frame>
          <Frame title="Teleop statistics">
            <div className="stats">
              <StatsPanel
                isLandscape={false}
                stats={{
                  fps: '20.0',
                  bitrate: '1.52 Mbps',
                  rtt: '18 ms',
                  packetLoss: '0.1%',
                  jitter: '2.4 ms',
                }}
                latency={latency}
                latencyHistory={[latency]}
              />
            </div>
          </Frame>
        </main>
      </MuiThemeProvider>
    </MemoryRouter>
  );
};

const pageName = new URLSearchParams(window.location.search).get('gallery');
const app = pageStates[pageName] ? (
  <Provider store={makeStore(pageStates[pageName])}>
    <MemoryRouter>
      <MuiThemeProvider theme={Theme}>
        <CssBaseline />
        <style>{pageCss}</style>
        <div className="preview-page">
          {pageName === 'signin' ? <AnonymousLanding /> : <Explorer />}
        </div>
      </MuiThemeProvider>
    </MemoryRouter>
  </Provider>
) : <Provider store={makeStore()}><Gallery /></Provider>;

ReactDOM.createRoot(document.getElementById('root')).render(app);

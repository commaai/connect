import React, { Component, createRef, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { MemoryRouter } from 'react-router-dom';
import {
  Button, Checkbox, Chip, CircularProgress, CssBaseline, Input, Radio,
  SnackbarContent, TextField, MuiThemeProvider,
} from '@material-ui/core';

import './index.css';
import './gallery.css';
import Theme from './theme';
import {
  athena as Athena, billing as Billing, devices as Devices, raw as Raw, video as RouteVideo,
} from './api';
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
import ErrorFallback from './components/ErrorFallback';
import Explorer from './components/explorer';
import SwitchLoading from './components/utils/SwitchLoading';
import {
  galleryBodyDevice,
  galleryDevice,
  galleryDongleId,
  galleryLogId,
  galleryProfile,
  galleryRoute,
  gallerySubscribeInfo,
  gallerySubscription,
} from './gallery-fixtures/route';

const noop = () => {};
const now = Date.now();
const filter = { start: galleryRoute.start_time_utc_millis - 86400000, end: now };

Devices.fetchDeviceStats = async () => ({
  all: { distance: 2461, minutes: 3814, routes: 173 },
});
Devices.fetchLocation = async () => ({
  lat: galleryRoute.start_lat,
  lng: galleryRoute.start_lng,
  time: Math.floor(Date.now() / 1000),
});
Devices.listDevices = async () => [galleryDevice];
Athena.postJsonRpcPayload = async (_dongleId, payload) => {
  if (payload.method === 'getMessage') {
    return { result: { peripheralState: { voltage: 12300 } } };
  }
  if (payload.method === 'getNotCar') return { result: false };
  return { result: true };
};
Billing.getSubscribeInfo = async () => gallerySubscribeInfo;
Billing.getSubscription = async () => gallerySubscription;
Raw.getRouteFiles = async () => ({});
RouteVideo.getQcameraStreamUrl = () => 'data:video/mp4;base64,';

const baseState = {
  router: { location: { pathname: `/${galleryDongleId}`, search: '', hash: '' } },
  dongleId: galleryDongleId,
  device: galleryDevice,
  devices: [galleryDevice],
  profile: galleryProfile,
  filter,
  routes: [galleryRoute],
  routesMeta: { dongleId: galleryDongleId, start: filter.start, end: filter.end },
  currentRoute: null,
  lastRoutes: [galleryRoute],
  files: [],
  filesUploading: {},
  filesUploadingMeta: { dongleId: galleryDongleId, fetchedAt: now },
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

const galleryReducer = (state = baseState) => state;

const makeStore = (overrides = {}) => createStore(
  galleryReducer,
  { ...baseState, ...overrides },
  applyMiddleware(thunk),
);

const componentStore = makeStore();

class FrameBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error
      ? <pre className="gallery-pad">{String(this.state.error)}</pre>
      : this.props.children;
  }
}

const Frame = ({ title, children, tall = false, wide = false, className = '' }) => (
  <section className={`gallery-item ${wide ? 'gallery-wide' : ''}`}>
    <h2 className="gallery-label">{title}</h2>
    <div className={`gallery-frame ${tall ? 'tall' : ''} ${className}`}>
      <FrameBoundary><div className="frame-scale">{children}</div></FrameBoundary>
    </div>
  </section>
);

const GallerySection = ({ title, description, children }) => (
  <section className="gallery-section">
    <div className="gallery-section-heading">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    <div className="gallery-grid">{children}</div>
  </section>
);

const FullPage = ({ state, children }) => (
  <Provider store={makeStore(state)}>
    <div className="gallery-full-page">{children}</div>
  </Provider>
);

const OpenSettings = () => {
  const host = useRef(null);
  useEffect(() => { host.current?.querySelector('[title="Settings"]')?.click(); }, []);
  return <div ref={host} className="gallery-menu"><SettingsMenu onQualityChange={noop} /></div>;
};

const Gallery = () => {
  const videoRef = createRef();
  const latency = { networkMs: 18.2, decodeMs: 7.4, displayMs: 4.8, devicePipelineMs: 23.1, totalMs: 53.5 };
  const stats = { fps: '20.0', bitrate: '1.52 Mbps', rtt: '18 ms', packetLoss: '0.1%', jitter: '2.4 ms' };
  return (
    <MemoryRouter>
      <MuiThemeProvider theme={Theme}>
        <CssBaseline />
        <h1 className="gallery-title">connect pages and components</h1>
        <main>
            <GallerySection
              title="Device pages"
              description="Every non-teleop page, rendered through the real connect page components."
            >
              <Frame title="Sign in" wide className="gallery-page-frame">
                <FullPage state={{
                  dongleId: null,
                  device: null,
                  devices: [],
                  router: { location: { pathname: '/', search: '', hash: '' } },
                }}>
                  <AnonymousLanding galleryPreview />
                </FullPage>
              </Frame>
              <Frame title="Pair a device / no devices" wide className="gallery-page-frame">
                <FullPage state={{
                  dongleId: null,
                  device: null,
                  devices: [],
                  routes: [],
                  router: { location: { pathname: '/', search: '', hash: '' } },
                }}>
                  <Explorer galleryPreview />
                </FullPage>
              </Frame>
              <Frame title="Device dashboard and drives" wide className="gallery-page-frame">
                <FullPage>
                  <Explorer galleryPreview />
                </FullPage>
              </Frame>
              <Frame title="Drive detail" wide className="gallery-page-frame">
                <FullPage state={{
                  currentRoute: galleryRoute,
                  loop: { startTime: 0, duration: galleryRoute.duration },
                  offset: 0,
                  router: {
                    location: {
                      pathname: `/${galleryDongleId}/${galleryLogId}`,
                      search: '',
                      hash: '',
                    },
                  },
                  segmentRange: { log_id: galleryLogId, start: 0, end: galleryRoute.duration },
                  zoom: { start: 0, end: galleryRoute.duration, previous: null },
                }}>
                  <Explorer galleryPreview />
                </FullPage>
              </Frame>
              <Frame title="Prime checkout" wide className="gallery-page-frame">
                <FullPage state={{
                  primeNav: true,
                  subscribeInfo: gallerySubscribeInfo,
                  router: {
                    location: { pathname: `/${galleryDongleId}/prime`, search: '', hash: '' },
                  },
                }}>
                  <Explorer galleryPreview />
                </FullPage>
              </Frame>
              <Frame title="Prime management" wide className="gallery-page-frame">
                <FullPage state={{
                  device: { ...galleryDevice, prime: true },
                  devices: [{ ...galleryDevice, prime: true }],
                  primeNav: true,
                  subscription: gallerySubscription,
                  router: {
                    location: { pathname: `/${galleryDongleId}/prime`, search: '', hash: '' },
                  },
                }}>
                  <Explorer galleryPreview />
                </FullPage>
              </Frame>
            </GallerySection>

            <GallerySection
              title="Teleop"
              description="The real full teleop page followed by its isolated component states."
            >
              <Frame title="Teleop: full page" wide className="gallery-page-frame">
                <FullPage state={{
                  device: galleryBodyDevice,
                  devices: [galleryBodyDevice],
                  router: {
                    location: { pathname: `/${galleryDongleId}/stream`, search: '', hash: '' },
                  },
                  streamNav: true,
                }}>
                  <Explorer galleryPreview />
                </FullPage>
              </Frame>
              <Frame title="Teleop video: connecting" wide>
                <Video className="gallery-video" videoRef={videoRef} connectionState="connecting" connectionTotalMs={null} onConnect={noop} started={false} />
              </Frame>
              <Frame title="Teleop video: failed">
                <Video className="gallery-video" videoRef={videoRef} connectionState="failed" error="Device connection timed out" onConnect={noop} started />
              </Frame>
              <Frame title="Teleop controls">
                <div className="gallery-pad"><ControlsBar activeCamera="wideRoad" onSwitchCamera={noop} gamepadConnected={false} videoRef={videoRef} isLandscape={false} controlsDisabled={false} /></div>
              </Frame>
              <Frame title="Teleop joystick">
                <div className="gallery-joystick">
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
              <Frame title="Teleop settings menu"><OpenSettings /></Frame>
              <Frame title="Teleop connection statistics">
                <div className="gallery-stats"><StatsPanel isLandscape={false} stats={stats} latency={latency} latencyHistory={[latency, { ...latency, totalMs: 61.2 }]} /></div>
              </Frame>
            </GallerySection>

            <GallerySection
              title="Components"
              description="Reusable connect UI, with one isolated frame per component."
            >
              <Frame title="App header" wide><AppHeader drawerIsOpen={false} viewingRoute={false} showDrawerButton handleDrawerStateChanged={noop} /></Frame>
              <Frame title="Device list" tall><DeviceList selectedDevice={galleryDongleId} handleDeviceSelected={noop} /></Frame>
              <Frame title="Route list: loading and empty" className="gallery-empty">
                <DriveListEmpty device={galleryDevice} routes={null} />
                <DriveListEmpty device={galleryDevice} routes={[]} />
              </Frame>
              <Frame title="Account menu">
                <div className="gallery-account"><AccountMenu open profile={galleryProfile} onClose={noop} /></div>
              </Frame>
              <Frame title="Switch, loading, tooltip">
                <div className="gallery-pad">
                  <SwitchLoading checked label="Public route" tooltip="Anyone with the link can view this route." onChange={async () => ({})} />
                  <SwitchLoading checked={false} loading label="Preserved" onChange={async () => ({})} />
                </div>
              </Frame>
              <Frame title="commacare badge">
                <div className="gallery-pad gallery-row"><CommacareBadge /><CommacareBadge variant="pill" /></div>
              </Frame>
              <Frame title="Material controls used throughout connect" wide>
                <div className="gallery-pad gallery-row">
                  <Button variant="contained" color="primary">Primary</Button>
                  <Button variant="contained" color="secondary">Secondary</Button>
                  <Button disabled>Disabled</Button>
                  <Input placeholder="Input" />
                  <TextField label="Text field" defaultValue="Fake data" />
                  <Checkbox checked onChange={noop} />
                  <Radio checked onChange={noop} />
                  <Chip label="Chip" />
                  <CircularProgress size={28} />
                  <SnackbarContent message="Route link copied" />
                </div>
              </Frame>
              <Frame title="Error fallback" tall>
                <div className="gallery-error"><ErrorFallback error={new Error('Fake CI rendering error')} componentStack={'\\n  in Gallery'} /></div>
              </Frame>
            </GallerySection>
        </main>
      </MuiThemeProvider>
    </MemoryRouter>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <Provider store={componentStore}><Gallery /></Provider>,
);

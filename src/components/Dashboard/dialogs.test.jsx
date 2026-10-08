import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import { createMemoryHistory } from 'history';
import { routerMiddleware } from 'connected-react-router';

import AddDevice from './AddDevice';
import DeviceList from './DeviceList';
import DeviceSettingsModal from './DeviceSettingsModal';
import DriveList from './DriveList';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getUserMedia: vi.fn(),
  pilotPair: vi.fn(),
  setDeviceAlias: vi.fn(),
  unpair: vi.fn(),
  share: vi.fn(),
}));
vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => mocks.authenticated } }));
vi.mock('../../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => mocks.authenticated },
  devices: {
    listDevices: vi.fn(async () => []),
    pilotPair: mocks.pilotPair,
    setDeviceAlias: mocks.setDeviceAlias,
    unpair: mocks.unpair,
    grantDeviceReadPermission: mocks.share,
  },
  stats: { fetchDeviceStats: vi.fn(async () => ({ all: { distance: 0, routes: 0, minutes: 0 } })) },
} }));
vi.mock('../../actions', () => ({
  updateDevice: (device) => ({ type: 'UPDATE_DEVICE', device }),
  updateDevices: (devices) => ({ type: 'UPDATE_DEVICES', devices }),
  selectDevice: (dongleId) => ({ type: 'SELECT_DEVICE', dongleId }),
  selectTimeFilter: (start, end) => ({ type: 'FILTER', start, end }),
  analyticsEvent: () => ({ type: 'ANALYTICS' }),
  checkRoutesData: () => ({ type: 'ROUTES' }),
  checkLastRoutesData: () => ({ type: 'LAST_ROUTES' }),
}));
vi.mock('../../utils', () => ({
  emptyDevice: { alias: 'Shared device', is_owner: false, shared: true },
  deviceNamePretty: (device) => device.alias,
  deviceIsOnline: () => false,
  filterRegularClick: (callback) => (event) => { event.preventDefault(); callback(); },
  verifyPairToken: vi.fn(),
  pairErrorToMessage: (error) => error.message,
}));
vi.mock('barcode-detector/ponyfill', () => ({ BarcodeDetector: class { detect() { return Promise.resolve([]); } } }));
vi.mock('../VisibilityHandler', () => ({ default: () => null }));
vi.mock('./DriveListEmpty', () => ({ default: () => null }));
vi.mock('./DriveListItem', () => ({ default: () => null }));
vi.mock('../Files/UploadQueue', () => ({ default: ({ open, update, device, onClose }) => (
  <div data-testid="upload-queue" data-update={String(update)} data-device={device.dongle_id}>
    {open && <button onClick={onClose}>Close upload queue</button>}
  </div>
) }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const first = { dongle_id: FIRST, alias: 'First', is_owner: true };
const second = { dongle_id: SECOND, alias: 'Second', is_owner: true };

function mount(path, children, overrides = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const initial = {
    router: { location: history.location },
    dongleId: FIRST, device: first, devices: [first, second], profile: {},
    routes: [], lastRoutes: [], filter: { start: 1_777_000_000_000, end: 1_778_000_000_000 },
    ...overrides,
  };
  const store = createStore((state = initial, action) => action.type === 'LOCATION'
    ? { ...state, router: { location: action.location } } : state,
  applyMiddleware(routerMiddleware(history)));
  history.listen((location) => store.dispatch({ type: 'LOCATION', location }));
  render(<Provider store={store}>{children}</Provider>);
  return { history, store };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: mocks.getUserMedia } });
});

it('opens settings for another owned device without changing the selected device or mutating it', () => {
  const { history, store } = mount(`/${FIRST}?campaign=test&dialog=settings&dialogDevice=${SECOND}#detail`, <DeviceSettingsModal />);
  expect(screen.getByLabelText('Device name')).toHaveValue('Second');
  expect(store.getState().dongleId).toBe(FIRST);
  expect(mocks.setDeviceAlias).not.toHaveBeenCalled();
  expect(mocks.unpair).not.toHaveBeenCalled();
  expect(mocks.share).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(history.location.pathname).toBe(`/${FIRST}`);
  expect(history.location.search).toBe('?campaign=test');
  expect(history.location.hash).toBe('#detail');
  expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
});

it.each([SECOND, 'cccccccccccccccc'])('does not expose settings or uploads for unauthorized target %s', (target) => {
  const { history } = mount(`/${FIRST}?dialog=settings&dialogDevice=${target}`, <DeviceSettingsModal />, {
    devices: [first, { ...second, is_owner: false, shared: true }],
  });
  expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
  act(() => history.push(`/${FIRST}?dialog=uploads&dialogDevice=${target}`));
  expect(screen.queryByTestId('upload-queue')).not.toBeInTheDocument();
});

it('uses history for settings, nested uploads, and back/forward restoration', () => {
  const { history } = mount(`/${FIRST}?campaign=test#detail`, <>
    <DeviceList selectedDevice={FIRST} handleDeviceSelected={vi.fn()} />
    <DeviceSettingsModal />
  </>);
  fireEvent.click(screen.getAllByRole('button', { name: 'device settings' })[1]);
  expect(new URLSearchParams(history.location.search).get('dialogDevice')).toBe(SECOND);
  fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
  expect(screen.getByTestId('upload-queue')).toHaveAttribute('data-device', SECOND);
  expect(screen.getByTestId('upload-queue')).toHaveAttribute('data-update', 'true');
  act(() => history.goBack());
  expect(screen.getByLabelText('Device name')).toHaveValue('Second');
  act(() => history.goForward());
  expect(screen.getByRole('button', { name: 'Close upload queue' })).toBeInTheDocument();
});

it('keeps route-file upload polling available without opening the queue', () => {
  mount(`/${FIRST}/2026-08-06--12-00-00?dialog=files`, <DeviceSettingsModal />);
  expect(screen.getByTestId('upload-queue')).toHaveAttribute('data-update', 'true');
  expect(screen.queryByRole('button', { name: 'Close upload queue' })).not.toBeInTheDocument();
});

it('does not display a previous device share error after navigating to another device', async () => {
  let rejectShare;
  mocks.share.mockImplementation(() => new Promise((_resolve, reject) => { rejectShare = reject; }));
  const { history } = mount(`/${FIRST}?dialog=settings`, <DeviceSettingsModal />);
  const email = screen.getByLabelText('Share by email or user id');
  fireEvent.change(email, { target: { value: 'viewer@example.com' } });
  fireEvent.keyPress(email, { key: 'Enter', charCode: 13 });
  expect(mocks.share).toHaveBeenCalledWith(FIRST, 'viewer@example.com');
  act(() => history.push(`/${FIRST}?dialog=settings&dialogDevice=${SECOND}`));
  await act(async () => rejectShare({ resp: { status: 404 } }));
  expect(screen.getByLabelText('Device name')).toHaveValue('Second');
  expect(screen.queryByText('could not find user')).not.toBeInTheDocument();
});

it('opens a single pairing form from URL without requesting a camera or pairing', () => {
  const { history } = mount('/?campaign=test#detail', <>
    <AddDevice buttonText="add new device" />
    <AddDevice modalOnly />
  </>);
  fireEvent.click(screen.getByRole('button', { name: 'add new device' }));
  expect(new URLSearchParams(history.location.search).get('dialog')).toBe('add-device');
  expect(screen.getAllByText('Pair device')).toHaveLength(1);
  expect(mocks.getUserMedia).not.toHaveBeenCalled();
  expect(mocks.pilotPair).not.toHaveBeenCalled();
  act(() => history.goBack());
  act(() => history.goForward());
  expect(screen.getByRole('button', { name: 'Enable camera' })).toBeInTheDocument();
  expect(mocks.getUserMedia).not.toHaveBeenCalled();
});

it('stops a late camera stream after navigation closes pairing', async () => {
  let resolveCamera;
  mocks.getUserMedia.mockImplementation(() => new Promise((resolve) => { resolveCamera = resolve; }));
  const stop = vi.fn();
  const { history } = mount('/?dialog=add-device', <AddDevice modalOnly />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
  expect(mocks.getUserMedia).toHaveBeenCalledTimes(1);
  act(() => history.push('/'));
  await act(async () => resolveCamera({ getTracks: () => [{ stop }] }));
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  expect(mocks.pilotPair).not.toHaveBeenCalled();
});

it('does not expose the pairing dialog while signed out', () => {
  mocks.authenticated = false;
  mount('/?dialog=add-device', <AddDevice modalOnly />);
  expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
  expect(mocks.getUserMedia).not.toHaveBeenCalled();
});

it('restores the date filter from URL and closes it without discarding other URL state', async () => {
  const { history } = mount(`/${FIRST}?campaign=test&dialog=time-filter#detail`, <DriveList />);
  expect(screen.getByText('Start date:')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(history.location.search).toBe('?campaign=test');
  expect(history.location.hash).toBe('#detail');
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  expect(screen.getByText('Start date:')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('hours')).toBeInTheDocument());
});

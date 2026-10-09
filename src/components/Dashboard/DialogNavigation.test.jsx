import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import DeviceList from './DeviceList';
import DeviceSettingsModal from './DeviceSettingsModal';
import AddDevice from './AddDevice';
import DriveList from './DriveList';
import AppHeader from '../AppHeader';
import NoDeviceUpsell from '../DriveView/NoDeviceUpsell';
import AppDrawer from '../AppDrawer';

vi.mock('../../actions/navigation', () => ({
  openDialog: (dialog, options = {}) => ({ type: 'TEST_DIALOG', dialog, ...options }),
  closeDialog: (parent = null) => ({ type: 'TEST_DIALOG', dialog: parent }),
}));
vi.mock('../../actions', () => ({
  updateDevices: (devices) => ({ type: 'TEST_DEVICES', devices }),
  selectDevice: (dongleId) => ({ type: 'TEST_DEVICE', dongleId }),
  updateDevice: vi.fn(() => ({ type: 'TEST_UPDATE' })),
  primeNav: vi.fn(() => ({ type: 'TEST_PRIME' })),
  analyticsEvent: vi.fn(() => ({ type: 'TEST_ANALYTICS' })),
  checkRoutesData: vi.fn(() => ({ type: 'TEST_ROUTES' })),
  checkLastRoutesData: vi.fn(() => ({ type: 'TEST_ROUTES' })),
}));
vi.mock('@commaai/my-comma-auth', () => ({
  default: { isAuthenticated: () => true, logOut: vi.fn() },
}));
vi.mock('../../api/backend', () => ({ api: {
  devices: {},
  stats: { fetchDeviceStats: vi.fn(async () => ({ all: { distance: 0, routes: 0, minutes: 0 } })) },
} }));
vi.mock('../../utils', () => ({
  deviceNamePretty: (device) => device.alias,
  deviceIsOnline: () => false,
  filterRegularClick: (callback) => (event) => { event.preventDefault(); callback(); },
  emptyDevice: { alias: 'Unknown' },
  verifyPairToken: vi.fn(),
  pairErrorToMessage: (error) => error.message,
}));
vi.mock('barcode-detector/ponyfill', () => ({
  BarcodeDetector: class { async detect() { return []; } },
}));
vi.mock('../VisibilityHandler', () => ({ default: () => null }));
vi.mock('../Files/UploadQueue', () => ({
  default: ({ open, onClose, device }) => open ? (
    <div data-testid="uploads">{device.dongle_id}<button onClick={onClose}>Close uploads</button></div>
  ) : null,
}));
vi.mock('../TimeSelect', () => ({
  default: ({ onClose }) => <div data-testid="date-range"><button onClick={onClose}>Close dates</button></div>,
}));
vi.mock('./DriveListEmpty', () => ({ default: ({ routes }) => routes?.length === 0 ? <div>No drives</div> : null }));
vi.mock('./DriveListItem', () => ({ default: ({ drive }) => <div data-testid="drive-entry">{drive.fullname}</div> }));
vi.mock('../ScrollIntoView', () => ({ default: ({ children }) => children }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const devices = [
  { dongle_id: FIRST, alias: 'First device', is_owner: true },
  { dongle_id: SECOND, alias: 'Second device', is_owner: true },
];

function makeStore(dialog = null, settingsDongleId = null, overrides = {}) {
  const state = {
    navigation: { page: 'dashboard', dialog, settingsDongleId },
    dongleId: FIRST,
    device: devices[0],
    devices,
    profile: { email: 'test@example.com', user_id: 'test-user' },
    router: { location: { pathname: `/${FIRST}`, search: '' } },
    routes: [],
    lastRoutes: [],
    ...overrides,
  };
  return createStore((current = state, action) => {
    if (action.type === 'TEST_DIALOG') {
      return { ...current, navigation: {
        ...current.navigation,
        dialog: action.dialog,
        settingsDongleId: action.settingsDongleId ?? (action.dialog ? current.navigation.settingsDongleId : null),
      } };
    }
    if (action.type === 'TEST_DEVICE') return { ...current, dongleId: action.dongleId };
    if (action.type === 'TEST_DEVICES') return { ...current, devices: action.devices };
    return current;
  });
}

function mount(component, store = makeStore()) {
  return { store, ...render(<Provider store={store}>{component}</Provider>) };
}

function setDialog(store, dialog, settingsDongleId) {
  act(() => store.dispatch({ type: 'TEST_DIALOG', dialog, settingsDongleId }));
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    enumerateDevices: vi.fn(async () => []),
    getUserMedia: vi.fn(),
  } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('navigation-owned dialogs', () => {
  it('opens another device settings without selecting that device', () => {
    const { store } = mount(<DeviceList selectedDevice={FIRST} handleDeviceSelected={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('device settings')[1]);
    expect(store.getState().navigation).toMatchObject({ dialog: 'settings', settingsDongleId: SECOND });
    expect(store.getState().dongleId).toBe(FIRST);
    expect(screen.getByLabelText('Device name')).toHaveValue('Second device');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store.getState().navigation.dialog).toBeNull();
  });

  it('renders deep-linked settings for the target and follows navigation changes', () => {
    const store = makeStore('settings', SECOND);
    mount(<DeviceList selectedDevice={FIRST} handleDeviceSelected={vi.fn()} />, store);
    expect(screen.getByLabelText('Device name')).toHaveValue('Second device');
    setDialog(store, null);
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    setDialog(store, 'settings');
    expect(screen.getByLabelText('Device name')).toHaveValue('First device');
  });

  it('initializes deep-linked settings when device data arrives after mounting', () => {
    const store = makeStore('settings', SECOND, { devices: [], device: null });
    mount(<DeviceSettingsModal dongleId={SECOND} isOpen onClose={vi.fn()} />, store);
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    act(() => store.dispatch({ type: 'TEST_DEVICES', devices }));
    expect(screen.getByLabelText('Device name')).toHaveValue('Second device');
  });

  it('keeps cold-linked settings visible and accessible outside a closed mobile drawer', () => {
    mount(
      <MemoryRouter>
        <AppDrawer isPermanent={false} drawerIsOpen={false} width={280} handleDrawerStateChanged={vi.fn()} />
      </MemoryRouter>,
      makeStore('settings', SECOND),
    );
    const name = screen.getByRole('textbox', { name: 'Device name' });
    expect(name).toBeVisible();
    expect(name).toHaveValue('Second device');
    expect(name.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'device settings' })).not.toBeInTheDocument();
  });

  it('keeps the cold-linked scanner outside the hidden mobile drawer', async () => {
    mount(
      <MemoryRouter>
        <AppDrawer isPermanent={false} drawerIsOpen={false} width={280} handleDrawerStateChanged={vi.fn()} />
      </MemoryRouter>,
      makeStore('pair'),
    );
    const title = screen.getByText('Pair device');
    expect(title).toBeVisible();
    expect(title.closest('[aria-hidden="true"]')).toBeNull();
    await screen.findByText(/Camera not found/);
    expect(screen.queryByRole('button', { name: 'add new device' })).not.toBeInTheDocument();
  });

  it('returns from unpair to settings with the same device and unsaved form', () => {
    const store = makeStore('settings', SECOND);
    mount(<DeviceList selectedDevice={FIRST} handleDeviceSelected={vi.fn()} />, store);
    fireEvent.change(screen.getByLabelText('Device name'), { target: { value: 'Unsaved alias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));
    expect(store.getState().navigation.dialog).toBe('unpair');
    expect(screen.getByText('Unpair device')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.getState().navigation).toMatchObject({ dialog: 'settings', settingsDongleId: SECOND });
    expect(screen.getByLabelText('Device name')).toHaveValue('Unsaved alias');
  });

  it.each(['unpair', 'uploads'])('renders deep-linked %s and closes to settings', (dialog) => {
    const store = makeStore(dialog, SECOND);
    mount(<DeviceList selectedDevice={FIRST} handleDeviceSelected={vi.fn()} />, store);
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: dialog === 'uploads' ? 'Close uploads' : 'Cancel' }));
    expect(store.getState().navigation).toMatchObject({ dialog: 'settings', settingsDongleId: SECOND });
    expect(store.getState().dongleId).toBe(FIRST);
  });

  it('opens uploads from settings and returns without losing the target', () => {
    const { store } = mount(<DeviceSettingsModal dongleId={SECOND} isOpen onClose={vi.fn()} />, makeStore('settings', SECOND));
    fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
    expect(screen.getByTestId('uploads')).toHaveTextContent(SECOND);
    fireEvent.click(screen.getByRole('button', { name: 'Close uploads' }));
    expect(store.getState().navigation.dialog).toBe('settings');
  });

  it('does not render device uploads without an explicit settings target', () => {
    mount(<DeviceList selectedDevice={FIRST} handleDeviceSelected={vi.fn()} />, makeStore('uploads'));
    expect(screen.queryByTestId('uploads')).not.toBeInTheDocument();
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
  });

  it('marks uploads for the currently selected device as settings uploads', () => {
    const { store } = mount(<DeviceList selectedDevice={FIRST} handleDeviceSelected={vi.fn()} />, makeStore('settings'));
    fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
    expect(store.getState().navigation).toMatchObject({ dialog: 'uploads', settingsDongleId: FIRST });
    expect(screen.getByTestId('uploads')).toHaveTextContent(FIRST);
  });

  it('opens the date dialog from its button and restores it from navigation', async () => {
    const { store } = mount(<DriveList />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(store.getState().navigation.dialog).toBe('date-range');
    fireEvent.click(screen.getByRole('button', { name: 'Close dates' }));
    expect(screen.queryByTestId('date-range')).not.toBeInTheDocument();
    setDialog(store, 'date-range');
    expect(screen.getByTestId('date-range')).toBeInTheDocument();
    setDialog(store, null);
    expect(screen.queryByTestId('date-range')).not.toBeInTheDocument();
  });

  it.each(['routes', 'lastRoutes'])('filters cached %s by overlap and sorts without mutating the cache', async (source) => {
    const cachedRoutes = Object.freeze([
      { fullname: 'old cached drive', start_time_utc_millis: 10, end_time_utc_millis: 20 },
      { fullname: 'starts before range', start_time_utc_millis: 90, end_time_utc_millis: 110 },
      { fullname: 'newer drive', start_time_utc_millis: 170, end_time_utc_millis: 190 },
      { fullname: 'ends after range', start_time_utc_millis: 180, end_time_utc_millis: 210 },
      { fullname: 'future cached drive', start_time_utc_millis: 220, end_time_utc_millis: 230 },
    ]);
    const store = makeStore(null, null, {
      filter: { start: 100, end: 200 },
      routes: source === 'routes' ? cachedRoutes : null,
      lastRoutes: source === 'lastRoutes' ? cachedRoutes : [],
    });
    mount(<DriveList />, store);
    await act(async () => {});
    expect(screen.getAllByTestId('drive-entry').map((entry) => entry.textContent)).toEqual([
      'ends after range', 'newer drive', 'starts before range',
    ]);
    expect(store.getState()[source]).toBe(cachedRoutes);
    expect(cachedRoutes.map((drive) => drive.fullname)).toEqual([
      'old cached drive', 'starts before range', 'newer drive', 'ends after range', 'future cached drive',
    ]);
  });

  it('shows the empty dashboard when all cached routes are outside the filter', async () => {
    mount(<DriveList />, makeStore(null, null, {
      filter: { start: 100, end: 200 },
      routes: [{ fullname: 'old cached drive', start_time_utc_millis: 10, end_time_utc_millis: 20 }],
    }));
    await act(async () => {});
    expect(screen.queryByTestId('drive-entry')).not.toBeInTheDocument();
    expect(screen.getByText('No drives')).toBeInTheDocument();
  });

  it('restores and toggles the account menu entirely through navigation', () => {
    const { store } = mount(<AppHeader handleDrawerStateChanged={vi.fn()} />, makeStore('account'));
    expect(screen.getByText('Manage account')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('account menu'));
    expect(store.getState().navigation.dialog).toBeNull();
    expect(screen.queryByText('Manage account')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('account menu'));
    expect(store.getState().navigation.dialog).toBe('account');
    setDialog(store, null);
    expect(screen.queryByText('Manage account')).not.toBeInTheDocument();
  });

  it('closes the account dialog through its outside-click overlay', () => {
    const { store } = mount(<AppHeader handleDrawerStateChanged={vi.fn()} />, makeStore('account'));
    fireEvent.click(document.querySelector('.fixed.inset-0.z-40'));
    expect(store.getState().navigation.dialog).toBeNull();
  });

  it('opens pairing through navigation and renders direct navigation entries', async () => {
    const { store } = mount(<AddDevice buttonText="Pair new device" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pair new device' }));
    expect(store.getState().navigation.dialog).toBe('pair');
    await screen.findByText(/Camera not found/);
    setDialog(store, null);
    expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
    setDialog(store, 'pair');
    expect(screen.getByText('Pair device')).toBeInTheDocument();
  });

  it('shares one pairing dialog and camera between sidebar and onboarding mounts', async () => {
    const stop = vi.fn();
    navigator.mediaDevices.enumerateDevices.mockResolvedValue([{ kind: 'videoinput' }]);
    navigator.mediaDevices.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
    const store = makeStore('pair', null, { devices: [], device: null, dongleId: null });
    mount(
      <MemoryRouter>
        <AppDrawer isPermanent={false} drawerIsOpen={false} width={280} handleDrawerStateChanged={vi.fn()} />
        <NoDeviceUpsell />
      </MemoryRouter>,
      store,
    );
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Pair device')).toHaveLength(1);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    setDialog(store, null);
    expect(stop).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByText('Pair your device').parentElement).getByRole('button', { name: 'add new device' }));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText('Pair device')).toHaveLength(1);
  });

  it('keeps the button-only pairing trigger camera-free even for a direct pairing entry', () => {
    const { store } = mount(<AddDevice buttonText="Pair new device" buttonOnly />, makeStore('pair'));
    expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
    expect(navigator.mediaDevices.enumerateDevices).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    setDialog(store, null);
    fireEvent.click(screen.getByRole('button', { name: 'Pair new device' }));
    expect(store.getState().navigation.dialog).toBe('pair');
    expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
  });

  it('stops the active camera when navigation closes pairing', async () => {
    const stop = vi.fn();
    navigator.mediaDevices.enumerateDevices.mockResolvedValue([{ kind: 'videoinput' }]);
    navigator.mediaDevices.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
    const { store } = mount(<AddDevice buttonText="Pair new device" />, makeStore('pair'));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    setDialog(store, null);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('closes pairing through Escape and stops its camera', async () => {
    const stop = vi.fn();
    navigator.mediaDevices.enumerateDevices.mockResolvedValue([{ kind: 'videoinput' }]);
    navigator.mediaDevices.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
    const { store } = mount(<AddDevice buttonText="Pair new device" />, makeStore('pair'));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 27 });
    expect(store.getState().navigation.dialog).toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops a camera that resolves after navigation closes pairing', async () => {
    const stop = vi.fn();
    let resolveCamera;
    navigator.mediaDevices.enumerateDevices.mockResolvedValue([{ kind: 'videoinput' }]);
    navigator.mediaDevices.getUserMedia.mockImplementation(() => new Promise((resolve) => { resolveCamera = resolve; }));
    const { store } = mount(<AddDevice buttonText="Pair new device" />, makeStore('pair'));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1));
    setDialog(store, null);
    await act(async () => resolveCamera({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('stops a camera that resolves after the pairing component unmounts', async () => {
    const stop = vi.fn();
    let resolveCamera;
    navigator.mediaDevices.enumerateDevices.mockResolvedValue([{ kind: 'videoinput' }]);
    navigator.mediaDevices.getUserMedia.mockImplementation(() => new Promise((resolve) => { resolveCamera = resolve; }));
    const { unmount } = mount(<AddDevice buttonText="Pair new device" />, makeStore('pair'));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => resolveCamera({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

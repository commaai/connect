import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE, routerMiddleware } from 'connected-react-router';

import Media from './Media';
import { parseLocation } from '../../url';

function TestMenu({ open, label, anchorEl, onClose, children }) {
  const element = React.useRef();
  React.useLayoutEffect(() => {
    if (element.current) element.current.dataset.anchor = anchorEl()?.textContent || '';
  });
  return open ? (
    <section ref={element} role="dialog" aria-label={label}>
      <button onClick={onClose}>Dismiss {label}</button>
      {children}
    </section>
  ) : null;
}

const mocks = vi.hoisted(() => ({
  deviceSupportsClips: vi.fn(),
  fetchFiles: vi.fn((route) => ({ type: 'FILES', route })),
  fetchAthenaQueue: vi.fn((dongleId) => ({ type: 'QUEUE', dongleId })),
  getPreservedRoutes: vi.fn(),
}));

vi.mock('../../api', () => ({ USERADMIN_URL_ROOT: '' }));
vi.mock('../../api/backend', () => ({ api: { routes: { getPreservedRoutes: mocks.getPreservedRoutes } } }));
vi.mock('../../api/clips', () => ({ deviceSupportsClips: mocks.deviceSupportsClips }));
vi.mock('../../actions', () => ({
  analyticsEvent: () => ({ type: 'ANALYTICS' }),
  updateRoute: () => ({ type: 'UPDATE_ROUTE' }),
}));
vi.mock('../../actions/cached', () => ({ fetchEvents: () => ({ type: 'EVENTS' }) }));
vi.mock('../../actions/files', () => ({
  fetchFiles: mocks.fetchFiles,
  fetchAthenaQueue: mocks.fetchAthenaQueue,
  setRouteViewed: () => ({ type: 'VIEWED' }),
  doUpload: vi.fn(),
  fetchUploadUrls: vi.fn(),
  updateFiles: vi.fn(),
  FILE_NAMES: {},
}));
vi.mock('../../hooks/window', () => ({ subscribeWindowSize: () => () => {} }));
vi.mock('../../timeline/playback', () => ({ bufferVideo: () => ({ type: 'BUFFER' }) }));
vi.mock('../../analytics', () => ({ attachRelTime: vi.fn() }));
vi.mock('../../utils', () => ({
  deviceIsOnline: (device) => Boolean(device?.online),
  deviceOnCellular: () => false,
  getSegmentNumber: () => 0,
}));
vi.mock('../../icons', () => ({
  ContentCopy: () => null,
  InfoOutline: () => null,
  ShareIcon: () => null,
  WarningIcon: () => null,
}));
vi.mock('../DriveMap', () => ({ default: () => <div>Drive map</div> }));
vi.mock('../DriveVideo', () => ({ default: ({ isMuted }) => <div data-testid="video" data-muted={isMuted}>Drive video</div> }));
vi.mock('../TimeDisplay', () => ({ default: ({ onMuteToggle }) => <button onClick={onMuteToggle}>Toggle mute</button> }));
vi.mock('../utils/SwitchLoading', () => ({ default: ({ label, loading, checked }) => <span data-loading={loading} data-checked={checked}>{label}</span> }));
vi.mock('./ClipMenu', () => ({
  default: (props) => (
    <TestMenu {...props} label="clips">
      <span data-testid="selected-clip">{props.clipFilename}</span>
      <button onClick={() => props.onOpenPreview({ filename: 'Road clip + #1.mp4' })}>Preview selected clip</button>
      <button onClick={() => props.onOpenDelete({ filename: 'Road clip + #1.mp4' })}>Delete selected clip</button>
      <button onClick={props.onCloseClip}>Dismiss selected clip</button>
    </TestMenu>
  ),
}));
vi.mock('../Files/UploadQueue', () => ({
  default: ({ open, update, onClose }) => (
    <div data-testid="upload-queue" data-update={update}>
      {open && <section role="dialog" aria-label="uploads"><button onClick={onClose}>Dismiss uploads</button></section>}
    </div>
  ),
}));
vi.mock('@material-ui/core', () => ({
  withStyles: () => (Component) => (props) => <Component {...props} classes={{}} />,
  Typography: ({ children }) => <span>{children}</span>,
  Menu: ({ id, ...props }) => <TestMenu {...props} label={id} />,
  Dialog: ({ open, onClose, children }) => open ? (
    <section role="dialog" aria-label="Clips unavailable" onKeyDown={(event) => event.key === 'Escape' && onClose()}>{children}</section>
  ) : null,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogActions: ({ children }) => <div>{children}</div>,
  MenuItem: ({ children, onClick, disabled }) => <div role="menuitem" aria-disabled={disabled} onClick={disabled ? undefined : onClick}>{children}</div>,
  Button: ({ children, onClick, disabled }) => <button disabled={disabled} onClick={onClick}>{children}</button>,
  ListItem: ({ children }) => <div>{children}</div>,
  Tooltip: ({ children }) => children,
  CircularProgress: () => <span role="progressbar" />,
  Popper: ({ open, children }) => open ? <div>{children}</div> : null,
}));

const DONGLE = '0000aaaa0000aaaa';
const SETTINGS_DONGLE = '1111bbbb1111bbbb';
const DRIVE_PATH = `/${DONGLE}/2026-10-08--12-00-00/10/30`;
const route = {
  fullname: `${DONGLE}|2026-10-08--12-00-00`,
  start_time_utc_millis: 1000,
  segment_numbers: [0],
  segment_start_times: [1000],
  segment_end_times: [61000],
};

function mountMedia(url = DRIVE_PATH, overrides = {}) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const initialState = {
    dongleId: DONGLE,
    device: { dongle_id: DONGLE, online: true, is_owner: true },
    currentRoute: route,
    routes: [route],
    loop: { startTime: 0, duration: 60000 },
    files: {},
    profile: {},
    ...overrides,
    navigation: parseLocation(history.location),
    router: { location: history.location, action: history.action },
  };
  const store = createStore((state = initialState, action) => {
    if (action.type === LOCATION_CHANGE) {
      return { ...state, router: action.payload, navigation: parseLocation(action.payload.location) };
    }
    if (action.type === 'TEST_STATE') return { ...state, ...action.payload };
    return state;
  }, applyMiddleware(thunk, routerMiddleware(history)));
  const unlisten = history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  const view = render(<Provider store={store}><Media /></Provider>);
  return { history, store, unmount: () => { view.unmount(); unlisten(); } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deviceSupportsClips.mockResolvedValue(true);
  mocks.getPreservedRoutes.mockResolvedValue([]);
});
afterEach(cleanup);

describe('Media URL dialogs', () => {
  it.each(['clip-preview', 'clip-delete'])('renders ClipMenu for a cold %s selection', async (dialog) => {
    const view = mountMedia(`${DRIVE_PATH}?dialog=${dialog}&clip=${encodeURIComponent('Road clip + #1.mp4')}`);
    expect(await screen.findByTestId('selected-clip')).toHaveTextContent('Road clip + #1.mp4');
    expect(screen.getByRole('dialog', { name: 'clips' })).toBeInTheDocument();
    view.unmount();
  });

  it.each([['Preview selected clip', 'clip-preview'], ['Delete selected clip', 'clip-delete']])('writes %s to the URL and returns to clips', async (button, dialog) => {
    const view = mountMedia(`${DRIVE_PATH}?existing=value&dialog=clips#playback`);
    fireEvent.click(await screen.findByText(button));
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe(dialog);
    expect(new URLSearchParams(view.history.location.search).get('clip')).toBe('Road clip + #1.mp4');
    expect(new URLSearchParams(view.history.location.search).get('existing')).toBe('value');
    expect(view.history.location.pathname).toBe(DRIVE_PATH);
    expect(view.history.location.hash).toBe('#playback');
    fireEvent.click(screen.getByText('Dismiss selected clip'));
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('clips');
    expect(new URLSearchParams(view.history.location.search).has('clip')).toBe(false);
    view.unmount();
  });

  it.each([
    ['downloads', 'menu-download', 'Files'],
    ['info', 'menu-info', 'More info'],
    ['clips', 'clips', 'Clip'],
  ])('opens %s from a cold URL with a stable anchor and follows history', async (dialog, menu, anchor) => {
    const view = mountMedia(`${DRIVE_PATH}?existing=value&dialog=${dialog}#playback`);
    await waitFor(() => expect(screen.getByRole('dialog', { name: menu })).toHaveAttribute('data-anchor', anchor));
    act(() => view.history.push(`${DRIVE_PATH}?existing=value#playback`));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.goBack());
    expect(screen.getByRole('dialog', { name: menu })).toBeInTheDocument();
    act(() => view.history.goForward());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it.each([
    ['Files', 'downloads', 'menu-download'],
    ['More info', 'info', 'menu-info'],
    ['Clip', 'clips', 'clips'],
  ])('opens and dismisses %s without changing the drive range, query, or hash', async (button, dialog, menu) => {
    const view = mountMedia(`${DRIVE_PATH}?existing=value#playback`);
    fireEvent.click(await screen.findByText(button));
    expect(view.history.location.pathname).toBe(DRIVE_PATH);
    expect(view.history.location.hash).toBe('#playback');
    expect(new URLSearchParams(view.history.location.search).get('existing')).toBe('value');
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe(dialog);
    fireEvent.click(screen.getByText(`Dismiss ${menu}`));
    expect(view.history.location.search).toBe('?existing=value');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it.each(['downloads', 'info'])('loads %s when the route arrives after the cold dialog', async (dialog) => {
    const view = mountMedia(`${DRIVE_PATH}?dialog=${dialog}`, { currentRoute: null, files: null });
    expect(mocks.fetchFiles).not.toHaveBeenCalled();
    act(() => view.store.dispatch({ type: 'TEST_STATE', payload: { currentRoute: route } }));
    expect(mocks.fetchFiles).toHaveBeenCalledWith(route.fullname);
    expect(mocks.fetchAthenaQueue).toHaveBeenCalledWith(DONGLE);
    await waitFor(() => expect(mocks.getPreservedRoutes).toHaveBeenCalledTimes(dialog === 'info' ? 1 : 0));
    view.unmount();
  });

  it('loads files on URL-only transitions and route changes, without leaking shared queue access', () => {
    const view = mountMedia(DRIVE_PATH, { device: { dongle_id: DONGLE, shared: true, online: true } });
    act(() => view.history.push(`${DRIVE_PATH}?dialog=downloads`));
    expect(mocks.fetchFiles).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAthenaQueue).not.toHaveBeenCalled();
    act(() => view.history.push(`${DRIVE_PATH}?dialog=info`));
    expect(mocks.fetchFiles).toHaveBeenCalledTimes(2);
    const nextRoute = { ...route, fullname: `${DONGLE}|2026-10-08--13-00-00` };
    act(() => view.store.dispatch({ type: 'TEST_STATE', payload: { currentRoute: nextRoute } }));
    expect(mocks.fetchFiles).toHaveBeenLastCalledWith(nextRoute.fullname);
    view.unmount();
  });

  it('loads preservation on a cold info URL and ignores stale route responses', async () => {
    let resolveFirst;
    let resolveSecond;
    mocks.getPreservedRoutes
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const view = mountMedia(`${DRIVE_PATH}?dialog=info`);
    expect(screen.getByText('Preserved')).toHaveAttribute('data-loading', 'true');
    const nextRoute = { ...route, fullname: `${DONGLE}|2026-10-08--13-00-00` };
    act(() => view.store.dispatch({ type: 'TEST_STATE', payload: { currentRoute: nextRoute } }));
    await act(async () => resolveFirst([route]));
    expect(screen.getByText('Preserved')).toHaveAttribute('data-loading', 'true');
    await act(async () => resolveSecond([nextRoute]));
    expect(screen.getByText('Preserved')).toHaveAttribute('data-loading', 'false');
    expect(screen.getByText('Preserved')).toHaveAttribute('data-checked', 'true');
    view.unmount();
  });

  it('does not open uploads while files are still loading', () => {
    const view = mountMedia(`${DRIVE_PATH}?dialog=downloads`, { files: null });
    expect(screen.getByText('View upload queue')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByText('View upload queue'));
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('downloads');
    view.unmount();
  });

  it('opens the upload queue from Files and closes to its downloads parent', () => {
    const view = mountMedia(`${DRIVE_PATH}?existing=value&dialog=downloads#playback`);
    fireEvent.click(screen.getByText('View upload queue'));
    expect(screen.getByRole('dialog', { name: 'uploads' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'menu-download' })).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-queue')).toHaveAttribute('data-update', 'true');
    expect(view.history.location.pathname).toBe(DRIVE_PATH);
    expect(view.history.location.hash).toBe('#playback');
    expect(new URLSearchParams(view.history.location.search).get('existing')).toBe('value');
    fireEvent.click(screen.getByText('Dismiss uploads'));
    expect(screen.getByRole('dialog', { name: 'menu-download' })).toBeInTheDocument();
    act(() => view.history.push(DRIVE_PATH));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-queue')).toHaveAttribute('data-update', 'false');
    view.unmount();
  });

  it('opens uploads from a cold URL but leaves settings-targeted queues to DeviceSettingsModal', () => {
    const view = mountMedia(`${DRIVE_PATH}?dialog=uploads`);
    expect(screen.getByRole('dialog', { name: 'uploads' })).toBeInTheDocument();
    act(() => view.history.push(`${DRIVE_PATH}?dialog=uploads&settingsDevice=${SETTINGS_DONGLE}`));
    expect(screen.queryByTestId('upload-queue')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.goBack());
    expect(screen.getByRole('dialog', { name: 'uploads' })).toBeInTheDocument();
    view.unmount();
  });

  it('keeps offline upload and clip safeguards and normal playback', async () => {
    const view = mountMedia(`${DRIVE_PATH}?dialog=downloads`, { device: { dongle_id: DONGLE, online: false } });
    expect(screen.queryByText('View upload queue')).not.toBeInTheDocument();
    expect(screen.getByText('Device offline')).toBeInTheDocument();
    expect(screen.queryByText('Clip')).not.toBeInTheDocument();
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('downloads');
    act(() => view.history.push(`${DRIVE_PATH}?dialog=clips`));
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Device offline');
    expect(screen.getByTestId('video')).toHaveAttribute('data-muted', 'true');
    fireEvent.click(screen.getByText('Toggle mute'));
    expect(screen.getByTestId('video')).toHaveAttribute('data-muted', 'false');
    view.unmount();
  });

  it.each(['clips', 'clip-preview', 'clip-delete'])('visibly represents unsupported %s cold links without opening actionable clip controls', async (dialog) => {
    mocks.deviceSupportsClips.mockResolvedValue(false);
    const view = mountMedia(`${DRIVE_PATH}?existing=value&dialog=${dialog}&clip=anything.mp4#playback`);
    await act(async () => {});
    expect(screen.queryByText('Clip')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Clips are not available on this device.');
    expect(screen.queryByText('Preview selected clip')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete selected clip')).not.toBeInTheDocument();
    expect(mocks.deviceSupportsClips).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.history.location.pathname).toBe(DRIVE_PATH);
    expect(view.history.location.search).toBe('?existing=value');
    expect(view.history.location.hash).toBe('#playback');
    view.unmount();
  });

  it.each(['clips', 'clip-preview', 'clip-delete'])('visibly represents offline %s cold links without probing the device', (dialog) => {
    const view = mountMedia(`${DRIVE_PATH}?dialog=${dialog}&clip=anything.mp4`, { device: { dongle_id: DONGLE, online: false } });
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Device offline');
    expect(mocks.deviceSupportsClips).not.toHaveBeenCalled();
    expect(screen.queryByText('Preview selected clip')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(view.history.location.search).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it('shows pending capability checks and resumes the deep link once supported', async () => {
    let resolveSupport;
    mocks.deviceSupportsClips.mockImplementationOnce(() => new Promise((resolve) => { resolveSupport = resolve; }));
    const view = mountMedia(`${DRIVE_PATH}?dialog=clip-preview&clip=anything.mp4`);
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Checking clip availability');
    await act(async () => resolveSupport(true));
    expect(screen.queryByRole('dialog', { name: 'Clips unavailable' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'clips' })).toBeInTheDocument();
    expect(screen.getByTestId('selected-clip')).toHaveTextContent('anything.mp4');
    expect(mocks.deviceSupportsClips).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('restores an unavailable dialog with browser history without repeating capability checks', async () => {
    mocks.deviceSupportsClips.mockResolvedValue(false);
    const view = mountMedia(`${DRIVE_PATH}?dialog=clip-delete&clip=anything.mp4`);
    await act(async () => {});
    act(() => view.history.push(DRIVE_PATH));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.goBack());
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Clips are not available on this device.');
    act(() => view.history.goForward());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.deviceSupportsClips).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('keeps failed capability checks visibly unavailable without retry loops', async () => {
    mocks.deviceSupportsClips.mockRejectedValueOnce(new Error('Athena unavailable'));
    const view = mountMedia(`${DRIVE_PATH}?dialog=clip-preview&clip=anything.mp4`);
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Clips are not available on this device.');
    expect(screen.queryByText('Preview selected clip')).not.toBeInTheDocument();
    expect(mocks.deviceSupportsClips).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('ignores a stale capability response after disconnection and rechecks on reconnection', async () => {
    let resolveOldSupport;
    mocks.deviceSupportsClips.mockImplementationOnce(() => new Promise((resolve) => { resolveOldSupport = resolve; }));
    const view = mountMedia(`${DRIVE_PATH}?dialog=clip-preview&clip=anything.mp4`);
    act(() => view.store.dispatch({ type: 'TEST_STATE', payload: { device: { dongle_id: DONGLE, online: false } } }));
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Device offline');
    mocks.deviceSupportsClips.mockResolvedValue(false);
    await act(async () => view.store.dispatch({ type: 'TEST_STATE', payload: { device: { dongle_id: DONGLE, online: true } } }));
    await act(async () => resolveOldSupport(true));
    expect(screen.getByRole('dialog', { name: 'Clips unavailable' })).toHaveTextContent('Clips are not available on this device.');
    expect(screen.queryByText('Preview selected clip')).not.toBeInTheDocument();
    expect(mocks.deviceSupportsClips).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});

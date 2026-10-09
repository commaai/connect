import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { connect, Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE, routerMiddleware } from 'connected-react-router';

import ClipMenu from './ClipMenu';
import { closeDialog, openDialog } from '../../actions/navigation';
import { parseLocation } from '../../url';

const mocks = vi.hoisted(() => ({
  getClipState: vi.fn(),
  hasClipBlob: vi.fn(),
  getClipUrl: vi.fn(),
  deleteClip: vi.fn(),
  shareOrDownload: vi.fn(),
  revokeObjectURL: vi.fn(),
}));

vi.mock('../../api/clips', () => ({ clipDevice: mocks }));
vi.mock('../../utils/file', () => ({ shareOrDownload: mocks.shareOrDownload }));
vi.mock('../../icons', () => ({ CloseBold: () => null, Download: () => null, PlayArrow: () => null, Trash: () => null }));
vi.mock('../utils/InfoTooltip', () => ({ default: () => null }));
vi.mock('@material-ui/core', () => ({
  withStyles: () => (Component) => (props) => <Component {...props} classes={{}} />,
  Menu: ({ open, onClose, children }) => open ? <section aria-label="Clip menu"><button onClick={onClose}>Dismiss menu</button>{children}</section> : null,
  Dialog: ({ open, onClose, children }) => open ? (
    <section role="dialog"><button onClick={onClose}>Dismiss dialog</button>{children}</section>
  ) : null,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogActions: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  Typography: ({ children }) => <span>{children}</span>,
  Button: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  IconButton: ({ children, onClick, disabled, 'aria-label': label }) => <button aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>,
  CircularProgress: () => <span role="progressbar" />,
  LinearProgress: () => <span role="progressbar" />,
}));

const DONGLE = '0000aaaa0000aaaa';
const ROUTE_NAME = '2026-10-08--12-00-00';
const DRIVE_PATH = `/${DONGLE}/${ROUTE_NAME}/10/30`;
const route = { fullname: `${DONGLE}|${ROUTE_NAME}` };
const firstClip = {
  filename: 'Road clip + #1.mp4', route: ROUTE_NAME, status: 'ready', requested_at: 123,
  camera: 'fcamera.hevc', source_start_time: 10, source_end_time: 30,
};
const secondClip = { ...firstClip, filename: 'second.mp4', requested_at: 456 };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

const ConnectedClips = connect((state) => ({ ...state, ...state.navigation }))((props) => (
  <ClipMenu
    {...props}
    open={['clips', 'clip-preview', 'clip-delete'].includes(props.dialog)}
    inventoryOnly
    onOpenPreview={(clip) => props.dispatch(openDialog('clip-preview', { clipFilename: clip.filename }))}
    onOpenDelete={(clip) => props.dispatch(openDialog('clip-delete', { clipFilename: clip.filename }))}
    onCloseClip={() => props.dispatch(closeDialog('clips'))}
    onClose={() => props.dispatch(closeDialog())}
  />
));

function clipUrl(dialog, filename = firstClip.filename) {
  return `${DRIVE_PATH}?existing=value&dialog=${dialog}&clip=${encodeURIComponent(filename)}#playback`;
}

function mountClips(url = clipUrl('clip-preview'), overrides = {}) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const initialState = {
    dongleId: DONGLE, route, routes: [route], deviceOnline: true, ...overrides,
    navigation: parseLocation(history.location), router: { location: history.location, action: history.action },
  };
  const store = createStore((state = initialState, action) => {
    if (action.type === LOCATION_CHANGE) return { ...state, router: action.payload, navigation: parseLocation(action.payload.location) };
    if (action.type === 'TEST_STATE') return { ...state, ...action.payload };
    return state;
  }, applyMiddleware(thunk, routerMiddleware(history)));
  const unlisten = history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  const view = render(<Provider store={store}><ConnectedClips /></Provider>);
  return { history, store, unmount: () => { view.unmount(); unlisten(); } };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClipState.mockResolvedValue({ clips: [firstClip, secondClip] });
  mocks.hasClipBlob.mockResolvedValue(false);
  mocks.getClipUrl.mockResolvedValue('blob:preview');
  mocks.deleteClip.mockResolvedValue({});
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { revokeObjectURL: mocks.revokeObjectURL }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ClipMenu URL preview and deletion', () => {
  it('waits for fetched records before resolving an encoded cold preview link', async () => {
    const list = deferred();
    mocks.getClipState.mockReturnValue(list.promise);
    const view = mountClips();
    expect(mocks.getClipUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => list.resolve({ clips: [firstClip] }));
    expect(mocks.getClipState).toHaveBeenCalledWith(DONGLE, { route: route.fullname });
    expect(mocks.getClipUrl).toHaveBeenCalledWith(DONGLE, firstClip.filename, firstClip.requested_at, expect.any(Function));
    expect(screen.getByRole('dialog').querySelector('video')).toHaveAttribute('src', 'blob:preview');
    expect(mocks.shareOrDownload).not.toHaveBeenCalled();
    view.unmount();
  });

  it.each(['clip-preview', 'clip-delete'])('rejects unknown or other-route filenames for %s', async (dialog) => {
    mocks.getClipState.mockResolvedValue({ clips: [{ ...firstClip, route: '2026-10-08--13-00-00' }] });
    const view = mountClips(clipUrl(dialog));
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => view.history.push(clipUrl(dialog, '../arbitrary.mp4')));
    expect(mocks.getClipUrl).not.toHaveBeenCalled();
    expect(mocks.deleteClip).not.toHaveBeenCalled();
    expect(mocks.shareOrDownload).not.toHaveBeenCalled();
    view.unmount();
  });

  it('opens a cold delete link as confirmation only and deletes after explicit confirmation', async () => {
    const view = mountClips(clipUrl('clip-delete'));
    expect(await screen.findByText('Delete clip?')).toBeInTheDocument();
    expect(mocks.deleteClip).not.toHaveBeenCalled();
    expect(mocks.getClipUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    await waitFor(() => expect(mocks.deleteClip).toHaveBeenCalledWith(DONGLE, { filename: firstClip.filename }));
    await waitFor(() => expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('clips'));
    expect(new URLSearchParams(view.history.location.search).has('clip')).toBe(false);
    expect(view.history.location.pathname).toBe(DRIVE_PATH);
    expect(view.history.location.hash).toBe('#playback');
    expect(new URLSearchParams(view.history.location.search).get('existing')).toBe('value');
    view.unmount();
  });

  it('cancels deletion without mutation and clears the selected clip', async () => {
    const view = mountClips(clipUrl('clip-delete'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.deleteClip).not.toHaveBeenCalled();
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('clips');
    expect(new URLSearchParams(view.history.location.search).has('clip')).toBe(false);
    view.unmount();
  });

  it('Back closes the viewer, revokes its blob, and Forward restores the URL selection', async () => {
    const view = mountClips(`${DRIVE_PATH}?dialog=clips`);
    await act(async () => {});
    act(() => view.history.push(clipUrl('clip-preview')));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    act(() => view.history.goBack());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    act(() => view.history.goForward());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.getClipUrl).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('Back cancels a pending preview and revokes a late blob without reopening', async () => {
    const preview = deferred();
    mocks.getClipUrl.mockReturnValue(preview.promise);
    const view = mountClips(`${DRIVE_PATH}?dialog=clips`);
    await act(async () => {});
    act(() => view.history.push(clipUrl('clip-preview')));
    expect(mocks.getClipUrl).toHaveBeenCalledTimes(1);
    act(() => view.history.goBack());
    await act(async () => preview.resolve('blob:late'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:late');
    expect(screen.queryByText(/Downloading ·/)).not.toBeInTheDocument();
    view.unmount();
  });

  it('does not resolve a stale preview after the selected filename changes', async () => {
    const firstPreview = deferred();
    mocks.getClipUrl.mockImplementation((_dongle, filename) => filename === firstClip.filename ? firstPreview.promise : Promise.resolve('blob:second'));
    const view = mountClips();
    await waitFor(() => expect(mocks.getClipUrl).toHaveBeenCalledTimes(1));
    act(() => view.history.push(clipUrl('clip-preview', secondClip.filename)));
    expect(await screen.findByRole('dialog')).toHaveTextContent('second');
    await act(async () => firstPreview.resolve('blob:stale'));
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:stale');
    expect(screen.getByRole('dialog').querySelector('video')).toHaveAttribute('src', 'blob:second');
    view.unmount();
  });

  it('discards a pending preview error after Back', async () => {
    const preview = deferred();
    mocks.getClipUrl.mockReturnValue(preview.promise);
    const view = mountClips(`${DRIVE_PATH}?dialog=clips`);
    await act(async () => {});
    act(() => view.history.push(clipUrl('clip-preview')));
    act(() => view.history.goBack());
    await act(async () => preview.reject(new Error('Stale transfer failure')));
    expect(screen.queryByText('Stale transfer failure')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it('does not open a late list after leaving the clip menu', async () => {
    const list = deferred();
    mocks.getClipState.mockReturnValue(list.promise);
    const view = mountClips();
    act(() => view.history.push(DRIVE_PATH));
    await act(async () => list.resolve({ clips: [firstClip] }));
    expect(mocks.getClipUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it('Back closes deletion confirmation without mutation', async () => {
    const view = mountClips(`${DRIVE_PATH}?dialog=clips`);
    await act(async () => {});
    act(() => view.history.push(clipUrl('clip-delete')));
    expect(await screen.findByText('Delete clip?')).toBeInTheDocument();
    act(() => view.history.goBack());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.deleteClip).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not reopen confirmation after a pending delete fails following Back', async () => {
    const deletion = deferred();
    mocks.deleteClip.mockReturnValue(deletion.promise);
    const view = mountClips(`${DRIVE_PATH}?dialog=clips`);
    await act(async () => {});
    act(() => view.history.push(clipUrl('clip-delete')));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete', exact: true }));
    act(() => view.history.goBack());
    await act(async () => deletion.reject(new Error('Delete failed')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(new URLSearchParams(view.history.location.search).get('dialog')).toBe('clips');
    view.unmount();
  });

  it('ignores a clip list that arrives after its device and route changed', async () => {
    const oldList = deferred();
    const newList = deferred();
    mocks.getClipState.mockReturnValueOnce(oldList.promise).mockReturnValueOnce(newList.promise);
    const view = mountClips();
    act(() => view.store.dispatch({ type: 'TEST_STATE', payload: {
      dongleId: '1111bbbb1111bbbb', route: { fullname: '1111bbbb1111bbbb|2026-10-08--13-00-00' },
    } }));
    await act(async () => oldList.resolve({ clips: [firstClip] }));
    expect(mocks.getClipUrl).not.toHaveBeenCalled();
    await act(async () => newList.resolve({ clips: [] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.deleteClip).not.toHaveBeenCalled();
    view.unmount();
  });

  it('revokes a pending preview when its device and route change', async () => {
    const preview = deferred();
    mocks.getClipUrl.mockReturnValue(preview.promise);
    const view = mountClips();
    await waitFor(() => expect(mocks.getClipUrl).toHaveBeenCalledTimes(1));
    mocks.getClipState.mockResolvedValue({ clips: [] });
    act(() => view.store.dispatch({ type: 'TEST_STATE', payload: {
      dongleId: '1111bbbb1111bbbb', route: { fullname: '1111bbbb1111bbbb|2026-10-08--13-00-00' },
    } }));
    await act(async () => preview.resolve('blob:old-device'));
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:old-device');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
  });

  it('revokes a preview blob arriving after unmount', async () => {
    const preview = deferred();
    mocks.getClipUrl.mockReturnValue(preview.promise);
    const view = mountClips();
    await waitFor(() => expect(mocks.getClipUrl).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => preview.resolve('blob:unmounted'));
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:unmounted');
  });

  it('never resolves an offline preview or delete link', async () => {
    const view = mountClips(clipUrl('clip-preview'), { deviceOnline: false });
    await act(async () => {});
    act(() => view.history.push(clipUrl('clip-delete')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.getClipState).not.toHaveBeenCalled();
    expect(mocks.getClipUrl).not.toHaveBeenCalled();
    expect(mocks.deleteClip).not.toHaveBeenCalled();
    view.unmount();
  });
});

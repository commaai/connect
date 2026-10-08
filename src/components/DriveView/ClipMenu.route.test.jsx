import React from 'react';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectedRouter, push } from 'connected-react-router';
import { createMemoryHistory } from 'history';

import ClipMenu from './ClipMenu';
import { clipDevice } from '../../api/clips';
import { createInitialState } from '../../initialState';
import { createAppStore } from '../../store';

const DEVICE_ID = 'aaaaaaaaaaaaaaaa';
const OTHER_DEVICE_ID = 'bbbbbbbbbbbbbbbb';
const FILENAME = 'drive_clip.mp4';
const clip = {
  filename: FILENAME,
  camera: 'fcamera.hevc',
  status: 'ready',
  route: '2026-08-06--12-00-00',
  source_start_time: 1,
  source_end_time: 5,
  requested_at: 'request-1',
  size: 1024,
};

vi.mock('../../api/clips', () => ({
  clipDevice: {
    deleteClip: vi.fn(),
    getClipState: vi.fn(),
    getClipUrl: vi.fn(),
    hasClipBlob: vi.fn(),
  },
}));

function renderClipMenu(path, dongleId = DEVICE_ID) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const state = createInitialState(path);
  const store = createAppStore(history, {
    ...state,
  });
  const element = currentDongleId => (
    <Provider store={store}>
      <ConnectedRouter history={history}>
        <ClipMenu
          open
          dongleId={currentDongleId}
          deviceOnline
          inventoryOnly
          onClose={() => {}}
        />
      </ConnectedRouter>
    </Provider>
  );
  const view = render(element(dongleId));
  return { history, store, rerender: nextDongleId => view.rerender(element(nextDongleId)) };
}

describe('URL-hosted clip dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.revokeObjectURL = vi.fn();
    clipDevice.getClipState.mockResolvedValue({ clips: [clip] });
    clipDevice.hasClipBlob.mockResolvedValue(false);
    clipDevice.getClipUrl.mockResolvedValue('blob:clip-preview');
    clipDevice.deleteClip.mockResolvedValue();
  });

  test('a viewer URL resolves its exact clip after inventory loads', async () => {
    const path = `/${DEVICE_ID}?modal=clip-viewer&clip=${encodeURIComponent(FILENAME)}`;
    renderClipMenu(path);

    await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledWith(DEVICE_ID, FILENAME, clip.requested_at, expect.any(Function)));
    expect(await screen.findByText(FILENAME.replace(/\.mp4$/i, ''))).toBeInTheDocument();
    expect(await screen.findByLabelText('Close video')).toBeInTheDocument();
  });

  test('choosing a clip updates the URL before opening its viewer', async () => {
    const { history, store } = renderClipMenu(`/${DEVICE_ID}?modal=clips`);
    fireEvent.click(await screen.findByLabelText('Download clip'));

    await waitFor(() => expect(store.getState().routeModal).toBe('clip-viewer'));
    expect(history.location.search).toBe(`?modal=clip-viewer&clip=${FILENAME}`);
    await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledWith(DEVICE_ID, FILENAME, clip.requested_at, expect.any(Function)));
  });

  test('a failed clip preview can be retried without changing its URL', async () => {
    clipDevice.getClipUrl.mockRejectedValueOnce(new Error('Download interrupted'));
    const path = `/${DEVICE_ID}?modal=clip-viewer&clip=${FILENAME}`;
    const { history } = renderClipMenu(path);
    expect(await screen.findByText('Download interrupted')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Download clip' }));

    expect(await screen.findByLabelText('Close video')).toBeInTheDocument();
    expect(clipDevice.getClipUrl).toHaveBeenCalledTimes(2);
    expect(`${history.location.pathname}${history.location.search}`).toBe(path);
  });

  test('a delete URL only opens confirmation; deletion requires the explicit button', async () => {
    const path = `/${DEVICE_ID}?modal=clip-delete&clip=${encodeURIComponent(FILENAME)}`;
    const { store } = renderClipMenu(path);

    expect(await screen.findByText('Delete clip?')).toBeInTheDocument();
    expect(clipDevice.deleteClip).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(clipDevice.deleteClip).toHaveBeenCalledWith(DEVICE_ID, { filename: FILENAME }));
    await waitFor(() => expect(store.getState().routeModal).toBe('clips'));
  });

  test('changing the route away from a clip viewer closes it and revokes its preview URL', async () => {
    const path = `/${DEVICE_ID}?modal=clip-viewer&clip=${encodeURIComponent(FILENAME)}`;
    const { store } = renderClipMenu(path);
    await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalled());
    await screen.findByLabelText('Close video');

    const revoke = URL.revokeObjectURL;
    await act(async () => store.dispatch(push(`/${DEVICE_ID}?modal=clips`)));
    await waitFor(() => expect(store.getState().routeModal).toBe('clips'));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:clip-preview'));
  });

  test('an inventory error from the previous device does not appear after a device change', async () => {
    let rejectPreviousLoad;
    clipDevice.getClipState.mockImplementationOnce(() => new Promise((resolve, reject) => {
      rejectPreviousLoad = reject;
    }));
    const { history, store, rerender } = renderClipMenu(`/${DEVICE_ID}?modal=clips`);
    await waitFor(() => expect(clipDevice.getClipState).toHaveBeenCalledWith(DEVICE_ID, {}));

    await act(async () => {
      store.dispatch(push(`/${OTHER_DEVICE_ID}?modal=clips`));
      rerender(OTHER_DEVICE_ID);
    });
    await act(async () => rejectPreviousLoad(new Error('old device failed')));

    expect(history.location.pathname).toBe(`/${OTHER_DEVICE_ID}`);
    expect(screen.queryByText('old device failed')).not.toBeInTheDocument();
  });

  test('a pending delete cannot change the route after the user leaves its dialog', async () => {
    let resolveDelete;
    clipDevice.deleteClip.mockImplementation(() => new Promise(resolve => { resolveDelete = resolve; }));
    const { history, store } = renderClipMenu(`/${DEVICE_ID}?modal=clip-delete&clip=${encodeURIComponent(FILENAME)}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(clipDevice.deleteClip).toHaveBeenCalled());

    await act(async () => store.dispatch(push(`/${OTHER_DEVICE_ID}`)));
    await act(async () => store.dispatch(push(`/${DEVICE_ID}?modal=clip-delete&clip=${FILENAME}`)));
    expect(await screen.findByText('Delete clip?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await act(async () => resolveDelete());

    expect(history.location.pathname).toBe(`/${DEVICE_ID}`);
    expect(history.location.search).toBe(`?modal=clip-delete&clip=${FILENAME}`);
    expect(store.getState().routeModal).toBe('clip-delete');
    expect(screen.getByText('Delete clip?')).toBeInTheDocument();
  });

  test('leaving a clip deep link clears its route-specific error', async () => {
    const staleFilename = 'missing_clip.mp4';
    const { store } = renderClipMenu(`/${DEVICE_ID}?modal=clip-viewer&clip=${staleFilename}`);
    expect(await screen.findByText('Clip not found on this device')).toBeInTheDocument();

    await act(async () => store.dispatch(push(`/${DEVICE_ID}?modal=clips`)));

    expect(screen.queryByText('Clip not found on this device')).not.toBeInTheDocument();
  });
});

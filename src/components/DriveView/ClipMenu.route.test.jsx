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

function renderClipMenu(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const state = createInitialState(path);
  const store = createAppStore(history, {
    ...state,
  });
  render(
    <Provider store={store}>
      <ConnectedRouter history={history}>
        <ClipMenu
          open
          dongleId={DEVICE_ID}
          deviceOnline
          inventoryOnly
          onClose={() => {}}
        />
      </ConnectedRouter>
    </Provider>,
  );
  return { history, store };
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
});

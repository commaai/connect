import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { createMemoryHistory } from 'history';
import { connectRouter, LOCATION_CHANGE, routerMiddleware } from 'connected-react-router';
import ClipMenu from './ClipMenu';
import { clipDevice } from '../../api/clips';
import { closeModal } from '../../actions/navigation';

vi.mock('../../api/clips', () => ({ clipDevice: {
  getClipState: vi.fn(), hasClipBlob: vi.fn(async () => false), getClipUrl: vi.fn(),
  deleteClip: vi.fn(async () => undefined), createClip: vi.fn(),
} }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const BASE = `/${DONGLE}?modal=device-clips`;
const clip = (filename) => ({ filename, status: 'ready', camera: 'fcamera.hevc', source_start_time: 0, source_end_time: 10, requested_at: 1 });

function setup(selection, deviceOnline = true) {
  const history = createMemoryHistory({ initialEntries: [`${BASE}${selection}`] });
  const store = createStore(connectRouter(history)((state = {}) => state), applyMiddleware(thunk, routerMiddleware(history)));
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  const view = render(<Provider store={store}>
    <ClipMenu open dongleId={DONGLE} deviceOnline={deviceOnline} inventoryOnly onClose={() => store.dispatch(closeModal())} />
  </Provider>);
  return { history, store, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  clipDevice.getClipState.mockResolvedValue({ clips: [clip('trip.mp4')], cameras: {} });
  URL.revokeObjectURL = vi.fn();
});

it('opens a cold delete link as a confirmation and only deletes after the button click', async () => {
  const { history } = setup('&clip=trip.mp4&clipAction=delete');
  await screen.findByText('trip will be permanently deleted from your comma device.');
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
  await waitFor(() => expect(clipDevice.deleteClip).toHaveBeenCalledWith(DONGLE, { filename: 'trip.mp4' }));
  await waitFor(() => expect(history.location.search).toBe('?modal=device-clips'));
});

it('leaves a missing clip visible with deletion disabled', async () => {
  setup('&clip=missing.mp4&clipAction=delete');
  await screen.findByText('This clip is no longer available on the device.');
  expect(screen.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
});

it('does not request or mutate clips when opening an offline deep link', async () => {
  setup('&clip=trip.mp4&clipAction=view', false);
  await screen.findByText('Device offline. Reconnect to view this clip.');
  expect(clipDevice.getClipState).not.toHaveBeenCalled();
  expect(clipDevice.getClipUrl).not.toHaveBeenCalled();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
});

it('discards an old preview response after the selected clip changes', async () => {
  let firstResolve;
  let secondResolve;
  clipDevice.getClipState.mockResolvedValue({ clips: [clip('trip.mp4'), clip('second.mp4')], cameras: {} });
  clipDevice.getClipUrl
    .mockReturnValueOnce(new Promise(resolve => { firstResolve = resolve; }))
    .mockReturnValueOnce(new Promise(resolve => { secondResolve = resolve; }));
  const { history } = setup('&clip=trip.mp4&clipAction=view');
  await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledTimes(1));
  act(() => history.push(`${BASE}&clip=second.mp4&clipAction=view`));
  await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledTimes(2));
  await act(async () => { firstResolve('blob:old'); });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old');
  expect(document.querySelector('video')).toBeNull();
  await act(async () => { secondResolve('blob:new'); });
  expect(document.querySelector('video')).toHaveAttribute('src', 'blob:new');
  fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
  await waitFor(() => expect(history.location.search).toBe('?modal=device-clips'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:new');
});

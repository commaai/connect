import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider, connect } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { createMemoryHistory } from 'history';
import { connectRouter, LOCATION_CHANGE, routerMiddleware } from 'connected-react-router';

import ClipMenu from './ClipMenu';
import { clipDevice } from '../../api/clips';
import { parseLocation } from '../../url';

vi.mock('../../api/clips', () => ({ clipDevice: {
  getClipState: vi.fn(), hasClipBlob: vi.fn(), getClipUrl: vi.fn(), deleteClip: vi.fn(), createClip: vi.fn(),
} }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const clip = { filename: 'road.mp4', camera: 'fcamera.hevc', status: 'ready', source_start_time: 0, source_end_time: 20, requested_at: 1 };
const otherClip = { ...clip, filename: 'other.mp4' };
const Harness = connect((state) => ({
  open: ['clips', 'clip', 'clip-delete'].includes(parseLocation(state.router.location).modal),
  dongleId: parseLocation(state.router.location).dongleId,
}))((props) => <ClipMenu {...props} deviceOnline />);

function open(path = `/${DONGLE}`, props = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const store = createStore(connectRouter(history)((state = {}) => state), applyMiddleware(thunk, routerMiddleware(history)));
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  const view = render(<Provider store={store}><Harness inventoryOnly {...props} /></Provider>);
  return { ...view, history };
}

beforeEach(() => {
  vi.clearAllMocks();
  clipDevice.getClipState.mockResolvedValue({ clips: [clip, otherClip] });
  clipDevice.hasClipBlob.mockResolvedValue(true);
  clipDevice.getClipUrl.mockResolvedValue('blob:clip-preview');
  clipDevice.deleteClip.mockResolvedValue(undefined);
  URL.revokeObjectURL = vi.fn();
});

test('clip deletion follows Back and Forward without deleting on navigation', async () => {
  const { history } = open();
  act(() => history.push(`/${DONGLE}?modal=clips`));
  fireEvent.click((await screen.findAllByRole('button', { name: 'Delete clip' }))[0]);
  expect(await screen.findByRole('heading', { name: 'Delete clip?' })).toBeVisible();
  expect(parseLocation(history.location)).toMatchObject({ modal: 'clip-delete', clip: clip.filename });
  act(() => history.goBack());
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Delete clip?' })).not.toBeInTheDocument());
  act(() => history.goBack());
  expect(history.location.search).toBe('');
  await act(async () => {
    history.goForward();
    history.goForward();
  });
  expect(await screen.findByRole('heading', { name: 'Delete clip?' })).toBeVisible();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
});

test('a cold deletion URL requires an existing clip and explicit confirmation', async () => {
  const { history } = open(`/${DONGLE}?modal=clip-delete&clip=road.mp4`);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled());
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(history.location.search).toBe('?modal=clips'));
  expect(clipDevice.deleteClip).toHaveBeenCalledWith(DONGLE, { filename: clip.filename });
});

test('a missing clip cannot be deleted from a cold URL', async () => {
  open(`/${DONGLE}?modal=clip-delete&clip=missing.mp4`);
  expect(await screen.findByText('Clip is not available.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
});

test('a cold viewer URL loads the selected clip and closes through history', async () => {
  const { history } = open(`/${DONGLE}?modal=clip&clip=road.mp4`);
  await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'blob:clip-preview'));
  expect(clipDevice.getClipUrl).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
  expect(history.location.search).toBe('?modal=clips');
  await waitFor(() => expect(document.querySelector('video')).toBeNull());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clip-preview');
  act(() => history.goBack());
  await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'blob:clip-preview'));
  expect(clipDevice.getClipUrl).toHaveBeenCalledTimes(2);
});

test('navigation away invalidates a pending preview', async () => {
  let resolve;
  clipDevice.getClipUrl.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { history } = open(`/${DONGLE}?modal=clip&clip=road.mp4`);
  await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledOnce());
  act(() => history.push(`/${DONGLE}`));
  await act(async () => resolve('blob:stale-preview'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-preview');
  expect(document.querySelector('video')).toBeNull();
});

test('a completed deletion cannot close a different confirmation URL', async () => {
  let resolve;
  clipDevice.deleteClip.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { history } = open(`/${DONGLE}?modal=clip-delete&clip=road.mp4`);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  act(() => history.push(`/${DONGLE}?modal=clip-delete&clip=other.mp4`));
  await act(async () => resolve());
  expect(parseLocation(history.location)).toMatchObject({ modal: 'clip-delete', clip: otherClip.filename });
  expect(screen.getByRole('heading', { name: 'Delete clip?' })).toBeVisible();
});

test('switching devices cannot reuse the previous clip inventory for deletion', async () => {
  const { history } = open(`/${DONGLE}?modal=clip-delete&clip=road.mp4`);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled());
  let resolve;
  clipDevice.getClipState.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  act(() => history.push(`/${OTHER}?modal=clip-delete&clip=road.mp4`));
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(clipDevice.getClipState).toHaveBeenLastCalledWith(OTHER, {});
  await act(async () => resolve({ clips: [] }));
  expect(screen.getByText('Clip is not available.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
});

test('clip creation cannot replace a newer confirmation URL', async () => {
  const logId = '2026-08-06--12-00-00';
  const route = { fullname: `${DONGLE}|${logId}` };
  clipDevice.getClipState.mockResolvedValue({ clips: [clip], cameras: { 'fcamera.hevc': { available_ranges: [[0, 20]] } } });
  let resolve;
  clipDevice.createClip.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { history } = open(`/${DONGLE}/${logId}?modal=clips`, { inventoryOnly: false, route, zoom: { start: 0, end: 20000 } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create clip' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Create clip' }));
  expect(clipDevice.createClip).toHaveBeenCalledOnce();
  const { filename } = clipDevice.createClip.mock.calls[0][1].clip;
  act(() => history.push(`/${DONGLE}/${logId}?modal=clip-delete&clip=road.mp4`));
  clipDevice.getClipState.mockResolvedValue({ clips: [clip, { ...clip, filename }] });
  await act(async () => resolve());
  expect(parseLocation(history.location)).toMatchObject({ modal: 'clip-delete', clip: clip.filename });
  expect(clipDevice.getClipUrl).not.toHaveBeenCalled();
});

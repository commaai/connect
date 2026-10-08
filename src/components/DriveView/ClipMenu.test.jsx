import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClipMenu from './ClipMenu';
import { clipDevice } from '../../api/clips';

vi.mock('../../api/clips', () => ({ clipDevice: {
  getClipState: vi.fn(),
  hasClipBlob: vi.fn(),
  getClipUrl: vi.fn(),
  createClip: vi.fn(),
  deleteClip: vi.fn(),
} }));
vi.mock('../../utils/file', () => ({ shareOrDownload: vi.fn() }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const clip = {
  filename: 'drive.mp4', status: 'ready', camera: 'fcamera.hevc',
  route: '2026-08-06--12-00-00', requested_at: 1, source_start_time: 0, source_end_time: 10,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mountMenu(overrides = {}) {
  let props = {
    open: true, anchorEl: document.body, onClose: vi.fn(), inventoryOnly: true,
    deviceOnline: true, dongleId: FIRST, routes: [], ...overrides,
  };
  const view = render(<ClipMenu {...props} />);
  return {
    update(next) {
      props = { ...props, ...next };
      view.rerender(<ClipMenu {...props} />);
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  clipDevice.getClipState.mockResolvedValue({ clips: [clip] });
  clipDevice.hasClipBlob.mockResolvedValue(false);
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

it.each([{ open: false }, { dongleId: SECOND }])('closes delete confirmation when parent lifecycle changes: %j', async (change) => {
  const menu = mountMenu();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete clip' }));
  expect(screen.getByText('Delete clip?')).toBeVisible();
  menu.update(change);
  await waitFor(() => expect(screen.queryByText('Delete clip?')).not.toBeInTheDocument());
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  menu.update({ open: true, dongleId: SECOND });
  await screen.findByRole('button', { name: 'Delete clip' });
  expect(screen.queryByText('Delete clip?')).not.toBeInTheDocument();
});

it('ignores a deletion failure after switching to another device', async () => {
  const deletion = deferred();
  clipDevice.deleteClip.mockReturnValue(deletion.promise);
  const menu = mountMenu();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete clip' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
  expect(clipDevice.deleteClip).toHaveBeenCalledWith(FIRST, { filename: 'drive.mp4' });
  menu.update({ dongleId: SECOND });
  await screen.findByRole('button', { name: 'Delete clip' });
  await act(async () => deletion.reject(new Error('Old device deletion failed')));
  expect(screen.queryByText('Old device deletion failed')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Delete clip?')).not.toBeInTheDocument());
  expect(clipDevice.deleteClip).toHaveBeenCalledTimes(1);
});

it('restores an accessible menu after cancelling deletion', async () => {
  mountMenu();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete clip' }));
  expect(screen.queryByRole('button', { name: 'Delete clip' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(await screen.findByRole('button', { name: 'Delete clip' })).toBeVisible();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
});

it('restores an accessible menu after closing the viewer', async () => {
  clipDevice.getClipUrl.mockResolvedValue('blob:preview');
  mountMenu();
  fireEvent.click(await screen.findByRole('button', { name: 'Download clip' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Close video' }));
  expect(await screen.findByRole('button', { name: 'Play clip' })).toBeVisible();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});

it('revokes a late preview after close and reopen without displaying it', async () => {
  const preview = deferred();
  clipDevice.getClipUrl.mockReturnValue(preview.promise);
  const menu = mountMenu();
  fireEvent.click(await screen.findByRole('button', { name: 'Download clip' }));
  menu.update({ open: false });
  menu.update({ open: true });
  await act(async () => preview.resolve('blob:previous-visit'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previous-visit');
  expect(screen.queryByRole('button', { name: 'Close video' })).not.toBeInTheDocument();
});

it('does not replace a reopened inventory with an earlier load', async () => {
  const staleLoad = deferred();
  clipDevice.getClipState.mockReturnValueOnce(staleLoad.promise)
    .mockResolvedValue({ clips: [{ ...clip, filename: 'current.mp4' }] });
  const menu = mountMenu();
  menu.update({ open: false });
  menu.update({ open: true });
  await screen.findByText('current');
  await act(async () => staleLoad.resolve({ clips: [{ ...clip, filename: 'stale.mp4' }] }));
  expect(screen.getByText('current')).toBeInTheDocument();
  expect(screen.queryByText('stale')).not.toBeInTheDocument();
});

it('does not reload the next device after an earlier clip creation completes', async () => {
  const creation = deferred();
  clipDevice.createClip.mockReturnValue(creation.promise);
  clipDevice.getClipState.mockResolvedValue({ clips: [], cameras: {
    'fcamera.hevc': { available_ranges: [[0, 60]] },
  } });
  const menu = mountMenu({ inventoryOnly: false, route: { fullname: `${FIRST}|2026-08-06--12-00-00` }, zoom: { start: 0, end: 10_000 } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create clip' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Create clip' }));
  expect(clipDevice.createClip).toHaveBeenCalledTimes(1);
  menu.update({ dongleId: SECOND, inventoryOnly: true, route: null });
  await screen.findByText('No clips yet');
  const calls = clipDevice.getClipState.mock.calls.length;
  await act(async () => creation.resolve({ success: true }));
  expect(clipDevice.getClipState).toHaveBeenCalledTimes(calls);
  expect(clipDevice.getClipUrl).not.toHaveBeenCalled();
});

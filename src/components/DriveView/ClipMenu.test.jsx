import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

import { ClipMenu } from './ClipMenu';
import { clipDevice } from '../../api/clips';
import { navigateModal } from '../../actions';

vi.mock('../../api/clips', () => ({ clipDevice: {
  getClipState: vi.fn(), hasClipBlob: vi.fn(), getClipUrl: vi.fn(), deleteClip: vi.fn(),
} }));
vi.mock('../../actions', () => ({ navigateModal: vi.fn((...args) => ({ type: 'NAVIGATE', args })) }));

const clip = {
  filename: 'road-trip.mp4', status: 'ready', camera: 'fcamera.hevc',
  source_start_time: 0, source_end_time: 20, route: '2026-08-06--12-00-00',
};
const props = {
  classes: {}, open: true, inventoryOnly: true, dongleId: '0000aaaa0000aaaa',
  deviceOnline: true, dispatch: vi.fn(), onClose: vi.fn(),
  navigation: { modal: 'clips', clip: clip.filename },
};

beforeEach(() => {
  vi.clearAllMocks();
  clipDevice.getClipState.mockResolvedValue({ clips: [clip] });
  clipDevice.hasClipBlob.mockResolvedValue(true);
  clipDevice.getClipUrl.mockResolvedValue('blob:clip');
  clipDevice.deleteClip.mockResolvedValue();
  URL.revokeObjectURL = vi.fn();
});

it('opens a linked clip after loading the device inventory', async () => {
  render(<ClipMenu {...props} />);
  const dialog = await screen.findByRole('dialog');
  expect(dialog.querySelector('video')).toHaveAttribute('src', 'blob:clip');
  expect(clipDevice.getClipUrl).toHaveBeenCalledWith(props.dongleId, clip.filename, undefined, expect.any(Function));
  fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
  expect(navigateModal).toHaveBeenCalledWith('clips');
});

it('discards a pending clip download when Back closes the viewer', async () => {
  let resolve;
  clipDevice.getClipUrl.mockReturnValue(new Promise(done => { resolve = done; }));
  const { rerender } = render(<ClipMenu {...props} />);
  await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledOnce());
  rerender(<ClipMenu {...props} navigation={{ modal: 'clips' }} />);
  await act(async () => resolve('blob:stale'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale');
});

it('a delete deep link only opens confirmation and never deletes on navigation', async () => {
  render(<ClipMenu {...props} navigation={{ ...props.navigation, confirm: 'delete' }} />);
  await screen.findByRole('dialog');
  expect(screen.getByText('Delete clip?')).toBeInTheDocument();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  expect(clipDevice.getClipUrl).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(navigateModal).toHaveBeenCalledWith('clips');
});

it('ignores an old device inventory after switching devices', async () => {
  let resolve;
  clipDevice.getClipState.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { rerender } = render(<ClipMenu {...props} />);
  rerender(<ClipMenu {...props} dongleId="1111bbbb1111bbbb" />);
  await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledWith('1111bbbb1111bbbb', clip.filename, undefined, expect.any(Function)));
  await act(async () => resolve({ clips: [{ ...clip, filename: 'old-device.mp4' }] }));
  expect(screen.queryByText('old-device')).not.toBeInTheDocument();
  expect(clipDevice.getClipUrl).toHaveBeenCalledTimes(1);
});

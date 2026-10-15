import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClipMenu from './ClipMenu';
import { clipDevice } from '../../api/clips';

vi.mock('../../api/clips', () => ({ clipDevice: {
  getClipState: vi.fn(), hasClipBlob: vi.fn(), getClipUrl: vi.fn(), deleteClip: vi.fn(),
} }));

const clip = { filename: 'example.mp4', requested_at: 1, status: 'ready', camera: 'fcamera.hevc',
  route: '2026-08-06--12-00-00', source_start_time: 0, source_end_time: 20, speedup: 1, size: 100 };
const props = { open: true, deviceOnline: true, dongleId: 'aaaaaaaaaaaaaaaa',
  route: { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00' }, routes: [], zoom: { start: 0, end: 20000 },
  clipFilename: clip.filename, onClose: vi.fn(), onCloseDialog: vi.fn(), onOpenDialog: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  clipDevice.getClipState.mockResolvedValue({ clips: [clip], cameras: {} });
  clipDevice.hasClipBlob.mockResolvedValue(false);
  clipDevice.getClipUrl.mockResolvedValue('blob:example');
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

it('loads a clip named by a direct dialog URL', async () => {
  render(<ClipMenu {...props} dialog="clip" />);
  await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledWith(props.dongleId, clip.filename, 1, expect.any(Function)));
  expect(await screen.findByText('example')).toBeVisible();
  await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', 'blob:example'));
  fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
  expect(props.onCloseDialog).toHaveBeenCalledOnce();
});

it('a direct deletion URL requires an explicit confirmation', async () => {
  render(<ClipMenu {...props} dialog="delete-clip" />);
  expect(await screen.findByText('Delete clip?')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled());
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(props.onCloseDialog).toHaveBeenCalledOnce();
});

it('revokes a preview that arrives after the dialog was closed through history', async () => {
  let resolve;
  clipDevice.getClipUrl.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { rerender } = render(<ClipMenu {...props} dialog="clip" />);
  await waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalledOnce());
  rerender(<ClipMenu {...props} dialog={null} open={false} />);
  await act(async () => resolve('blob:late'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  expect(document.querySelector('video')).toBeNull();
  expect(props.onOpenDialog).not.toHaveBeenCalled();
});

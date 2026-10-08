import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ClipMenu } from './ClipMenu';
import { clipDevice } from '../../api/clips';

vi.mock('../../api/clips', () => ({ clipDevice: {
  getClipState: vi.fn(), hasClipBlob: vi.fn(async () => false), getClipUrl: vi.fn(), deleteClip: vi.fn(),
} }));
const filename = 'drive.mp4';
const clip = { filename, status: 'ready', camera: 'fcamera.hevc', source_start_time: 0, source_end_time: 10, requested_at: 1 };
const props = { classes: {}, open: true, inventoryOnly: true, dialog: 'clip', clipFilename: filename,
  dongleId: '0000aaaa0000aaaa', deviceOnline: true, dispatch: vi.fn(), onClose: vi.fn() };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; }

beforeEach(() => {
  vi.clearAllMocks();
  clipDevice.getClipState.mockResolvedValue({ clips: [clip] });
  URL.revokeObjectURL = vi.fn();
});

it('restores a cold clip preview from its filename', async () => {
  clipDevice.getClipUrl.mockResolvedValue('blob:preview');
  const view = render(<ClipMenu {...props} />);
  expect(await screen.findByRole('button', { name: 'Close video' })).toBeVisible();
  expect(view.container.ownerDocument.querySelector('video')).toHaveAttribute('src', 'blob:preview');
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
});

it('revokes a delayed preview after Back closes its URL', async () => {
  const download = deferred();
  clipDevice.getClipUrl.mockReturnValue(download.promise);
  const view = render(<ClipMenu {...props} />);
  await vi.waitFor(() => expect(clipDevice.getClipUrl).toHaveBeenCalled());
  view.rerender(<ClipMenu {...props} dialog="clips" clipFilename={null} />);
  await act(async () => { download.resolve('blob:late'); await download.promise; });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  expect(screen.queryByRole('button', { name: 'Close video' })).not.toBeInTheDocument();
});

it('cold delete links ask for confirmation and never delete on entry', async () => {
  render(<ClipMenu {...props} dialog="delete-clip" />);
  expect(await screen.findByRole('heading', { name: 'Delete clip?' })).toBeVisible();
  expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  expect(clipDevice.getClipUrl).not.toHaveBeenCalled();
});

it('ignores a pending delete response after navigating to another device with the same filename', async () => {
  const pending = deferred();
  clipDevice.deleteClip.mockReturnValue(pending.promise);
  const view = render(<ClipMenu {...props} dialog="delete-clip" />);
  await screen.findByRole('heading', { name: 'Delete clip?' });
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(clipDevice.deleteClip).toHaveBeenCalledWith(props.dongleId, { filename });
  view.rerender(<ClipMenu {...props} dialog="delete-clip" dongleId="1111bbbb1111bbbb" />);
  await screen.findByRole('button', { name: 'Delete' });
  await act(async () => { pending.resolve(); await pending.promise; });
  expect(props.dispatch).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
});

it('shows a useful result for missing clip identifiers', async () => {
  clipDevice.getClipState.mockResolvedValue({ clips: [] });
  render(<ClipMenu {...props} />);
  expect(await screen.findByRole('status')).toHaveTextContent('Clip not found on this device.');
  expect(clipDevice.getClipUrl).not.toHaveBeenCalled();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipMenu } from './ClipMenu';
import { clipDevice } from '../../api/clips';

vi.mock('../../api/clips', () => ({ clipDevice: { getClipUrl: vi.fn(), deleteClip: vi.fn() } }));

function menu(modal = 'clips', filename = null) {
  const component = new ClipMenu({
    open: true, modal, clip: filename, dongleId: '0123456789abcdef', deviceOnline: true,
    onOpen: vi.fn(), onClose: vi.fn(),
  });
  component.mounted = true;
  component.setState = (update, done) => {
    Object.assign(component.state, typeof update === 'function' ? update(component.state) : update);
    done?.();
  };
  return component;
}

const clip = { filename: 'test.mp4', requested_at: 10, status: 'ready' };
beforeEach(() => {
  vi.clearAllMocks();
  URL.revokeObjectURL = vi.fn();
});

describe('URL-owned clips', () => {
  it('does not delete just because a confirmation URL was loaded', () => {
    const component = menu('delete-clip', clip.filename);
    component.state.clips = [clip];
    component.syncClip();
    expect(component.state.deletingClip).toEqual(clip);
    expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  });

  it('cannot confirm a filename absent from current inventory', async () => {
    const component = menu('delete-clip', 'missing.mp4');
    component.syncClip();
    await component.confirmDelete();
    expect(clipDevice.deleteClip).not.toHaveBeenCalled();
  });

  it('drops a preview result after Back leaves its URL', async () => {
    const component = menu('clip', clip.filename);
    let finish;
    clipDevice.getClipUrl.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const preview = component.openViewer(clip);
    component.props = { ...component.props, modal: 'clips', clip: null };
    component.syncClip();
    finish('blob:late');
    await preview;
    expect(component.state.viewingClip).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  });

  it('loads a cold viewer once inventory resolves', async () => {
    const component = menu('clip', clip.filename);
    clipDevice.getClipUrl.mockResolvedValue('blob:ready');
    component.state.clips = [clip];
    component.syncClip();
    await vi.waitFor(() => expect(component.state.viewingClip).toEqual(clip));
    expect(component.state.previewUrl).toBe('blob:ready');
  });
});

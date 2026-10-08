import { describe, expect, it, vi } from 'vitest';
import { Media } from './Media';
import { menuPosition } from './menuPosition';
vi.mock('../../actions', () => ({ analyticsEvent: vi.fn(), updateRoute: vi.fn() }));
vi.mock('../../actions/navigation', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));
vi.mock('../../actions/cached', () => ({ fetchEvents: vi.fn() }));
vi.mock('../../actions/files', () => ({ fetchFiles: vi.fn(), fetchAthenaQueue: vi.fn() }));
vi.mock('../../api/backend', () => ({ api: {} }));
vi.mock('../DriveMap', () => ({ default: () => null }));
vi.mock('../DriveVideo', () => ({ default: () => null }));
vi.mock('../TimeDisplay', () => ({ default: () => null }));

function menus(modal, anchor) {
  const component = new Media({ nav: { modal }, device: { is_owner: true }, classes: {}, dispatch: vi.fn() });
  component.filesButton = anchor;
  component.infoButton = anchor;
  component.clipsButton = anchor;
  component.getUploadStats = () => null;
  return component.renderMenus().props.children;
}

describe('cold URL menu anchors', () => {
  it.each(['files', 'info', 'clips'])('anchors cold %s to the mounted trigger', modal => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const children = menus(modal, trigger);
    const menu = modal === 'clips' ? children[0] : children.find(child => child.props?.id === (modal === 'files' ? 'menu-download' : 'menu-info'));
    expect(menu.props.open).toBe(true);
    expect(menu.props.anchorEl).toBe(trigger);
    trigger.remove();
  });
  it('ignores disconnected click anchors and centers when no trigger exists', () => {
    const stale = document.createElement('button');
    const trigger = document.createElement('button');
    expect(menuPosition(stale, trigger).anchorEl).toBe(trigger);
    expect(menuPosition(stale).anchorReference).toBe('anchorPosition');
  });
});

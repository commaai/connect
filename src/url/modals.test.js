import { describe, expect, it } from 'vitest';
import { canManageDevice, modalDevice, visibleModal } from './modals';

const id = '0123456789abcdef';
const other = 'fedcba9876543210';
const route = '2024-01-01--12-00-00';
const state = (modal, extra = {}) => ({
  router: { location: { pathname: `/${id}/${route}`, search: `?modal=${modal}`, hash: '' } },
  devices: [{ dongle_id: id, is_owner: true }],
  device: { dongle_id: id, is_owner: true },
  ...extra,
});

describe('modal permissions', () => {
  it('requires a loaded target, even for superusers', () => {
    expect(canManageDevice(null, { superuser: true })).toBe(false);
    expect(canManageDevice({ is_owner: false }, { superuser: true })).toBe(true);
    expect(canManageDevice({ is_owner: true })).toBe(true);
    expect(canManageDevice({ is_owner: false })).toBe(false);
  });

  it('does not confuse the selected device with the settings target', () => {
    const app = state('settings', {
      router: { location: { pathname: `/${id}`, search: `?modal=settings&device=${other}` } },
      devices: [{ dongle_id: other, is_owner: false }],
    });
    expect(modalDevice(app, { dongleId: id, modalDevice: other }).dongle_id).toBe(other);
    expect(visibleModal(app).modal).toBeNull();
  });

  it.each(['settings', 'settings-uploads', 'unpair', 'uploads', 'clips', 'clip', 'delete-clip'])(
    'blocks %s for a shared-device link', modal => {
      const app = state(modal, {
        devices: [{ dongle_id: id, is_owner: false }],
        device: { dongle_id: id, is_owner: false },
      });
      if (modal === 'clip' || modal === 'delete-clip') app.router.location.search += '&clip=test.mp4';
      expect(visibleModal(app).modal).toBeNull();
    },
  );

  it.each(['files', 'info'])('keeps public read-only %s available', modal => {
    expect(visibleModal(state(modal, { devices: [], device: null })).modal).toBe(modal);
  });

  it('hides settings during hydration without rewriting the cold URL', () => {
    const app = state('settings', { devices: null, device: null });
    const location = app.router.location;
    expect(visibleModal(app).modal).toBeNull();
    expect(app.router.location).toBe(location);
    app.devices = [{ dongle_id: id, is_owner: true }];
    expect(visibleModal(app).modal).toBe('settings');
  });

  it('handles malformed locations without exposing a modal', () => {
    const app = state('unknown');
    expect(visibleModal(app).modal).toBeNull();
  });
});

import { isGalleryModalOpen } from '../../scripts/gallery-modal.mjs';

describe('gallery modal readiness', () => {
  beforeEach(() => {
    vi.stubGlobal('galleryVisible', vi.fn((element) => !element.hidden));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  test.each(['dialog', 'document'])('recognizes the expected text in a visible %s', (role) => {
    document.body.innerHTML = `<div role="${role}">Device settings <button>Close</button></div>`;
    expect(isGalleryModalOpen('Device settings')).toBe(true);
  });

  test.each(['dialog', 'document'])('rejects a hidden %s containing the expected text', (role) => {
    document.body.innerHTML = `<div role="${role}" hidden>Device settings</div>`;
    expect(isGalleryModalOpen('Device settings')).toBe(false);
  });

  test('rejects a visible modal with different text', () => {
    document.body.innerHTML = '<div role="dialog">Device settings</div>';
    expect(isGalleryModalOpen('Unpair device')).toBe(false);
  });

  test('rejects matching text outside a modal', () => {
    document.body.innerHTML = '<div>Device settings</div><div role="dialog">Pair device</div>';
    expect(isGalleryModalOpen('Device settings')).toBe(false);
  });

  test('finds the visible expected modal among hidden and unrelated modals', () => {
    document.body.innerHTML = '<div role="dialog" hidden>Device settings</div><div role="dialog">Unpair device</div><div role="document">Upload queue</div>';
    expect(isGalleryModalOpen('Unpair device')).toBe(true);
    expect(isGalleryModalOpen('Upload queue')).toBe(true);
  });
});

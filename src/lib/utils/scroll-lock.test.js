import { afterEach, describe, expect, it } from 'vitest';

import { lockBodyScroll } from './scroll-lock';

afterEach(() => {
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

describe('lockBodyScroll', () => {
  it('holds the page still and puts it back', () => {
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');

    release();

    expect(document.body.style.overflow).toBe('');
  });

  it('restores whatever was there before, not a blank', () => {
    document.body.style.overflow = 'scroll';

    const release = lockBodyScroll();
    release();

    expect(document.body.style.overflow).toBe('scroll');
  });

  describe('with a modal opening on top of another', () => {
    it('stays locked when the inner one closes', () => {
      const outer = lockBodyScroll();
      const inner = lockBodyScroll();

      inner();

      // the old save-and-restore released here, unlocking the page behind a
      // modal that was still open
      expect(document.body.style.overflow).toBe('hidden');

      outer();
      expect(document.body.style.overflow).toBe('');
    });

    it('stays locked when the outer one closes first', () => {
      const outer = lockBodyScroll();
      const inner = lockBodyScroll();

      outer();
      expect(document.body.style.overflow).toBe('hidden');

      inner();
      expect(document.body.style.overflow).toBe('');
    });

    it('does not re-measure the page it has already locked', () => {
      document.body.style.overflow = 'scroll';
      const outer = lockBodyScroll();
      const inner = lockBodyScroll();

      inner();
      outer();

      // the inner lock must not have captured 'hidden' as the thing to restore
      expect(document.body.style.overflow).toBe('scroll');
    });
  });

  it('ignores a release called twice, which would strand a lock still held', () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();

    inner();
    inner();

    expect(document.body.style.overflow).toBe('hidden');

    outer();
    expect(document.body.style.overflow).toBe('');
  });

  it('pads for the scrollbar so the page does not jump sideways', () => {
    const release = lockBodyScroll();
    // jsdom lays nothing out, so the measured width is 0 — the point is that it
    // sets the property rather than leaving it alone
    expect(document.body.style.paddingRight).toBe('0px');

    release();

    expect(document.body.style.paddingRight).toBe('');
  });
});

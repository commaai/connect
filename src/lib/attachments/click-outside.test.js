import { afterEach, describe, expect, it, vi } from 'vitest';

import { clickOutside } from './click-outside';

let node;
let cleanup;

/** Attachments are plain `(node) => teardown`, so no component is needed. */
function attach(close) {
  node = document.createElement('div');
  node.innerHTML = '<button type="button">inside</button>';
  document.body.appendChild(node);
  cleanup = clickOutside(close)(node);
  return node;
}

const pointerDownOn = (el) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));

afterEach(() => {
  cleanup?.();
  node?.remove();
  cleanup = null;
  node = null;
});

describe('clickOutside', () => {
  it('closes on a pointer down elsewhere on the page', () => {
    const close = vi.fn();
    attach(close);

    pointerDownOn(document.body);

    expect(close).toHaveBeenCalled();
  });

  it('leaves a pointer down on the node itself alone', () => {
    const close = vi.fn();
    attach(close);

    pointerDownOn(node);

    expect(close).not.toHaveBeenCalled();
  });

  it('leaves one on a descendant alone, so the menu can be used', () => {
    const close = vi.fn();
    attach(close);

    pointerDownOn(node.querySelector('button'));

    expect(close).not.toHaveBeenCalled();
  });

  it('listens for pointerdown, which a touch produces and mousedown does not', () => {
    const close = vi.fn();
    attach(close);

    document.body.dispatchEvent(new Event('mousedown', { bubbles: true }));
    expect(close).not.toHaveBeenCalled();

    pointerDownOn(document.body);
    expect(close).toHaveBeenCalled();
  });

  it('stops listening once detached', () => {
    const close = vi.fn();
    attach(close);

    cleanup();
    cleanup = null;
    pointerDownOn(document.body);

    expect(close).not.toHaveBeenCalled();
  });
});

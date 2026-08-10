import { afterEach, describe, expect, it, vi } from 'vitest';

import { keepTouch } from './keep-touch';

let parent;
let node;
let cleanup;

function attach() {
  parent = document.createElement('div');
  node = document.createElement('div');
  parent.appendChild(node);
  document.body.appendChild(parent);
  cleanup = keepTouch()(node);
  return node;
}

afterEach(() => {
  cleanup?.();
  parent?.remove();
  cleanup = null;
});

describe('keepTouch', () => {
  it('keeps a touch on the element from reaching an ancestor', () => {
    const onAncestor = vi.fn();
    attach();
    parent.addEventListener('touchstart', onAncestor);

    node.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(onAncestor).not.toHaveBeenCalled();
  });

  it('leaves a touch that started elsewhere alone', () => {
    const onAncestor = vi.fn();
    attach();
    parent.addEventListener('touchstart', onAncestor);

    const sibling = document.createElement('div');
    parent.appendChild(sibling);
    sibling.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(onAncestor).toHaveBeenCalled();
  });

  it('stops holding it back once detached', () => {
    const onAncestor = vi.fn();
    attach();
    parent.addEventListener('touchstart', onAncestor);

    cleanup();
    cleanup = null;
    node.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(onAncestor).toHaveBeenCalled();
  });
});

import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RenderScan from './RenderScan.svelte';

let ctx;

beforeEach(() => {
  ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
  };
  // the same context object however many times it is asked for
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
  // jsdom lays nothing out, and an element with no box is skipped as undrawable
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 10, y: 40, left: 10, top: 40, width: 100, height: 50, right: 110, bottom: 90,
  }));
});

/** Two frames: one for the observer's records to land, one to draw them. */
const nextFrames = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

function mutateThePage() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  el.setAttribute('data-x', '1');
  return el;
}

describe('RenderScan', () => {
  it('scans as soon as it is mounted, with nothing to switch on', async () => {
    render(RenderScan);

    mutateThePage();
    await nextFrames();

    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('puts no controls of its own on the page', () => {
    const { container } = render(RenderScan);
    expect(container.querySelector('button')).toBeNull();
  });

  it('labels what changed', async () => {
    render(RenderScan);

    mutateThePage();
    await nextFrames();

    const labels = ctx.fillText.mock.calls.map(([text]) => text);
    expect(labels.join(' ')).toMatch(/added|data-x/);
  });

  it('draws nothing at all until something changes', async () => {
    render(RenderScan);

    await nextFrames();

    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('ignores its own canvas, which resizing rewrites', async () => {
    render(RenderScan);
    await nextFrames();
    ctx.strokeRect.mockClear();

    // the resize handler sets canvas.width/height — an attribute mutation the
    // observer would otherwise pick up and outline
    window.dispatchEvent(new Event('resize'));
    await nextFrames();

    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it('keeps its overlay out of the way of the page', () => {
    const { container } = render(RenderScan);
    const canvas = container.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas.className).toContain('pointer-events-none');
  });

  it('stops observing when it goes away', async () => {
    const { unmount } = render(RenderScan);
    unmount();
    ctx.strokeRect.mockClear();

    mutateThePage();
    await nextFrames();

    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

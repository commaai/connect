import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { playback } from '$lib/state/playback.svelte.js';
import Timeline from './Timeline.svelte';

// The events live in module state that only the fetch path fills, so the reader
// is stubbed rather than driving a fetch to populate it.
const { getRouteEvents } = vi.hoisted(() => ({ getRouteEvents: vi.fn(() => []) }));
vi.mock('$lib/state/routes.svelte.js', () => ({
  getRouteEvents,
  getRouteVideoStartOffset: () => null,
  getRouteLocations: () => undefined,
  getRouteDriveCoords: () => undefined,
  fetchEvents: vi.fn(),
  fetchDriveCoords: vi.fn(),
  fetchLocations: vi.fn(),
}));

/**
 * The colours are authored as hex and land in the style attribute as rgb(), so
 * every assertion goes through this rather than matching the source spelling —
 * a hex match would silently never fire.
 */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  /* eslint-disable no-bitwise */
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  /* eslint-enable no-bitwise */
}

const DRIVING_BLUE = rgb('#175886');
const ENGAGED_GREEN = rgb('#178645');
const ALERT_RED = rgb('#c92231');
const USER_BOOKMARK = rgb('#e3d756');

const route = {
  fullname: '1d3dc3e03047b0c7|000000dd--455f14369d',
  log_id: '000000dd--455f14369d',
  duration: 600000, // ten minutes
  start_time_utc_millis: new Date(2026, 5, 5, 9, 0, 0).getTime(),
};

/** A band needs data.end_route_offset_millis; anything else is filtered out. */
const band = (type, start, end, data = {}) => ({
  type,
  route_offset_millis: start,
  data: { end_route_offset_millis: end, ...data },
});

beforeEach(() => {
  getRouteEvents.mockReturnValue([]);
  playback.reset();
  // hold the clock still: currentOffset() otherwise advances with wall time
  playback.pause();
  playback.zoom = { start: 0, end: route.duration, previous: null };
});

/** jsdom has no layout, so the ruler reports a real box for the drag maths. */
function stubRulerBox(container, { x = 100, width = 1000 } = {}) {
  const ruler = container.querySelector('.touch-none');
  ruler.getBoundingClientRect = () => ({
    x, left: x, width, height: 44, y: 0, top: 0, right: x + width, bottom: 44,
  });
  return ruler;
}

/**
 * pageX is derived from clientX and the scroll offset, so jsdom drops it from a
 * MouseEvent init dict. The handlers read it directly; define it on the event.
 */
function pointer(type, pageX, init = {}) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(ev, 'pageX', { value: pageX });
  return ev;
}

const bandStyles = (container) => [...container.querySelectorAll('.inline-block')].map((el) => el.getAttribute('style'));

describe('Timeline', () => {
  it('renders no route bar until the events have arrived', () => {
    getRouteEvents.mockReturnValue(undefined);
    const { container } = render(Timeline, { route });
    expect(container.querySelector(`[style*="${DRIVING_BLUE}"]`)).toBeNull();
  });

  it('renders the driving bar once they have, even when there are none', () => {
    const { container } = render(Timeline, { route });
    expect(container.querySelector(`[style*="${DRIVING_BLUE}"]`)).not.toBeNull();
  });

  describe('the route bar under zoom', () => {
    it('fills the width exactly when the whole route is in view', () => {
      const { container } = render(Timeline, { route });
      const style = container.querySelector(`[style*="${DRIVING_BLUE}"]`).getAttribute('style');
      expect(style).toContain('width: 100%');
      expect(style).toContain('left: 0%');
    });

    it('scales and shifts when zoomed into the second half', () => {
      playback.zoom = { start: 300000, end: 600000, previous: null };
      const { container } = render(Timeline, { route });
      const style = container.querySelector(`[style*="${DRIVING_BLUE}"]`).getAttribute('style');
      // a 5 minute window onto a 10 minute route: twice as wide, pulled left by one window
      expect(style).toContain('width: 200%');
      expect(style).toContain('left: -100%');
    });

    it('takes an explicit zoom over the shared playback one', () => {
      playback.zoom = { start: 0, end: route.duration, previous: null };
      const { container } = render(Timeline, {
        route,
        zoomOverride: { start: 300000, end: 600000, previous: null },
      });
      expect(container.querySelector(`[style*="${DRIVING_BLUE}"]`).getAttribute('style')).toContain('width: 200%');
    });
  });

  describe('event bands', () => {
    it('places a band by its offset and length within the route', () => {
      getRouteEvents.mockReturnValue([band('engage', 60000, 180000)]);
      const { container } = render(Timeline, { route });
      const [style] = bandStyles(container);
      expect(style).toContain('left: 10%'); // 60s of 600s
      expect(style).toContain('width: 20%'); // 120s of 600s
      expect(style).toContain(`background: ${ENGAGED_GREEN}`);
    });

    it('drops events that never ended', () => {
      getRouteEvents.mockReturnValue([
        { type: 'engage', route_offset_millis: 1000, data: {} },
        { type: 'engage', route_offset_millis: 2000 },
        band('engage', 60000, 120000),
      ]);
      const { container } = render(Timeline, { route });
      expect(bandStyles(container)).toHaveLength(1);
    });

    it('colours a critical alert differently from a prompt', () => {
      getRouteEvents.mockReturnValue([band('alert', 0, 1000, { alertStatus: 2 })]);
      const { container } = render(Timeline, { route });
      expect(bandStyles(container)[0]).toContain(`background: ${ALERT_RED}`);
    });

    it('gives an unrecognised event a band with no colour of its own', () => {
      getRouteEvents.mockReturnValue([band('something-new', 0, 1000)]);
      const { container } = render(Timeline, { route });
      expect(bandStyles(container)[0]).not.toContain('background:');
    });

    it('lifts a bookmark above the bands it would otherwise sit under', () => {
      getRouteEvents.mockReturnValue([band('engage', 0, 600000), band('bookmark', 60000, 61000)]);
      const { container } = render(Timeline, { route });
      const [engage, bookmark] = bandStyles(container);
      expect(engage).not.toContain('z-index');
      expect(bookmark).toContain('z-index: 1');
      expect(bookmark).toContain(`background: ${USER_BOOKMARK}`);
    });

    it('keeps a zero-length band visible', () => {
      getRouteEvents.mockReturnValue([band('bookmark', 60000, 60000 + 1)]);
      const { container } = render(Timeline, { route });
      expect(bandStyles(container)[0]).toContain('min-width: 1px');
    });
  });

  describe('the ruler', () => {
    it('is only there when asked for', () => {
      const { container } = render(Timeline, { route });
      expect(container.querySelector('.touch-none')).toBeNull();
    });

    it('seeks to the point clicked', async () => {
      const { container } = render(Timeline, { route, hasRuler: true });
      const ruler = stubRulerBox(container);

      // a click is a pointerdown and pointerup within 3px
      ruler.dispatchEvent(pointer('pointerdown', 350));
      ruler.dispatchEvent(pointer('pointerup', 350));

      // 250px into a 1000px ruler over a 600s route
      expect(playback.currentOffset()).toBeCloseTo(150000, -1);
    });

    it('reports the dragged range instead of seeking to the release point', async () => {
      const onrange = vi.fn();
      const { container } = render(Timeline, { route, hasRuler: true, onrange });
      const ruler = stubRulerBox(container);

      ruler.dispatchEvent(pointer('pointerdown', 300));
      document.dispatchEvent(pointer('pointermove', 600));
      document.dispatchEvent(pointer('pointerup', 600));

      expect(onrange).toHaveBeenCalledWith(route.log_id, 120000, 300000);
    });

    it('drags the same range when pulled right to left', async () => {
      const onrange = vi.fn();
      const { container } = render(Timeline, { route, hasRuler: true, onrange });
      const ruler = stubRulerBox(container);

      ruler.dispatchEvent(pointer('pointerdown', 600));
      document.dispatchEvent(pointer('pointermove', 300));
      document.dispatchEvent(pointer('pointerup', 300));

      expect(onrange).toHaveBeenCalledWith(route.log_id, 120000, 300000);
    });

    it('ignores a drag started with a non-primary button', async () => {
      const onrange = vi.fn();
      const { container } = render(Timeline, { route, hasRuler: true, onrange });
      const ruler = stubRulerBox(container);

      ruler.dispatchEvent(pointer('pointerdown', 300, { button: 2 }));
      document.dispatchEvent(pointer('pointerup', 600, { button: 2 }));

      expect(onrange).not.toHaveBeenCalled();
    });

    it('clamps a drag that leaves the ruler to its edge', async () => {
      const onrange = vi.fn();
      const { container } = render(Timeline, { route, hasRuler: true, onrange });
      const ruler = stubRulerBox(container);

      ruler.dispatchEvent(pointer('pointerdown', 600));
      document.dispatchEvent(pointer('pointermove', 5000));
      document.dispatchEvent(pointer('pointerup', 5000));

      // clamped to the right edge, which is the end of the route
      expect(onrange).toHaveBeenCalledWith(route.log_id, 300000, 600000);
    });

    it('labels the hovered point with its segment and wall-clock time', async () => {
      const { container } = render(Timeline, { route, hasRuler: true });
      const ruler = stubRulerBox(container);

      ruler.dispatchEvent(pointer('pointerdown', 300));
      document.dispatchEvent(pointer('pointermove', 300));
      await tick();

      // 200px of 1000px into a 600s route starting 09:00 is segment 2, 09:02:00
      expect(container.textContent).toContain('2, 09:02:00');
    });
  });
});

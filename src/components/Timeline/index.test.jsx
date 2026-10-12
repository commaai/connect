import React from 'react';
import { Provider } from 'react-redux';
import { act, render, screen } from '@testing-library/react';

import Timeline from '.';

const playhead = vi.hoisted(() => ({ offset: null }));
vi.mock('../../timeline', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    bufferedRanges: () => [[0, 30000]],
    currentOffset: () => playhead.offset ?? original.currentOffset(),
  };
});
vi.mock('../../timeline/playback', async (importOriginal) => ({
  ...(await importOriginal()),
  seek: (offset) => ({ type: 'seek', offset }),
}));

const route = {
  fullname: 'dongle|log',
  log_id: 'log',
  duration: 60000,
  start_time_utc_millis: 0,
  segment_start_times: [0],
  segment_end_times: [60000],
  segment_numbers: [0],
  events: [],
};

// a 1000px wide scrubber starting at x=0
const rect = { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 24, width: 1000, height: 24 };

function pointer(target, type, props) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { button: 0, ...props });
  act(() => { target.dispatchEvent(event); });
}

function renderTimeline() {
  const store = { getState: () => ({ zoom: { start: 0, end: 60000 }, loop: null }), subscribe: () => () => {}, dispatch: vi.fn() };
  render(<Provider store={store}><Timeline overlay hasRuler route={route} /></Provider>);
  const slider = screen.getByRole('slider', { name: 'Drive timeline' });
  slider.getBoundingClientRect = () => rect; // jsdom has no layout
  return { store, slider };
}

describe('overlay Timeline on touch', () => {
  it('scrubs while a finger is dragged', () => {
    const { store, slider } = renderTimeline();
    pointer(slider, 'pointerdown', { pageX: 100, pointerType: 'touch' });
    pointer(document, 'pointermove', { pageX: 500, pointerType: 'touch' });
    expect(store.dispatch).toHaveBeenLastCalledWith({ type: 'seek', offset: 30000 });
    pointer(document, 'pointermove', { pageX: 750, pointerType: 'touch' });
    expect(store.dispatch).toHaveBeenLastCalledWith({ type: 'seek', offset: 45000 });
    pointer(document, 'pointerup', { pageX: 750, pointerType: 'touch' });
    expect(store.dispatch.mock.calls.every(([action]) => action.type === 'seek')).toBe(true); // no range zoom
  });

  it('scrubs when the mouse grabs the playhead dot (a small drag used to zoom into a 1 s loop)', () => {
    playhead.offset = 6000; // dot at x=100
    const { store, slider } = renderTimeline();
    pointer(slider, 'pointerdown', { pageX: 104, pointerType: 'mouse' });
    pointer(document, 'pointermove', { pageX: 120, pointerType: 'mouse' });
    expect(store.dispatch).toHaveBeenLastCalledWith({ type: 'seek', offset: 7200 });
    pointer(document, 'pointerup', { pageX: 120, pointerType: 'mouse' });
    expect(store.dispatch.mock.calls.every(([action]) => action.type === 'seek')).toBe(true);
    playhead.offset = null;
  });

  it('zooms into a range dragged along the track, but a nudge under 5 s just seeks', () => {
    playhead.offset = 6000; // dot at x=100, away from where the drag starts
    const { store, slider } = renderTimeline();
    pointer(slider, 'pointerdown', { pageX: 500, pointerType: 'mouse' });
    pointer(document, 'pointermove', { pageX: 520, pointerType: 'mouse' }); // 1.2 s
    pointer(document, 'pointerup', { pageX: 520, pointerType: 'mouse' });
    expect(store.dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: 'seek', offset: 30000 }]);

    store.dispatch.mockClear();
    pointer(slider, 'pointerdown', { pageX: 500, pointerType: 'mouse' });
    pointer(document, 'pointermove', { pageX: 750, pointerType: 'mouse' }); // 15 s
    pointer(document, 'pointerup', { pageX: 750, pointerType: 'mouse' });
    expect(store.dispatch.mock.calls.some(([action]) => action.type !== 'seek')).toBe(true); // the range zoom
    playhead.offset = null;
  });

  it('stops scrubbing when the browser cancels the touch (iOS does this)', () => {
    const { store, slider } = renderTimeline();
    pointer(slider, 'pointerdown', { pageX: 100, pointerType: 'touch' });
    pointer(document, 'pointermove', { pageX: 500, pointerType: 'touch' });
    pointer(document, 'pointercancel', { pageX: 500, pointerType: 'touch' });
    store.dispatch.mockClear();
    pointer(document, 'pointermove', { pageX: 900, pointerType: 'touch' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

describe('overlay Timeline from the keyboard', () => {
  const press = (slider, key) => act(() => { slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });

  it('steps with the arrow keys and clamps to the drive', () => {
    const { store, slider } = renderTimeline();
    press(slider, 'ArrowRight');
    expect(store.dispatch).toHaveBeenLastCalledWith({ type: 'seek', offset: 5000 });
    press(slider, 'ArrowLeft');
    expect(store.dispatch).toHaveBeenLastCalledWith({ type: 'seek', offset: 0 });
    press(slider, 'End');
    expect(store.dispatch).toHaveBeenLastCalledWith({ type: 'seek', offset: 60000 });
  });

  it('tells assistive technology the range', () => {
    const { slider } = renderTimeline();
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '60');
  });
});

describe('overlay Timeline painting', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }));
  afterEach(() => vi.useRealTimers());

  it('restyles the loaded-range bar only when the range changes, not every frame', () => {
    const { slider } = renderTimeline();
    const bar = slider.querySelector('.h-0\\.5');
    const writes = vi.fn();
    Object.defineProperty(bar.style, 'background', { set: writes, get: () => '', configurable: true });
    act(() => { vi.advanceTimersByTime(500); }); // about 30 frames
    expect(writes.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

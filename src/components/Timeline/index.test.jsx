import React, { Profiler } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createStore } from 'redux';
import { vi } from 'vitest';

import Timeline from '.';
import { currentOffset } from '../../timeline';

vi.mock('../../timeline', () => ({ currentOffset: vi.fn(), seek: vi.fn() }));

const route = { fullname: 'device|drive', duration: 600000 };

describe('timeline playback following', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    currentOffset.mockReturnValue(1200000);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderTimeline(hasRuler, view) {
    const onRender = vi.fn();
    const store = createStore(() => ({ zoom: view, loop: null }));
    const result = render(
      <Profiler id="timeline" onRender={onRender}>
        <Timeline store={store} route={route} hasRuler={hasRuler} zoomOverride={view} />
      </Profiler>,
    );
    onRender.mockClear();
    return { ...result, onRender };
  }

  function advanceFrames(count) {
    for (let frame = 0; frame < count; frame += 1) {
      act(() => requestAnimationFrame.mock.calls.at(-1)[0]());
    }
  }

  it('does not re-render dashboard timelines after leaving a longer drive', () => {
    const { onRender } = renderTimeline(false, { start: 0, end: 600000 });

    advanceFrames(60);

    expect(onRender.mock.calls.length).toBe(0);
  });

  it('does not move dashboard ranges to follow the global playhead', () => {
    currentOffset.mockReturnValue(120000);
    const { onRender } = renderTimeline(false, { start: 0, end: 60000 });

    advanceFrames(2);

    expect(onRender.mock.calls.length).toBe(0);
  });

  it('does not re-render the main timeline when its range is already clamped', () => {
    const { onRender } = renderTimeline(true, { start: 0, end: 600000 });

    advanceFrames(60);

    expect(onRender.mock.calls.length).toBe(0);
  });

  it.each([
    [120000, { start: 0, end: 60000 }],
    [60000, { start: 120000, end: 180000 }],
  ])('follows a playhead at %i on the main timeline only once', (offset, view) => {
    currentOffset.mockReturnValue(offset);
    const { onRender, getByRole } = renderTimeline(true, view);

    advanceFrames(60);

    expect(onRender).toHaveBeenCalledTimes(1);
    const playhead = getByRole('slider', { name: 'Drive timeline' }).lastElementChild;
    expect(playhead.style.left).toBe('25%');
  });
});

describe('timeline touch lifecycle', () => {
  let store;
  let ruler;

  function pointer(target, type, x, pointerId = 1) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      pointerType: { value: 'touch' },
    });
    fireEvent(target, event);
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    currentOffset.mockReturnValue(0);
    store = createStore((state = { zoom: { start: 0, end: 600000 }, loop: null }, action) => {
      if (action.type === 'TIMELINE_PREVIEW_SELECTION') {
        return { ...state, selectionPreview: action.start == null ? null : { start: action.start, end: action.end } };
      }
      return state;
    });
    const result = render(<Timeline store={store} route={route} hasRuler />);
    ruler = result.getByRole('slider', { name: 'Drive timeline' });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({ x: 0, left: 0, width: 600 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('releases a cancelled range so a later map gesture cannot change it', () => {
    pointer(ruler, 'pointerdown', 100);
    pointer(document, 'pointermove', 200);
    expect(store.getState().selectionPreview).toEqual({ start: 100000, end: 200000 });

    pointer(document, 'pointercancel', 200);
    pointer(document, 'pointermove', 400, 2);

    expect(store.getState().selectionPreview).toBeNull();
  });

  it('ignores other fingers while a range is being selected', () => {
    pointer(ruler, 'pointerdown', 100);
    pointer(document, 'pointermove', 200);
    pointer(document, 'pointermove', 400, 2);

    expect(store.getState().selectionPreview).toEqual({ start: 100000, end: 200000 });
    pointer(document, 'pointercancel', 200);
  });

  it('clears an unfinished preview when the timeline is closed', () => {
    pointer(ruler, 'pointerdown', 100);
    pointer(document, 'pointermove', 200);
    cleanup();
    pointer(document, 'pointermove', 400);

    expect(store.getState().selectionPreview).toBeNull();
  });
});

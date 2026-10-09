import React, { Profiler } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { vi } from 'vitest';

import Timeline from '.';
import { currentOffset, seek } from '../../timeline';

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

  it('runs no animation loop for dashboard timelines', () => {
    currentOffset.mockReturnValue(120000);
    const { onRender } = renderTimeline(false, { start: 0, end: 60000 });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
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

describe('leaving a selection', () => {
  const drive = { ...route, log_id: 'drive' };
  const segment = { start: 60000, end: 120000 };
  let store;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    currentOffset.mockReturnValue(90000);
    store = createStore((state = { zoom: segment, loop: null }, action) => {
      if (action.type === 'TIMELINE_PUSH_SELECTION') {
        return { ...state, zoom: { start: action.start, end: action.end } };
      }
      return state;
    }, applyMiddleware(thunk));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops the selection with the whole drive button and keeps playing from the same spot', () => {
    const { getByRole } = render(<Timeline store={store} route={drive} hasRuler />);

    fireEvent.click(getByRole('button', { name: 'whole drive' }));

    expect(store.getState().zoom).toEqual({ start: 0, end: 600000 });
    expect(seek).toHaveBeenLastCalledWith(90000);
  });

  it('zooms back out when the selection is dropped from elsewhere', () => {
    const { queryByRole } = render(<Timeline store={store} route={drive} hasRuler />);
    expect(queryByRole('button', { name: 'whole drive' })).not.toBeNull();

    act(() => {
      store.dispatch({ type: 'TIMELINE_PUSH_SELECTION', start: 0, end: 600000 });
    });

    expect(queryByRole('button', { name: 'whole drive' })).toBeNull();
  });
});

describe('bar and playhead', () => {
  const drive = { ...route, log_id: 'drive' };
  let store;
  let ruler;
  let handle;

  function pointer(target, type, x) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'touch' },
    });
    fireEvent(target, event);
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    currentOffset.mockReturnValue(100000);
    store = createStore((state = { zoom: { start: 0, end: 600000 }, loop: null }, action) => {
      if (action.type === 'TIMELINE_PUSH_SELECTION') {
        return { ...state, zoom: { start: action.start, end: action.end } };
      }
      return state;
    }, applyMiddleware(thunk));
    const { getByRole } = render(<Timeline store={store} route={drive} hasRuler />);
    ruler = getByRole('slider', { name: 'Drive timeline' });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({ x: 0, left: 0, width: 600 });
    const playhead = ruler.lastElementChild;
    vi.spyOn(playhead, 'getBoundingClientRect').mockReturnValue({ x: 100, left: 100, width: 2 });
    handle = playhead.firstElementChild;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('selects exactly the segment under a tap on the bar', () => {
    pointer(ruler, 'pointerdown', 150);
    pointer(ruler, 'pointerup', 150);

    expect(store.getState().zoom).toEqual({ start: 120000, end: 180000 });
  });

  it('leaves playback where it is after a tap on the playhead handle', () => {
    pointer(handle, 'pointerdown', 110);
    pointer(handle, 'pointerup', 110);

    expect(seek).not.toHaveBeenCalled();
  });

  it('moves the playhead by as much as the handle is dragged', () => {
    pointer(handle, 'pointerdown', 110);
    pointer(document, 'pointermove', 210);

    expect(seek).toHaveBeenLastCalledWith(200000);
  });
});

describe('scrolling a long drive', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('scrolls to the playhead when it is off screen, but not right after the user scrolled away', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    currentOffset.mockReturnValue(300000); // halfway along
    const store = createStore(() => ({ zoom: { start: 0, end: 600000 }, loop: null }));
    const { getByRole } = render(<Timeline store={store} route={route} hasRuler />);
    const ruler = getByRole('slider', { name: 'Drive timeline' });
    const scroller = ruler.parentElement.parentElement.parentElement;
    Object.defineProperty(ruler, 'offsetWidth', { value: 2000 });
    Object.defineProperty(scroller, 'clientWidth', { value: 400 });
    Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true });
    const nextFrame = () => act(() => requestAnimationFrame.mock.calls.at(-1)[0]());

    // 24px padding + 1000px, put a quarter of the way in
    nextFrame();
    expect(scroller.scrollLeft).toBe(924);

    scroller.scrollLeft = 0;
    fireEvent.scroll(scroller);
    currentOffset.mockReturnValue(301200); // playing on, 1004px along
    nextFrame();
    expect(scroller.scrollLeft).toBe(0);

    now.mockReturnValue(6001);
    currentOffset.mockReturnValue(302400); // 1008px along
    nextFrame();
    expect(scroller.scrollLeft).toBe(932);
  });
});

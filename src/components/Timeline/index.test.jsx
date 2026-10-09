import React, { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
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

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import Timeline from '.';
import { seek } from '../../timeline/playback';

const mocks = vi.hoisted(() => ({ offset: 25000, subscribe: vi.fn() }));
vi.mock('../../timeline', () => ({ currentOffset: () => mocks.offset, subscribePlaybackFrames: mocks.subscribe }));
vi.mock('./thumbnails', () => ({ default: () => <div data-testid="thumbnails" /> }));

let rect;
beforeEach(() => {
  mocks.offset = 25000;
  mocks.subscribe.mockReset().mockImplementation(() => vi.fn());
  rect = { left: 100, right: 700, top: 10, bottom: 86, x: 100, y: 10, width: 600, height: 76 };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect);
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    constructor(type, options) {
      super(type, options);
      Object.defineProperties(this, { pointerId: { value: options.pointerId ?? 1 }, pointerType: { value: options.pointerType ?? 'mouse' } });
    }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(zoom = { start: 0, end: 60000 }, hasRuler = true) {
  const state = { zoom, offset: 25000, desiredPlaySpeed: 2, seekRequest: { id: 3, offset: 20000 }, loop: { startTime: 0, duration: 60000 } };
  const store = createStore(() => state);
  const dispatch = vi.spyOn(store, 'dispatch');
  const view = render(<Provider store={store}><Timeline route={{ fullname: 'demo|route', log_id: 'route', duration: 60000, start_time_utc_millis: 0, events: [] }} hasRuler={hasRuler} thumbnailsVisible /></Provider>);
  return { ...view, store, state, dispatch, slider: hasRuler ? screen.getByRole('slider', { name: 'Drive timeline' }) : null };
}

function wheel(target, deltaY, clientX = 400, deltaMode = 0) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, clientX, deltaMode });
  act(() => target.dispatchEvent(event));
  return event;
}
function bounds(slider) {
  return [Number(slider.getAttribute('aria-valuemin')), Number(slider.getAttribute('aria-valuemax'))];
}

describe('timeline view gestures', () => {
  it.each([0, 1, 2])('zooms around the cursor with wheel mode %s without commanding playback', (mode) => {
    const app = setup();
    const event = wheel(screen.getByTestId('thumbnails'), -Math.log(2) / 0.002 / (mode === 1 ? 16 : mode === 2 ? 600 : 1), 250, mode);
    const [start, end] = bounds(app.slider);
    expect(start).toBeCloseTo(7.5);
    expect(end).toBeCloseTo(37.5);
    expect(start + 0.25 * (end - start)).toBeCloseTo(15);
    expect(event.defaultPrevented).toBe(true);
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(app.store.getState()).toBe(app.state);
  });

  it('constrains the view to selected bounds and a one-second minimum', () => {
    const app = setup({ start: 10000, end: 20000 });
    for (let index = 0; index < 5; index += 1) wheel(app.slider, -1000, 100);
    expect(bounds(app.slider)).toEqual([10, 11]);
    expect(app.slider.firstElementChild.style.left).toBe('100%');
    expect(app.slider.firstElementChild.style.width).toBe('0%');
    for (let index = 0; index < 5; index += 1) wheel(app.slider, 1000, 700);
    expect(bounds(app.slider)).toEqual([10, 20]);
    expect(app.dispatch).not.toHaveBeenCalled();
  });

  it('pinches around the two-finger midpoint and suppresses pointer-release clicks', () => {
    const app = setup();
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 220, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 380, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(document, { clientX: 140, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(document, { clientX: 460, pointerId: 2, pointerType: 'touch' });
    expect(bounds(app.slider)).toEqual([10, 40]);
    fireEvent.pointerUp(app.slider, { button: 0, clientX: 140, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(app.slider, { clientX: 650, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(app.slider, { button: 0, clientX: 650, pointerId: 2, pointerType: 'touch' });
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(mocks.offset).toBe(25000);
  });

  it('retains click seek after local zoom and ignores single-pointer movement', () => {
    const app = setup();
    wheel(app.slider, -Math.log(2) / 0.002);
    expect(bounds(app.slider)).toEqual([15, 45]);
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 250 });
    fireEvent.pointerUp(app.slider, { button: 0, clientX: 250 });
    expect(app.dispatch).toHaveBeenCalledWith(seek(22500));
    app.dispatch.mockClear();
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 250 });
    fireEvent.pointerMove(document, { clientX: 550 });
    fireEvent.pointerUp(document, { button: 0, clientX: 550 });
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(bounds(app.slider)).toEqual([15, 45]);
  });

  it('provides keyboard view zoom/reset and explicit keyboard seeking', () => {
    const app = setup();
    fireEvent.keyDown(app.slider, { key: '+' });
    expect(bounds(app.slider)).toEqual([6, 54]);
    expect(app.dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(app.slider, { key: '0' });
    expect(bounds(app.slider)).toEqual([0, 60]);
    fireEvent.keyDown(app.slider, { key: 'ArrowRight' });
    expect(app.dispatch).toHaveBeenCalledWith(seek(26000));
  });

  it('leaves page gestures alone and removes active listeners on cancellation/unmount', () => {
    const app = setup();
    expect(wheel(document.body, -300).defaultPrevented).toBe(false);
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 200 });
    fireEvent.pointerCancel(document, { pointerId: 1 });
    fireEvent.pointerUp(document, { clientX: 500 });
    expect(app.dispatch).not.toHaveBeenCalled();
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 200 });
    app.unmount();
    const move = new PointerEvent('pointermove', { pointerId: 1, clientX: 500, cancelable: true });
    document.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    expect(wheel(app.slider, -300).defaultPrevented).toBe(false);
  });

  it('ignores collapsed layout and does not intercept noninteractive previews', () => {
    const app = setup();
    rect = { ...rect, width: 0 };
    expect(wheel(app.slider, -300).defaultPrevented).toBe(false);
    expect(bounds(app.slider)).toEqual([0, 60]);
    app.unmount();
    setup(undefined, false);
    expect(wheel(screen.getByTestId('thumbnails'), -300).defaultPrevented).toBe(false);
  });

  it.each([{ start: NaN, end: 60000 }, { start: 0, end: Infinity }, { start: -Number.MAX_VALUE, end: Number.MAX_VALUE }])('ignores invalid or overflowing view bounds', (zoom) => {
    const app = setup(zoom);
    expect(wheel(app.slider, -300).defaultPrevented).toBe(false);
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 200 });
    fireEvent.pointerUp(app.slider, { button: 0, clientX: 500 });
    expect(app.dispatch).not.toHaveBeenCalled();
  });

  it('does not seek when layout collapses before pointer release', () => {
    const app = setup();
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 200 });
    fireEvent.pointerMove(document, { clientX: 500 });
    rect = { ...rect, width: 0 };
    fireEvent.pointerUp(document, { clientX: 500 });
    expect(app.dispatch).not.toHaveBeenCalled();
  });

  it('retains a selected interval shorter than the minimum zoom span', () => {
    const app = setup({ start: 10000, end: 10500 });
    wheel(app.slider, -1000);
    expect(bounds(app.slider)).toEqual([10, 10.5]);
    expect(app.dispatch).not.toHaveBeenCalled();
  });

  it('does not seek after a vertical out-and-back movement', () => {
    const app = setup();
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 400, clientY: 30 });
    fireEvent.pointerMove(document, { clientX: 400, clientY: 80 });
    fireEvent.pointerMove(document, { clientX: 400, clientY: 30 });
    fireEvent.pointerUp(app.slider, { button: 0, clientX: 400, clientY: 30 });
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(bounds(app.slider)).toEqual([0, 60]);
  });

  it('supports a vertical two-finger pinch without issuing playback commands', () => {
    const app = setup();
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 400, clientY: 20, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(app.slider, { button: 0, clientX: 400, clientY: 80, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(document, { clientX: 400, clientY: -10, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(document, { clientX: 400, clientY: 110, pointerId: 2, pointerType: 'touch' });
    expect(bounds(app.slider)).toEqual([15, 45]);
    fireEvent.pointerUp(app.slider, { button: 0, clientX: 400, clientY: -10, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(app.slider, { button: 0, clientX: 400, clientY: 110, pointerId: 2, pointerType: 'touch' });
    expect(app.dispatch).not.toHaveBeenCalled();
  });
});

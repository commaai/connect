import { vi } from 'vitest';
import { attachPlaybackClock, currentOffset, subscribePlaybackFrames } from '.';

const mockStore = vi.hoisted(() => ({ state: null, listeners: new Set(), subscribe: vi.fn() }));
vi.mock('../store', () => ({ default: { getState: () => mockStore.state, subscribe: mockStore.subscribe } }));

const ROUTE = 'demo|route';
let detach;
let frames;
let cleanups;
function nextFrame() {
  const [id, callback] = [...frames][0];
  frames.delete(id);
  callback(0);
}
function updateStore(update) {
  mockStore.state = { ...mockStore.state, ...update };
  for (const listener of mockStore.listeners) listener();
}
function subscribe(callback) {
  const cleanup = subscribePlaybackFrames(callback);
  cleanups.push(cleanup);
  return cleanup;
}
beforeEach(() => {
  mockStore.state = { currentRoute: { fullname: ROUTE }, offset: 1000, seekRequest: { id: 1, offset: 0 }, desiredPlaySpeed: 0, isBufferingVideo: false };
  cleanups = [];
  frames = new Map();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => {
    frameId += 1;
    frames.set(frameId, callback);
    return frameId;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)));
  mockStore.subscribe.mockClear().mockImplementation(listener => {
    mockStore.listeners.add(listener);
    return () => mockStore.listeners.delete(listener);
  });
});
afterEach(() => {
  detach?.();
  detach = null;
  cleanups.forEach(cleanup => cleanup());
  vi.unstubAllGlobals();
});

describe('shared playback rendering', () => {
  it('shares one frame and store subscription, then stays idle while paused', () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()];
    callbacks.forEach(subscribe);
    expect(mockStore.subscribe).toHaveBeenCalledOnce();
    expect(frames.size).toBe(1);
    nextFrame();
    callbacks.forEach(callback => expect(callback).toHaveBeenCalledOnce());
    expect(frames.size).toBe(0);
    updateStore({ unrelated: true });
    expect(frames.size).toBe(0);
  });

  it('animates while playing and stops after pause or buffering', () => {
    const callback = vi.fn();
    subscribe(callback);
    nextFrame();
    updateStore({ desiredPlaySpeed: 1 });
    nextFrame();
    expect(frames.size).toBe(1);
    nextFrame();
    expect(frames.size).toBe(1);
    updateStore({ isBufferingVideo: true });
    nextFrame();
    expect(frames.size).toBe(0);
    updateStore({ isBufferingVideo: false });
    nextFrame();
    expect(frames.size).toBe(1);
    updateStore({ desiredPlaySpeed: 0 });
    nextFrame();
    expect(frames.size).toBe(0);
    expect(callback).toHaveBeenCalledTimes(6);
  });

  it('refreshes paused seek commands, observations and metadata once per frame', () => {
    const callback = vi.fn();
    subscribe(callback);
    nextFrame();
    updateStore({ seekRequest: { id: 2, offset: 9000 } });
    updateStore({ offset: 9000 });
    updateStore({ currentRoute: { fullname: ROUTE, videoStartOffset: 500 } });
    updateStore({ zoom: { start: 1000, end: 10000 } });
    expect(frames.size).toBe(1);
    nextFrame();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
  });

  it('does not continuously animate without a current route', () => {
    updateStore({ currentRoute: null, desiredPlaySpeed: 1 });
    subscribe(vi.fn());
    nextFrame();
    expect(frames.size).toBe(0);
  });

  it('cancels and unsubscribes when the last view closes without late callbacks', () => {
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = subscribe(first);
    const removeSecond = subscribe(second);
    removeFirst();
    nextFrame();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    updateStore({ desiredPlaySpeed: 1 });
    removeSecond();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(mockStore.listeners.size).toBe(0);
    updateStore({ offset: 2000 });
    expect(frames.size).toBe(0);
  });

  it('does not let an old cleanup detach a new registration of the same callback', () => {
    const callback = vi.fn();
    const removeOld = subscribe(callback);
    removeOld();
    subscribe(callback);
    removeOld();
    nextFrame();
    expect(callback).toHaveBeenCalledOnce();
    expect(mockStore.listeners.size).toBe(1);
  });
});

describe('native playback clock', () => {
  it('reads smooth native media time for the active route', () => {
    let mediaTime = 1234;
    detach = attachPlaybackClock(ROUTE, () => mediaTime);
    expect(currentOffset()).toBe(1234);
    mediaTime = 1250;
    expect(currentOffset()).toBe(1250);
    expect(mockStore.state.offset).toBe(1000);
  });

  it('keeps explicit state reads pure', () => {
    const readOffset = vi.fn(() => 5000);
    detach = attachPlaybackClock(ROUTE, readOffset);
    expect(currentOffset(mockStore.state)).toBe(1000);
    expect(readOffset).not.toHaveBeenCalled();
  });

  it('ignores a clock from a previous route', () => {
    detach = attachPlaybackClock('previous-route', () => 5000);
    expect(currentOffset()).toBe(1000);
  });

  it('uses the observation while the media accessor cannot supply time', () => {
    detach = attachPlaybackClock(ROUTE, () => NaN);
    expect(currentOffset()).toBe(1000);
    detach();
    detach = attachPlaybackClock(ROUTE, () => { throw new Error('source detached'); });
    expect(currentOffset()).toBe(1000);
  });

  it('prevents an old registration cleanup from clearing its replacement', () => {
    const detachOld = attachPlaybackClock(ROUTE, () => 2000);
    detach = attachPlaybackClock(ROUTE, () => 3000);
    detachOld();
    expect(currentOffset()).toBe(3000);
    detach();
    expect(currentOffset()).toBe(1000);
  });

  it('shows the initial range target before the first observed frame', () => {
    expect(currentOffset({ offset: null, seekRequest: { id: 1, offset: 10000 } })).toBe(10000);
    expect(currentOffset({ offset: null, loop: { startTime: 0, duration: 20000 } })).toBe(0);
  });
});

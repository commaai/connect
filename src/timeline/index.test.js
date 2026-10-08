import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachPlayer, currentOffset, playerOffset } from '.';

vi.mock('../store', () => ({
  default: { getState: () => ({ offset: 1000, startTime: Date.now(), desiredPlaySpeed: 1, isBufferingVideo: true, loop: null }) },
}));

const video = (props) => ({ currentTime: 12.5, readyState: 4, ...props });

describe('the playhead', () => {
  let detach = () => {};
  afterEach(() => detach());

  it('is where the video is', () => {
    detach = attachPlayer(video(), () => 3000);
    expect(playerOffset()).toBe(15500);
    expect(currentOffset()).toBe(15500);
  });

  it('asks again how far into the route the video starts', () => {
    let start = 0;
    detach = attachPlayer(video(), () => start);
    expect(currentOffset()).toBe(12500);
    start = 2000;
    expect(currentOffset()).toBe(14500);
  });

  it('stays inside the loop', () => {
    detach = attachPlayer(video({ currentTime: 22 }), () => 0);
    const state = { loop: { startTime: 10000, duration: 5000 } };
    expect(currentOffset({ ...state, offset: 0, startTime: Date.now(), desiredPlaySpeed: 0 })).toBe(10000);
  });

  it('is kept by the state before the video has loaded, and after it is gone', () => {
    detach = attachPlayer(video({ readyState: 0 }), () => 0);
    expect(playerOffset()).toBeNull();
    expect(currentOffset()).toBe(1000); // buffering: the wall clock isn't running

    detach();
    detach = attachPlayer(video(), () => 0);
    expect(currentOffset()).toBe(12500);
    detach();
    expect(currentOffset()).toBe(1000);
  });

  it('is computed from the state it is given, whatever is playing', () => {
    detach = attachPlayer(video(), () => 0);
    const now = Date.now();
    expect(currentOffset({ offset: 2000, startTime: now - 500, desiredPlaySpeed: 2, isBufferingVideo: false })).toBe(3000);
  });

  it('does not unregister a newer video', () => {
    const first = attachPlayer(video({ currentTime: 1 }), () => 0);
    detach = attachPlayer(video({ currentTime: 2 }), () => 0);
    first();
    expect(playerOffset()).toBe(2000);
  });
});

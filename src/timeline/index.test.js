import { currentOffset, playVideo, registerPlaybackClock, setVideoMuted } from '.';

describe('media clock', () => {
  it('uses the observed position without advancing a paused or stalled video', () => {
    const state = { offset: 1200, desiredPlaySpeed: 8, startTime: Date.now() - 10000 };
    expect(currentOffset(state)).toBe(1200);
    let position = 2450;
    const detach = registerPlaybackClock(() => position);
    expect(currentOffset(state)).toBe(2450);
    position = 2480;
    expect(currentOffset(state)).toBe(2480);
    detach();
    expect(currentOffset(state)).toBe(1200);
  });

  it('falls back to the requested position until the active video can report time', () => {
    const detach = registerPlaybackClock(() => undefined);
    expect(currentOffset({ offset: 8000 })).toBe(8000);
    expect(currentOffset({ offset: null, loop: { startTime: 3000 } })).toBe(3000);
    expect(currentOffset({ offset: null })).toBe(0);
    detach();
  });

  it('does not let cleanup from a previous video detach the new clock', () => {
    const detachOld = registerPlaybackClock(() => 1000);
    const detachNew = registerPlaybackClock(() => 2000);
    detachOld();
    expect(currentOffset({ offset: 0 })).toBe(2000);
    detachNew();
  });

  it('clamps the displayed position without wrapping ahead of the actual video', () => {
    const detach = registerPlaybackClock(() => 10050);
    expect(currentOffset({ loop: { startTime: 5000, duration: 5000 } })).toBe(10000);
    detach();
  });

  it('forwards gesture-sensitive controls synchronously and stops after unmount', () => {
    const controls = { play: vi.fn(), setMuted: vi.fn() };
    const detach = registerPlaybackClock(() => 0, controls);
    playVideo(2);
    setVideoMuted(false);
    expect(controls.play).toHaveBeenCalledWith(2);
    expect(controls.setMuted).toHaveBeenCalledWith(false);
    detach();
    playVideo(1);
    setVideoMuted(true);
    expect(controls.play).toHaveBeenCalledTimes(1);
    expect(controls.setMuted).toHaveBeenCalledTimes(1);
  });
});

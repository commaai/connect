import { MediaController } from './media';

class FakeVideo extends EventTarget {
  HAVE_CURRENT_DATA = 2;
  HAVE_FUTURE_DATA = 3;
  currentTime = 0;
  ended = false;
  muted = true;
  paused = true;
  playbackRate = 1;
  readyState = 0;
  seeking = false;
  play = vi.fn(async () => this.fire('play', { paused: false }));
  pause = vi.fn(() => this.fire('pause', { paused: true }));

  fire(type, props) {
    Object.assign(this, props);
    this.dispatchEvent(new Event(type));
  }
}

describe('media controller', () => {
  let controller;
  let element;
  let open;
  let close;

  beforeEach(() => {
    controller = new MediaController();
    element = new FakeVideo();
    close = vi.fn(() => Object.assign(element, { currentTime: 0, paused: true, readyState: 0 }));
    open = vi.fn(() => close);
    controller.setVideoStart(2000);
  });

  it('opens the source at the intent and hands the clock to the element once it can play', () => {
    controller.load(element, 'route', 4000, open);
    expect(open).toHaveBeenCalledWith(2);
    controller.seek(5000);
    controller.play(2);
    expect(element.play).toHaveBeenCalled();
    element.currentTime = 1;
    expect(controller.currentOffset()).toBe(5000);

    element.fire('loadedmetadata', { readyState: 1 });
    expect(element).toMatchObject({ currentTime: 3, playbackRate: 2 });
    element.fire('canplay', { readyState: 3 });
    element.fire('timeupdate', { currentTime: 4.25 });
    expect(controller.getSnapshot()).toMatchObject({ paused: false, playbackRate: 2, routeTime: 6250 });

    controller.seek(12000);
    element.fire('canplay', { currentTime: 10.5 });
    expect(controller.currentOffset()).toBe(12500);
  });

  it('applies the intent again once a source is emptied and reloaded', () => {
    controller.load(element, 'route', 2000, open);
    element.fire('canplay', { readyState: 3 });
    element.fire('timeupdate', { currentTime: 4 });

    element.fire('emptied', { currentTime: 0, paused: true, readyState: 0 });
    element.fire('timeupdate');
    element.fire('canplay', { readyState: 3 });
    expect(element.currentTime).toBe(4);
    expect(element.play).toHaveBeenCalledTimes(2);
  });

  it('keeps one paused clock while failed and reloads where the user seeks', () => {
    controller.load(element, 'route', 2000, open);
    element.fire('canplay', { readyState: 3 });
    element.currentTime = 4;

    controller.fail('not-found');
    expect(close).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ buffering: false, error: 'not-found', paused: true, routeTime: 6000 });
    element.fire('canplay', { readyState: 3 });
    expect(controller.getSnapshot().error).toBe('not-found');

    controller.seek(controller.currentOffset() + 10000);
    expect(open).toHaveBeenLastCalledWith(14);
    expect(controller.getSnapshot()).toMatchObject({ buffering: true, error: null, routeTime: 16000 });
  });

  it('keeps position and audio for a new source of the same route only', () => {
    const unload = controller.load(element, 'route', 2000, open);
    element.fire('canplay', { readyState: 3 });
    element.currentTime = 4;
    controller.setHasAudio(true);

    unload();
    controller.load(element, 'route', 2000, open);
    expect(open).toHaveBeenLastCalledWith(4);
    expect(controller.getSnapshot()).toMatchObject({ hasAudio: true, paused: false });
    controller.load(element, 'other', 9000, open);
    expect(open).toHaveBeenLastCalledWith(7);
    expect(controller.getSnapshot().hasAudio).toBe(false);
  });

  it('reopens a failed source once per load and retries network failures when back online', () => {
    controller.load(element, 'route', 2000, open);
    controller.fail('media');
    expect(open).toHaveBeenCalledTimes(2);
    controller.fail('network');
    expect(controller.getSnapshot().error).toBe('network');

    window.dispatchEvent(new Event('online'));
    expect(open).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().error).toBeNull();

    controller.load(element, 'route', 2000, open);
    controller.fail('expired');
    expect(controller.getSnapshot().error).toBe('expired');
  });

  it('mirrors native play, pause, rate, mute, and buffering state, except that the end is no pause', () => {
    controller.load(element, 'route', 2000, open);
    element.fire('canplay', { readyState: 3 });
    expect(controller.getSnapshot()).toMatchObject({ buffering: false, paused: false, playbackRate: 1 });
    element.fire('pause', { ended: true, paused: true });
    expect(controller.intent.playing).toBe(true);

    element.fire('ratechange', { playbackRate: 4 });
    controller.pause();
    expect(controller.getSnapshot()).toMatchObject({ paused: true, playbackRate: 4 });

    controller.toggleMuted();
    element.fire('seeking', { seeking: true });
    expect(controller.getSnapshot()).toMatchObject({ buffering: true, muted: false });
  });
});

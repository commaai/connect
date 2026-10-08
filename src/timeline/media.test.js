import { createStore, applyMiddleware } from 'redux';
import { createController, bindMedia, mediaMiddleware } from './media';
import { reducer, seek, pause, play } from './playback';

class Video {
  constructor() {
    this.currentTime = 0;
    this.duration = 60;
    this.readyState = 1;
    this.paused = true;
    this.seeking = false;
    this.ended = false;
    this.listeners = new Map();
    this.play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
    this.pause = vi.fn(() => { this.paused = true; this.fire('pause'); });
  }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name, listener) { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
  fire(name) { this.listeners.get(name)?.(); }
}
const setup = () => {
  const video = new Video();
  const callbacks = { onProgress: vi.fn(), onPause: vi.fn(), onStatus: vi.fn() };
  return { video, callbacks, controller: createController(video, callbacks) };
};
const command = (offset, revision = 1) => ({ seekOffset: offset, seekRevision: revision });

describe('native media controller', () => {
  it('applies zero and small explicit seeks with no dead band', () => {
    const { video, controller } = setup();
    controller.update(command(1001));
    expect(video.currentTime).toBe(1.001);
    controller.update(command(1002, 2));
    expect(video.currentTime).toBe(1.002);
    controller.update(command(0, 3));
    expect(video.currentTime).toBe(0);
    video.currentTime = 5;
    controller.update(command(0, 4));
    expect(video.currentTime).toBe(0);
  });

  it('waits for metadata and ignores intermediate slow-seek observations', () => {
    const { video, controller, callbacks } = setup();
    video.readyState = 0;
    controller.update(command(2000));
    expect(video.currentTime).toBe(0);
    video.readyState = 1;
    video.seeking = true;
    video.fire('loadedmetadata');
    expect(video.currentTime).toBe(2);
    video.currentTime = 1;
    video.fire('timeupdate');
    expect(video.currentTime).toBe(1);
    expect(callbacks.onProgress).not.toHaveBeenCalled();
    controller.update(command(3000, 2));
    video.currentTime = 2;
    video.seeking = false;
    video.fire('seeked');
    expect(callbacks.onProgress).not.toHaveBeenCalled();
    video.currentTime = 3;
    video.fire('seeked');
    expect(callbacks.onProgress).toHaveBeenLastCalledWith(3000, 2);
  });

  it('does not re-seek on observations or speed changes', async () => {
    const { video, controller, callbacks } = setup();
    controller.update({ ...command(1000), speed: 1 });
    await Promise.resolve();
    video.currentTime = 2;
    video.fire('timeupdate');
    controller.update({ ...command(1000), speed: 2 });
    expect(video.currentTime).toBe(2);
    expect(video.playbackRate).toBe(2);
    expect(callbacks.onProgress).toHaveBeenLastCalledWith(2000, 1);
  });

  it('clamps commands to the selected range and media duration', () => {
    const { video, controller } = setup();
    controller.update({ range: { start: 1000, end: 10000 }, ...command(0) });
    expect(video.currentTime).toBe(1);
    controller.update(command(20000, 2));
    expect(video.currentTime).toBe(10);
    controller.update({ range: null, ...command(100000, 3) });
    expect(video.currentTime).toBe(60);
  });

  it('loops at zero and restarts ended playback without changing speed', async () => {
    const { video, controller } = setup();
    controller.update({ range: { start: 0, end: 1000 }, speed: 2, ...command(0) });
    await Promise.resolve();
    video.currentTime = 1.2;
    video.fire('timeupdate');
    expect(video.currentTime).toBeCloseTo(0.2);
    video.currentTime = 1;
    video.paused = true;
    video.ended = true;
    video.fire('ended');
    expect(video.currentTime).toBe(0);
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(video.playbackRate).toBe(2);
  });

  it('honors external pause but does not report its own pause as external', async () => {
    const { video, controller, callbacks } = setup();
    controller.update({ speed: 1 });
    await Promise.resolve();
    video.paused = true;
    video.fire('pause');
    expect(callbacks.onPause).toHaveBeenCalledOnce();
    controller.update({ speed: 0 });
    expect(video.play).toHaveBeenCalledOnce();
  });

  it('passes buffering and errors through without recovery', () => {
    const { video, callbacks } = setup();
    video.fire('waiting');
    expect(callbacks.onStatus).toHaveBeenLastCalledWith({ buffering: true });
    video.fire('playing');
    expect(callbacks.onStatus).toHaveBeenLastCalledWith({ buffering: false });
    video.error = { code: 3 };
    video.fire('error');
    expect(callbacks.onStatus).toHaveBeenLastCalledWith({ error: video.error });
  });

  it('reports blocked play and ignores late rejection after dispose', async () => {
    const first = setup();
    first.video.play.mockRejectedValue({ name: 'NotAllowedError' });
    first.controller.update({ speed: 1 });
    await Promise.resolve();
    expect(first.callbacks.onStatus).toHaveBeenCalledWith({ blocked: true, error: { name: 'NotAllowedError' } });
    const second = setup();
    let reject;
    second.video.play.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    second.controller.update({ speed: 1 });
    const oldHandler = second.video.listeners.get('error');
    second.controller.dispose();
    oldHandler();
    reject({ name: 'NotAllowedError' });
    await Promise.resolve();
    expect(second.callbacks.onStatus).not.toHaveBeenCalled();
    expect(second.video.listeners.size).toBe(0);
  });

  it('maps media seconds to route milliseconds exactly once', () => {
    const { video, controller, callbacks } = setup();
    controller.update({ videoStartOffset: 500, ...command(1500) });
    expect(video.currentTime).toBe(1);
    expect(callbacks.onProgress).toHaveBeenLastCalledWith(1500, 1);
    controller.update({ toMedia: (ms) => (ms - 60000) / 1000,
      toRoute: (seconds) => seconds * 1000 + 60000, ...command(61000, 2) });
    expect(video.currentTime).toBe(1);
    expect(callbacks.onProgress).toHaveBeenLastCalledWith(61000, 2);
  });
});

it('sends transport commands synchronously per store and protects newer bindings', () => {
  const store = createStore(reducer, { offset: 0, seekRevision: 0, desiredPlaySpeed: 0 }, applyMiddleware(mediaMiddleware));
  const first = { update: vi.fn() };
  const second = { update: vi.fn() };
  const unbindFirst = store.dispatch(bindMedia(first));
  store.dispatch(play(2));
  expect(first.update).toHaveBeenLastCalledWith(expect.objectContaining({ speed: 2 }));
  store.dispatch(bindMedia(second));
  unbindFirst();
  store.dispatch(seek(1));
  expect(second.update).toHaveBeenLastCalledWith(expect.objectContaining({ seekOffset: 1, seekRevision: 1 }));
  store.dispatch(pause());
  expect(second.update).toHaveBeenLastCalledWith(expect.objectContaining({ speed: 0 }));
});

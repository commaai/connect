// The playback controller is tested against a real store and a simulated
// video element: element events drive the store, and user intent calls
// (play, pause, seek, setSpeed, applyLoop) drive the element.

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
    this.duration = 60; // seconds
    this.paused = true;
    this.readyState = 1; // HAVE_METADATA, so seeks write currentTime directly
    this._playbackRate = 1;
  }

  set playbackRate(rate) {
    // real elements fire ratechange when the rate changes
    if (rate !== this._playbackRate) {
      this._playbackRate = rate;
      this.dispatchEvent(new Event('ratechange'));
    }
  }

  get playbackRate() {
    return this._playbackRate;
  }

  play() {
    if (this.paused) {
      this.paused = false;
      this.dispatchEvent(new Event('play'));
    }
    return Promise.resolve();
  }

  pause() {
    if (!this.paused) {
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
  }

  emit(name) {
    this.dispatchEvent(new Event(name));
  }

  // advance the element to a position and report it, as a playing element does
  tick(seconds) {
    this.currentTime = seconds;
    this.emit('timeupdate');
  }
}

// each test gets a fresh controller and a fresh store, since the controller
// reads its loop, route, and playback state from the store it is tied to
async function createPlayback() {
  vi.resetModules();
  const { default: store } = await import('../store'); // registers itself with the controller
  const playback = await import('./playback');
  return { playback, store };
}

describe('playback', () => {
  it('has playback controls', async () => {
    const { playback, store } = await createPlayback();
    const video = new FakeVideo();
    playback.attachVideo(video);

    expect(store.getState().playback).toMatchObject({ speed: 1, playing: false, buffering: true });

    playback.applyLoop(10_000, 20_000);
    expect(store.getState().loop).toEqual({ startTime: 10_000, duration: 10_000 });
    expect(video.currentTime).toBe(10);
    expect(store.getState().playback.playing).toBe(true);
    expect(video.paused).toBe(false);

    playback.pause();
    expect(store.getState().playback.playing).toBe(false);
    expect(video.paused).toBe(true);

    playback.play();
    expect(store.getState().playback.playing).toBe(true);

    playback.setSpeed(2);
    expect(store.getState().playback.speed).toBe(2);
    expect(video.playbackRate).toBe(2);
  });

  it('clamps seeks to the loop', async () => {
    const { playback } = await createPlayback();
    const video = new FakeVideo();
    playback.attachVideo(video);

    playback.applyLoop(10_000, 20_000);
    playback.pause();
    playback.seek(50_000);
    expect(video.currentTime).toBe(20);
    // paused at the loop end, the playhead reads the end, not the wrapped start
    expect(Math.round(playback.getPlayheadMs())).toBe(20_000);
    playback.seek(0);
    expect(video.currentTime).toBe(10);
  });

  it('interpolates the playhead between element timeupdates', async () => {
    const { playback, store } = await createPlayback();
    const video = new FakeVideo();
    playback.attachVideo(video);

    let clock = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

    playback.applyLoop(0, 60_000);
    video.emit('playing'); // playback has started; the spinner clears
    video.tick(5);
    clock = 100;
    expect(playback.getPlayheadMs()).toBe(5_100);
    video.tick(5.2);
    clock = 200;
    expect(playback.getPlayheadMs()).toBe(5_300);

    // buffering freezes the playhead with the element
    video.emit('waiting');
    expect(store.getState().playback.buffering).toBe(true);
    clock = 300;
    expect(playback.getPlayheadMs()).toBe(5_300);

    video.emit('playing');
    expect(store.getState().playback.buffering).toBe(false);
    video.tick(5.5);
    clock = 400;
    expect(playback.getPlayheadMs()).toBe(5_600);

    // pausing freezes the playhead as well
    playback.pause();
    clock = 500;
    expect(playback.getPlayheadMs()).toBe(5_500);

    nowSpy.mockRestore();
  });

  it('wraps the element at the loop end', async () => {
    const { playback } = await createPlayback();
    const video = new FakeVideo();
    playback.attachVideo(video);

    playback.applyLoop(0, 2_000);
    video.tick(2.5);
    expect(video.currentTime).toBe(0);
    expect(playback.getPlayheadMs()).toBeLessThan(2_000);
  });

  it('wraps the element when it ends inside a loop', async () => {
    const { playback } = await createPlayback();
    const video = new FakeVideo();
    playback.attachVideo(video);

    playback.applyLoop(0, 60_000);
    video.currentTime = 60;
    video.emit('ended');
    expect(video.currentTime).toBe(0);
    expect(video.paused).toBe(false);
  });

  it('keeps advancing without an element, as the map-only view does', async () => {
    const { playback, store } = await createPlayback();
    const video = new FakeVideo();
    playback.attachVideo(video);

    let clock = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

    playback.applyLoop(0, 60_000);
    video.tick(5);
    video.emit('playing'); // clears the initial buffering state
    playback.detachVideo();
    expect(store.getState().playback.buffering).toBe(false);

    clock = 100;
    expect(playback.getPlayheadMs()).toBe(5_100);

    playback.setSpeed(2);
    clock = 200;
    expect(playback.getPlayheadMs()).toBe(5_300);

    playback.pause();
    clock = 300;
    expect(playback.getPlayheadMs()).toBe(5_300);

    nowSpy.mockRestore();
  });

  it('maps the video start offset into the route timeline', async () => {
    const { playback, store } = await createPlayback();
    const { ACTION_ROUTES_METADATA, TIMELINE_PUSH_SELECTION } = await import('../actions/types');
    const video = new FakeVideo();
    playback.attachVideo(video);

    // the stream starts at the first road camera frame, 2s into the route
    const route = {
      fullname: 'dongle|log', log_id: 'log', duration: 60_000,
      start_time_utc_millis: 0, end_time_utc_millis: 60_000, videoStartOffset: 2_000,
    };
    store.dispatch({ type: ACTION_ROUTES_METADATA, dongleId: 'dongle', start: 0, end: 60_000, routes: [route] });
    store.dispatch({ type: TIMELINE_PUSH_SELECTION, log_id: 'log', start: 0, end: 60_000 });

    playback.applyLoop(0, 60_000);
    expect(video.currentTime).toBe(0);
    video.tick(1);
    expect(playback.getPlayheadMs()).toBe(3_000);

    // a loop covering the route start begins at the first frame
    video.tick(58);
    expect(video.currentTime).toBe(0);
  });

  it('stops playback when the element errors', async () => {
    const { playback, store } = await createPlayback();
    const video = new FakeVideo();
    playback.attachVideo(video);

    playback.applyLoop(0, 60_000);
    video.tick(5);
    video.emit('error');

    expect(store.getState().playback.playing).toBe(false);
    expect(store.getState().playback.buffering).toBe(false);
    expect(playback.getPlayheadMs()).toBe(5_000);
  });

  it('reports the playhead from the loop or zoom before anything plays', async () => {
    const { playback, store } = await createPlayback();
    const { TIMELINE_PUSH_SELECTION } = await import('../actions/types');

    store.dispatch({ type: TIMELINE_PUSH_SELECTION, log_id: 'log', start: 10_000, end: 20_000 });
    expect(playback.getPlayheadMs()).toBe(10_000);

    store.dispatch({ type: TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
    expect(playback.getPlayheadMs()).toBe(0);
  });
});

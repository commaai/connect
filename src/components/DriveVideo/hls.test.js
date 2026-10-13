import { attachHlsSource, attachNativeSource } from './hls';

const { instances } = vi.hoisted(() => ({ instances: [] }));

vi.mock('hls.js/light', () => ({
  default: class {
    static Events = { BUFFER_CODECS: 'codecs', ERROR: 'error' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError' };
    static isSupported = () => true;
    handlers = {};
    startLoad = vi.fn();
    stopLoad = vi.fn();
    destroy = vi.fn();
    constructor(config) {
      this.config = config;
      instances.push(this);
    }
    on(event, handler) { this.handlers[event] = handler; }
    emit(event, data) { this.handlers[event](event, data); }
    loadSource() {}
    attachMedia() {}
  },
}));

const frag = { sn: 2, start: 120, end: 180 };
const missing = { type: 'networkError', fatal: false, frag, response: { code: 404 } };
const ranges = (...spans) => ({ length: spans.length, start: (i) => spans[i][0], end: (i) => spans[i][1] });

describe('hls.js source', () => {
  let video;
  let onError;
  let detach;

  async function attach(startTime = 0) {
    instances.length = 0;
    onError = vi.fn();
    detach = attachHlsSource(video, 'qcamera.m3u8', { startTime, onAudio: vi.fn(), onError });
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    return instances[0];
  }

  function at(currentTime, event) {
    video.currentTime = currentTime;
    video.dispatchEvent(new Event(event));
    return Promise.resolve();
  }

  beforeEach(() => {
    video = Object.assign(new EventTarget(), { buffered: ranges(), currentTime: 90, readyState: 4 });
  });

  it('stops at a missing segment and reports it once playback reaches it', async () => {
    const hls = await attach(90);
    expect(hls.config.startPosition).toBe(90);
    hls.emit('error', missing);
    expect(hls.stopLoad).toHaveBeenCalled();
    video.buffered = ranges([60, 120]);
    await at(119, 'waiting');
    expect(onError).not.toHaveBeenCalled();

    await at(119.6, 'waiting');
    expect(onError).toHaveBeenCalledWith('not-found');
  });

  it('loads again once the playhead needs data elsewhere', async () => {
    const hls = await attach();
    hls.emit('error', missing);
    video.buffered = ranges([60, 120]);
    await at(90, 'seeking');
    expect(hls.startLoad).not.toHaveBeenCalled();

    await at(200, 'seeking');
    expect(hls.startLoad).toHaveBeenCalledWith(200, true);

    await at(150, 'seeking');
    expect(hls.startLoad).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    hls.emit('error', missing);
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('not-found');
  });

  it('leaves retries of other failures to hls.js and reports them once fatal at the playhead', async () => {
    let hls = await attach();
    const failed = { ...missing, response: { code: 500 } };
    hls.emit('error', failed);
    await at(150, 'waiting');
    expect(hls.stopLoad).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    hls.emit('error', { ...failed, fatal: true });
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('network');

    hls = await attach();
    hls.emit('error', { type: 'mediaError', fatal: true, frag });
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('media');
  });

  it('reports anything unavailable before media loads', async () => {
    video.readyState = 0;
    const hls = await attach(300);
    hls.emit('error', { ...missing, response: { code: 403 } });
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('expired');
  });

  it('stops reporting once detached', async () => {
    const hls = await attach();
    hls.emit('error', missing);
    detach();
    await at(150, 'waiting');
    hls.emit('error', { type: 'networkError', fatal: true });
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
    expect(hls.destroy).toHaveBeenCalled();
  });

  it('plays natively on iOS with an explicit load', () => {
    const audioTracks = new EventTarget();
    const load = vi.fn();
    const removeAttribute = vi.fn();
    vi.stubGlobal('MediaError', { MEDIA_ERR_NETWORK: 2 });
    video = Object.assign(new EventTarget(), { audioTracks, load, removeAttribute, error: { code: 2 } });
    const onAudio = vi.fn();
    onError = vi.fn();
    detach = attachNativeSource(video, 'qcamera.m3u8', { onAudio, onError });
    expect(video.src).toBe('qcamera.m3u8');
    expect(load).toHaveBeenCalledOnce();

    audioTracks.dispatchEvent(new Event('addtrack'));
    video.dispatchEvent(new Event('error'));
    expect(onAudio).toHaveBeenCalledWith(true);
    expect(onError).toHaveBeenCalledWith('network');

    detach();
    expect(removeAttribute).toHaveBeenCalledWith('src');
    vi.unstubAllGlobals();
  });
});

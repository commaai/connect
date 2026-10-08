import { vi } from 'vitest';

import * as player from '../../timeline/player';
import { loadStream } from '.';

vi.mock('../../utils/browser.js', () => ({ isIos: () => true }));
vi.mock('../../timeline/player', () => ({ getVideoTime: vi.fn(() => 0), setSegments: vi.fn(), releaseSource: vi.fn() }));

const PLAYLIST = '#EXTM3U\n#EXTINF:60.0,0\nhttps://example.com/0.ts\n#EXTINF:60.0,2\nhttps://example.com/2.ts\n';

// a video element with the audio track list Safari has for native HLS
function nativeVideo() {
  const video = document.createElement('video');
  const audioTracks = Object.assign(new EventTarget(), { length: 0 });
  Object.defineProperty(video, 'audioTracks', { value: audioTracks });
  return video;
}

describe('loadStream with native HLS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PLAYLIST)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports audio once Safari adds the audio track', () => {
    const video = nativeVideo();
    const onAudio = vi.fn();
    const cleanup = loadStream(video, 'https://example.com/qcamera.m3u8', { onError: vi.fn(), onAudio });
    expect(video.src).toEqual('https://example.com/qcamera.m3u8');

    video.audioTracks.dispatchEvent(new Event('addtrack'));
    expect(onAudio).toHaveBeenCalledWith(true);

    cleanup();
    onAudio.mockClear();
    video.audioTracks.dispatchEvent(new Event('addtrack'));
    expect(onAudio).not.toHaveBeenCalled();
  });

  it('gives the player the segments in the playlist', async () => {
    loadStream(nativeVideo(), 'https://example.com/qcamera.m3u8', { onError: vi.fn(), onAudio: vi.fn() });
    expect(player.setSegments).toHaveBeenCalledWith(null);

    await vi.waitFor(() => expect(player.setSegments).toHaveBeenLastCalledWith([
      { segment: 0, start: 0, duration: 60 },
      { segment: 2, start: 60, duration: 60 },
    ]));
  });
});

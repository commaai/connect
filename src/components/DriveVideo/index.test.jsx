import React from 'react';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import DriveVideo from '.';
import { pushTimelineRange } from '../../actions';
import { createInitialState } from '../../initialState';
import { createAppStore } from '../../store';

const hls = vi.hoisted(() => ({ instances: [] }));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported() { return true; }
    static Events = { BUFFER_CODECS: 'hlsBufferCodecs', ERROR: 'hlsError' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError' };
    listeners = {};
    loadSource = vi.fn();
    attachMedia = vi.fn();
    stopLoad = vi.fn();
    destroy = vi.fn();
    constructor() { hls.instances.push(this); }
    on(event, listener) { this.listeners[event] = listener; }
    emit(event, data) { act(() => this.listeners[event](event, data)); }
  },
}));

const makeRoute = (logId) => ({ fullname: `dongle|${logId}`, log_id: logId, duration: 120000, segment_numbers: [0, 1] });

function renderVideo() {
  const store = createAppStore(createMemoryHistory(), {
    ...createInitialState('/dongle'), dongleId: 'dongle', routes: [makeRoute('slow'), makeRoute('log')],
  });
  store.dispatch(pushTimelineRange('log', null, null, false));
  render(<Provider store={store}><DriveVideo isMuted onAudioStatusChange={vi.fn()} /></Provider>);
  return store;
}

describe('drive video with hls.js', () => {
  beforeEach(() => {
    hls.instances = [];
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => (url.includes('|slow/')
      ? new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      : Promise.resolve(new Response('#EXTM3U\n#EXTINF:60,0\nhttps://commadata2.blob.core.windows.net/0/qcamera.ts\n#EXT-X-ENDLIST\n')))));
  });

  it.each([
    ['network', { type: 'networkError' }, 'Unable to load video. Check your connection.'],
    ['missing segment', { type: 'networkError', response: { code: 404 } }, 'This drive\'s video hasn\'t been uploaded yet or was deleted.'],
    ['decoding', { type: 'mediaError' }, 'Unable to play this video.'],
  ])('stops the video on a fatal %s error, says why and reloads on Retry', async (_name, error, message) => {
    renderVideo();
    await waitFor(() => expect(hls.instances).toHaveLength(1));
    hls.instances[0].emit('hlsError', { ...error, fatal: true });
    expect(await screen.findByText(message)).toBeVisible();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(hls.instances[0].stopLoad).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('notes a segment that the playlist leaves out', async () => {
    renderVideo();
    expect(await screen.findByText('No video for segment 1')).toBeVisible();
  });

  it('drops a load that a new drive replaced', async () => {
    const store = renderVideo();
    await waitFor(() => expect(hls.instances).toHaveLength(1));
    act(() => store.dispatch(pushTimelineRange('slow', null, null, false)));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => store.dispatch(pushTimelineRange('log', null, null, false)));
    await waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(hls.instances[1].loadSource).toHaveBeenCalledWith(expect.stringContaining('dongle|log/qcamera.m3u8'));
    expect(store.getState().playback).toEqual({ status: 'loading', rate: 1, error: null });
  });
});

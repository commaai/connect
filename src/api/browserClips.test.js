/* eslint-env jest */

const ffmpegMock = {
  deleteFile: jest.fn(() => Promise.resolve()),
  exec: jest.fn(() => Promise.resolve(0)),
  load: jest.fn(() => Promise.resolve()),
  off: jest.fn(),
  on: jest.fn(),
  readFile: jest.fn(() => Promise.resolve(new Uint8Array([7, 8, 9]))),
  writeFile: jest.fn(() => Promise.resolve()),
};

jest.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: jest.fn(() => ffmpegMock) }));
jest.mock('@ffmpeg/core?url', () => 'ffmpeg-core.js', { virtual: true });
jest.mock('@ffmpeg/core/wasm?url', () => 'ffmpeg-core.wasm', { virtual: true });

import { browserClipAvailability, createBrowserClip } from './browserClips';

const route = {
  fullname: 'dongle|2026-01-01--00-00-00',
  start_time_utc_millis: 100000,
  segment_numbers: [0, 1, 3],
  segment_start_times: [100000, 160000, 280000],
  segment_end_times: [160000, 220000, 340000],
};

function filesFor(...segments) {
  return Object.fromEntries(segments.map(segment => [`${route.fullname}--${segment}/qcameras`, { url: `https://qcam/${segment}` }]));
}

describe('browser qcamera clips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.crypto = { randomUUID: jest.fn(() => 'id') };
  });

  it('requires every qcamera segment intersecting the selected range', () => {
    expect(browserClipAvailability(route, filesFor(0, 1), 10, 120)).toBe(true);
    expect(browserClipAvailability(route, filesFor(0), 10, 120)).toBe(false);
    expect(browserClipAvailability(route, filesFor(1), 60, 120)).toBe(true);
    expect(browserClipAvailability(route, filesFor(0), 60, 120)).toBe(false);
    expect(browserClipAvailability(route, filesFor(0, 1, 3), 120, 180)).toBe(false);
  });

  it('downloads in parallel, concatenates in route order, and preserves clip parameters', async () => {
    const downloaded = {
      'https://qcam/0': new Uint8Array([1, 2]),
      'https://qcam/1': new Uint8Array([3, 4]),
    };
    global.fetch = jest.fn(url => Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(downloaded[url].buffer),
    }));

    const blob = await createBrowserClip({
      route, files: filesFor(0, 1), startTime: 30, endTime: 90, bitrate: 8, speedup: 4,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect([...ffmpegMock.writeFile.mock.calls[0][1]]).toEqual([1, 2, 3, 4]);
    expect(ffmpegMock.exec).toHaveBeenCalledWith(expect.arrayContaining([
      '-ss', '30', '-t', '60', '-vf', 'setpts=PTS/4', '-b:v', '8M', '-preset', 'ultrafast',
    ]));
    expect(blob.type).toBe('video/mp4');
    expect(ffmpegMock.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('cleans up temporary files when transcoding fails', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer) }));
    ffmpegMock.exec.mockResolvedValueOnce(1);

    await expect(createBrowserClip({
      route, files: filesFor(0), startTime: 0, endTime: 30, bitrate: 5, speedup: 1,
    })).rejects.toThrow('Browser transcoding failed');
    expect(ffmpegMock.off).toHaveBeenCalled();
    expect(ffmpegMock.deleteFile).toHaveBeenCalledTimes(2);
  });
});

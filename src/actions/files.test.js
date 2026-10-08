import { afterEach, describe, expect, it, vi } from 'vitest';

import { athena as Athena } from '../api';
import * as Types from './types';
import { cancelFetchUploadQueue, fetchUploadQueue } from './files';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: { routes: { getRouteFiles: vi.fn() } } }));
vi.mock('../timeline/playback', () => ({ reducer: (state) => state, resetPlayback: vi.fn(), selectLoop: vi.fn() }));

const DEVICE_A = 'aaaaaaaaaaaaaaaa';
const DEVICE_B = 'bbbbbbbbbbbbbbbb';

afterEach(() => {
  cancelFetchUploadQueue();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('upload queue polling', () => {
  it('allows a new poll after an empty response', async () => {
    Athena.postJsonRpcPayload.mockResolvedValue({ result: [] });
    const state = {
      device: { dongle_id: DEVICE_A, shared: false },
      devices: [{ dongle_id: DEVICE_A, shared: false }],
      dongleId: DEVICE_A,
      filesUploading: {},
    };
    const dispatch = vi.fn();
    const getState = () => state;

    await fetchUploadQueue(DEVICE_A)(dispatch, getState);
    await fetchUploadQueue(DEVICE_A)(dispatch, getState);

    expect(Athena.postJsonRpcPayload).toHaveBeenCalledTimes(2);
  });

  it('ignores a delayed prior-device result and does not restart its poll', async () => {
    vi.useFakeTimers();
    let resolveA;
    let resolveB;
    let requestsA = 0;
    Athena.postJsonRpcPayload.mockImplementation((dongleId, payload) => {
      if (payload.method !== 'listUploadQueue') return Promise.resolve({ result: {} });
      if (dongleId === DEVICE_A && requestsA === 0) {
        requestsA += 1;
        return new Promise((resolve) => { resolveA = resolve; });
      }
      if (dongleId === DEVICE_B) return new Promise((resolve) => { resolveB = resolve; });
      return Promise.resolve({ result: [] });
    });

    const state = {
      device: { dongle_id: DEVICE_B, shared: false },
      devices: [{ dongle_id: DEVICE_A, shared: false }, { dongle_id: DEVICE_B, shared: false }],
      dongleId: DEVICE_B,
      filesUploading: {},
    };
    const dispatch = vi.fn();
    const getState = () => state;
    const requestA = fetchUploadQueue(DEVICE_A)(dispatch, getState);
    await Promise.resolve();
    cancelFetchUploadQueue();
    const requestB = fetchUploadQueue(DEVICE_B)(dispatch, getState);
    await Promise.resolve();

    resolveA({ result: [{
      id: 'old-upload', url: `https://files.example/${DEVICE_A}/2026-08-06--12-00-00/0/fcamera.hevc`,
      current: true, progress: 0.5, allow_cellular: true, created_at: 1,
    }] });
    await requestA;
    await vi.advanceTimersByTimeAsync(2000);

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_FILES_UPLOADING, dongleId: DEVICE_A,
    }));
    expect(Athena.postJsonRpcPayload.mock.calls.filter(([id, payload]) => (
      id === DEVICE_A && payload.method === 'listUploadQueue'
    ))).toHaveLength(1);

    resolveB({ result: [] });
    await requestB;
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_FILES_UPLOADING, dongleId: DEVICE_B,
    }));
  });
});

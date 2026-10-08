import { vi } from 'vitest';

import { athena as Athena } from '../api';
import { cancelFetchUploadQueue, fetchUploadQueue } from './files';
import { ACTION_FILES_UPLOADING } from './types';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: {} }));
vi.mock('./index', () => ({
  fetchDeviceNetworkStatus: (dongleId) => ({ type: 'fetchDeviceNetworkStatus', dongleId }),
  updateDeviceOnline: (dongleId) => ({ type: 'updateDeviceOnline', dongleId }),
}));

const A = '0000aaaa0000aaaa';
const B = '1111bbbb1111bbbb';

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function queue(dongleId) {
  const url = `https://commadata2.blob.core.windows.net/commadata2/${dongleId}/2026-08-06--12-00-00/0/qcamera.ts?sig=1`;
  return { result: [{ id: 'upload', url, current: true, progress: 0.5, created_at: 0 }] };
}

describe('fetchUploadQueue', () => {
  beforeEach(() => {
    Athena.postJsonRpcPayload.mockReset();
  });

  afterEach(() => {
    cancelFetchUploadQueue();
    vi.useRealTimers();
  });

  it('drops a response that arrives after its polling was cancelled', async () => {
    vi.useFakeTimers();
    const a = deferred();
    const b = deferred();
    Athena.postJsonRpcPayload
      .mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValue(new Promise(() => {}));
    const getState = () => ({ dongleId: B, device: null, devices: [], filesUploading: {} });
    const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));

    const pollingA = fetchUploadQueue(A)(dispatch, getState);
    cancelFetchUploadQueue();
    const pollingB = fetchUploadQueue(B)(dispatch, getState);
    a.resolve(queue(A));
    b.resolve(queue(B));
    await Promise.all([pollingA, pollingB]);
    await vi.advanceTimersByTimeAsync(2000);

    expect(Athena.postJsonRpcPayload.mock.calls.map(([dongleId]) => dongleId)).toEqual([A, B, B]);
    const uploading = dispatch.mock.calls.filter(([action]) => action.type === ACTION_FILES_UPLOADING);
    expect(uploading.map(([action]) => action.dongleId)).toEqual([B]);
  });

  it('does not let an empty queue block the next call', async () => {
    Athena.postJsonRpcPayload.mockResolvedValueOnce({ result: [] }).mockResolvedValueOnce(queue(A));
    const getState = () => ({ dongleId: A, device: null, devices: [], filesUploading: {} });
    const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));

    await fetchUploadQueue(A)(dispatch, getState);
    await fetchUploadQueue(A)(dispatch, getState);

    expect(Athena.postJsonRpcPayload).toHaveBeenCalledTimes(2);
    const uploading = dispatch.mock.calls.filter(([action]) => action.type === ACTION_FILES_UPLOADING);
    expect(Object.keys(uploading.at(-1)[0].uploading)).toEqual(['upload']);
  });
});

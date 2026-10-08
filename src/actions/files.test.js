import { vi } from 'vitest';
import { athena } from '../api';
import { cancelFetchUploadQueue, fetchUploadQueue } from './files';
import { ACTION_FILES_UPLOADING } from './types';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: { routes: { getRouteFiles: vi.fn() } } }));
vi.mock('.', () => ({
  updateDeviceOnline: (dongleId, online) => ({ type: 'ONLINE', dongleId, online }),
  fetchDeviceNetworkStatus: (dongleId) => ({ type: 'NETWORK', dongleId }),
}));
vi.mock('../utils', () => ({
  deviceOnCellular: () => false,
  getDeviceFromState: () => ({}),
  deviceVersionAtLeast: () => true,
  asyncSleep: () => Promise.resolve(),
}));

const A = '0000aaaa0000aaaa';
const B = '1111bbbb1111bbbb';
const entry = (dongleId, id = 'upload') => ({
  id,
  url: `https://uploads.example/${dongleId}/0000010a--a51155e496/0/qcamera.ts`,
  current: false,
  progress: 0,
  created_at: 1,
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function harness(initial = {}) {
  let state = { filesUploading: {}, filesUploadingMeta: {}, ...initial };
  const actions = [];
  const getState = () => state;
  const dispatch = (action) => {
    if (typeof action === 'function') return action(dispatch, getState);
    actions.push(action);
    if (action.type === ACTION_FILES_UPLOADING) {
      state = { ...state, filesUploading: action.uploading, filesUploadingMeta: { dongleId: action.dongleId } };
    }
    return action;
  };
  return { dispatch, getState, actions };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  cancelFetchUploadQueue();
});
afterEach(() => {
  cancelFetchUploadQueue();
  vi.useRealTimers();
});

describe('upload queue dialog lifetime', () => {
  it('starts the new target immediately and ignores a late previous-target reply', async () => {
    const oldReply = deferred();
    athena.postJsonRpcPayload.mockImplementation((dongleId) => (dongleId === A
      ? oldReply.promise : Promise.resolve({ result: [entry(B)] })));
    const store = harness();
    const oldFetch = store.dispatch(fetchUploadQueue(A));
    await store.dispatch(fetchUploadQueue(B));
    oldReply.resolve({ result: [entry(A)] });
    await oldFetch;

    expect(athena.postJsonRpcPayload.mock.calls.map(([id]) => id)).toEqual([A, B]);
    expect(store.actions.filter((action) => action.type === ACTION_FILES_UPLOADING).map((action) => action.dongleId)).toEqual([B]);
    expect(store.getState().filesUploadingMeta.dongleId).toBe(B);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(athena.postJsonRpcPayload.mock.calls.map(([id]) => id)).toEqual([A, B, B]);
  });

  it('closing during an in-flight request prevents updates and polling resurrection', async () => {
    const reply = deferred();
    athena.postJsonRpcPayload.mockReturnValue(reply.promise);
    const store = harness();
    const fetch = store.dispatch(fetchUploadQueue(A));
    cancelFetchUploadQueue();
    reply.resolve({ result: [entry(A)] });
    await fetch;
    expect(store.actions.filter((action) => action.type === ACTION_FILES_UPLOADING)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves prior Redux objects unchanged while reconciling the current queue', async () => {
    const existing = Object.freeze({ upload: Object.freeze({ fileName: `${A}|0000010a--a51155e496--0/qcameras` }) });
    athena.postJsonRpcPayload.mockResolvedValue({ result: [entry(A)] });
    const store = harness({ filesUploading: existing, filesUploadingMeta: { dongleId: A } });
    await store.dispatch(fetchUploadQueue(A));
    expect(Object.keys(existing)).toEqual(['upload']);
    expect(Object.keys(store.getState().filesUploading)).toEqual(['upload']);
  });

  it('releases an empty or invalid response so reopening can fetch again', async () => {
    athena.postJsonRpcPayload.mockResolvedValueOnce({ result: [] }).mockResolvedValueOnce({ result: {} }).mockResolvedValueOnce({ result: [] });
    const store = harness();
    await store.dispatch(fetchUploadQueue(A));
    await store.dispatch(fetchUploadQueue(A));
    await store.dispatch(fetchUploadQueue(A));
    expect(athena.postJsonRpcPayload).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});

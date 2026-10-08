import { vi } from 'vitest';
import { athena as Athena } from '../api';
import { api } from '../api/backend';
import { fetchFiles, fetchAthenaQueue, fetchUploadQueue, cancelFetchUploadQueue } from './files';
import * as Types from './types';

vi.mock('../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: {
  routes: { getRouteFiles: vi.fn() }, devices: { getAthenaQueue: vi.fn() },
} }));
vi.mock('./index', () => ({
  updateDeviceOnline: (dongleId, ping) => ({ type: 'ONLINE', dongleId, ping }),
  fetchDeviceNetworkStatus: (dongleId) => ({ type: 'NETWORK', dongleId }),
}));
vi.mock('../utils', () => ({
  deviceOnCellular: () => false, getDeviceFromState: () => ({}), deviceVersionAtLeast: () => true,
  asyncSleep: async () => {},
}));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbb';
const LOG = '0000010a--a51155e496';
const ROUTE = `${DONGLE}|${LOG}`;
const asset = (dongleId = DONGLE, segment = 0) => `https://assets.example/${dongleId}/${LOG}/${segment}/fcamera.hevc?sig=abc%2Fdef`;

function setup() {
  let state = { dongleId: DONGLE, filesUploading: {}, filesUploadingMeta: { dongleId: DONGLE } };
  const actions = [];
  const getState = () => state;
  const dispatch = (action) => {
    if (typeof action === 'function') return action(dispatch, getState);
    actions.push(action);
    return action;
  };
  return { actions, dispatch, setState: (next) => { state = { ...state, ...next }; } };
}

beforeEach(() => { vi.clearAllMocks(); cancelFetchUploadQueue(); });
afterEach(() => { cancelFetchUploadQueue(); vi.useRealTimers(); });

describe('file URL mapping', () => {
  it('maps a signed asset by its pathname segment and keeps its original URL', async () => {
    const url = `${asset(DONGLE, 12)}&next=/999/ignored`;
    api.routes.getRouteFiles.mockResolvedValue({ cameras: [url] });
    const { actions, dispatch } = setup();
    const result = await dispatch(fetchFiles(ROUTE, true));
    expect(api.routes.getRouteFiles).toHaveBeenCalledWith(ROUTE, true);
    expect(result).toEqual({ urls: { [`${ROUTE}--12/cameras`]: { url } } });
    expect(actions).toEqual([{ type: Types.ACTION_FILES_URLS, dongleId: DONGLE, urls: result.urls }]);
  });

  it('uses synthetic demo route keys even when assets belong to a public route', async () => {
    const route = 'deadbeefdeadbeef|00000000--0000000001';
    const url = asset('5beb9b58bd12b691', 2);
    api.routes.getRouteFiles.mockResolvedValue({ cameras: [url] });
    const { dispatch, setState, actions } = setup();
    setState({ dongleId: 'deadbeefdeadbeef' });
    await dispatch(fetchFiles(route));
    expect(actions[0].urls).toEqual({ [`${route}--2/cameras`]: { url } });
  });

  it('skips malformed groups and individual entries without losing valid assets', async () => {
    api.routes.getRouteFiles.mockResolvedValue({
      cameras: [null, {}, 'not a URL', '/relative/0/fcamera.hevc', asset(DONGLE, 'bad'),
        asset(DONGLE, '-1'), asset(DONGLE, '9007199254740992'), 'javascript://example/0/fcamera.hevc',
        'https://example/0/', asset(DONGLE, 0)],
      logs: {}, qlogs: 'bad group', dcameras: null,
    });
    const { dispatch } = setup();
    await expect(dispatch(fetchFiles(ROUTE))).resolves.toEqual({ urls: { [`${ROUTE}--0/cameras`]: { url: asset() } } });
  });

  it.each([null, undefined, [], 'invalid', { error: 'offline' }])('reports an unavailable file listing (%j) rather than claiming it is empty', async (response) => {
    api.routes.getRouteFiles.mockResolvedValue(response);
    const { dispatch, actions } = setup();
    await expect(dispatch(fetchFiles(ROUTE))).resolves.toEqual({ error: 'Unable to load files. Try again.' });
    expect(actions).toEqual([]);
  });

  it('reports a rejected request without an unhandled rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.routes.getRouteFiles.mockRejectedValue(new Error('offline'));
    const { dispatch } = setup();
    await expect(dispatch(fetchFiles(ROUTE))).resolves.toEqual({ error: 'Unable to load files. Try again.' });
    consoleError.mockRestore();
  });

  it('does not apply a late file response to another selected device', async () => {
    let resolve;
    api.routes.getRouteFiles.mockReturnValue(new Promise(done => { resolve = done; }));
    const { dispatch, actions, setState } = setup();
    const pending = dispatch(fetchFiles(ROUTE));
    setState({ dongleId: OTHER });
    resolve({ cameras: [asset()] });
    await pending;
    expect(actions).toEqual([]);
  });
});

describe('upload queue resilience', () => {
  it.each([null, {}, 'invalid'])('ignores an invalid pending Athena queue (%j)', async (response) => {
    api.devices.getAthenaQueue.mockResolvedValue(response);
    const { dispatch, actions } = setup();
    await expect(dispatch(fetchAthenaQueue(DONGLE))).resolves.toBeUndefined();
    expect(actions).toEqual([]);
  });

  it('skips malformed queue entries and maps supported pending files', async () => {
    const expiry = Math.floor(Date.now() / 1000) + 60;
    api.devices.getAthenaQueue.mockResolvedValue([
      null, {}, { method: 'uploadFilesToUrls', expiry, params: {} },
      { method: 'uploadFilesToUrls', expiry, params: { files_data: [null, {}, { fn: 'bad/unknown' }, { fn: `${LOG}--3/fcamera.hevc` }] } },
      { method: 'uploadFileToUrl', expiry, params: null },
    ]);
    const { dispatch, actions } = setup();
    await dispatch(fetchAthenaQueue(DONGLE));
    expect(actions).toEqual([{ type: Types.ACTION_FILES_UPDATE, dongleId: DONGLE, files: { [`${ROUTE}--3/cameras`]: { progress: 0, current: false } } }]);
  });

  it.each([null, {}, { result: {} }])('handles an invalid live queue response (%j)', async (response) => {
    Athena.postJsonRpcPayload.mockResolvedValue(response);
    const { dispatch, actions } = setup();
    await expect(dispatch(fetchUploadQueue(DONGLE))).resolves.toBeUndefined();
    expect(actions.some(action => action.type === Types.ACTION_FILES_UPLOADING)).toBe(false);
  });

  it('prevents a pending queue from updating state or resuming polling after another device opens', async () => {
    vi.useFakeTimers();
    let resolveOld;
    Athena.postJsonRpcPayload
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ result: [] });
    const { dispatch, actions, setState } = setup();
    const old = dispatch(fetchUploadQueue(DONGLE));
    cancelFetchUploadQueue();
    setState({ dongleId: OTHER });
    await dispatch(fetchUploadQueue(OTHER));
    resolveOld({ result: [{ id: 'old', url: asset(), current: true, progress: 0 }] });
    await old;
    expect(actions.filter(action => action.type === Types.ACTION_FILES_UPLOADING).map(action => action.dongleId)).toEqual([OTHER]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(Athena.postJsonRpcPayload).toHaveBeenCalledTimes(2);
  });
});

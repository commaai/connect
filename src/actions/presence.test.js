import rootReducer from '../reducers';
import { fetchDeviceNetworkStatus, fetchDeviceOnline, updateDevices } from './index';
import { api } from '../api/backend';
import { cancelUploads, cancelFetchUploadQueue, doUpload, fetchUploadQueue } from './files';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), capture: vi.fn() }));
vi.mock('../store', () => ({ default: { getState: () => ({ offset: 0, startTime: 0, desiredPlaySpeed: 0 }) } }));
vi.mock('../api', async importOriginal => {
  const originalApi = await importOriginal();
  return { ...originalApi, athena: { ...originalApi.athena, postJsonRpcPayload: mocks.rpc } };
});
vi.mock('@sentry/react', async importOriginal => ({ ...await importOriginal(), captureException: mocks.capture }));

function setup(version = '0.9.8', ping = 123456) {
  const device = { dongle_id: 'device', openpilot_version: version, last_athena_ping: ping };
  let state = { dongleId: 'device', device, devices: [device], filesUploading: {}, desiredPlaySpeed: 0, offset: 0, startTime: Date.now() };
  const actions = [];
  const dispatch = action => {
    if (typeof action === 'function') return action(dispatch, () => state);
    if (action) { actions.push(action); state = rootReducer(state, action); }
    return action;
  };
  return { dispatch, actions, state: () => state };
}
beforeEach(() => { mocks.rpc.mockReset(); mocks.capture.mockClear(); });
afterEach(() => { cancelFetchUploadQueue(); vi.restoreAllMocks(); });

// Adversarial check 1: auxiliary RPCs must not overwrite server presence.
test.each(['0.8.13', '0.9.8'])('successful network probe on %s preserves last_athena_ping', async version => {
  const app = setup(version);
  mocks.rpc.mockResolvedValue({ result: version === '0.8.13' ? 1 : false });
  await app.dispatch(fetchDeviceNetworkStatus('device'));
  expect(app.state().device.network_metered).toBe(false);
  expect(app.state().device.last_athena_ping).toBe(123456);
});

test.each(['Timed out', 'Device not registered', 'Unexpected RPC error'])('network error %s preserves presence', async message => {
  const app = setup();
  mocks.rpc.mockRejectedValue(new Error(message));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await app.dispatch(fetchDeviceNetworkStatus('device'));
  expect(app.state().device.last_athena_ping).toBe(123456);
  expect(mocks.capture).toHaveBeenCalledTimes(message === 'Unexpected RPC error' ? 1 : 0);
});

// Adversarial check 2: finish a stale RPC after a newer server response.
test.each([0, 987654])('a late failed probe cannot overwrite server ping %i', async ping => {
  const app = setup();
  let reject;
  mocks.rpc.mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
  const probe = app.dispatch(fetchDeviceNetworkStatus('device'));
  app.dispatch(updateDevices([{ ...app.state().device, last_athena_ping: ping }]));
  reject(new Error('Timed out'));
  await probe;
  expect(app.state().device.last_athena_ping).toBe(ping);
  expect(app.state().devices[0].last_athena_ping).toBe(ping);
});

test('successful upload queue polling preserves server presence', async () => {
  const app = setup();
  mocks.rpc.mockImplementation((_dongle, payload) => Promise.resolve({ result: payload.method === 'listUploadQueue' ? [] : false }));
  await app.dispatch(fetchUploadQueue('device'));
  expect(app.state().device.last_athena_ping).toBe(123456);
});

test('offline upload queue and cancellation responses preserve presence', async () => {
  const app = setup();
  mocks.rpc.mockResolvedValue({ offline: true });
  await app.dispatch(fetchUploadQueue('device'));
  await app.dispatch(cancelUploads('device', [1]));
  expect(app.state().device.last_athena_ping).toBe(123456);
});

test.each(['0.8.12', '0.9.8'])('upload failure on %s preserves presence and resets file state', async version => {
  const app = setup(version);
  mocks.rpc.mockResolvedValue({ error: { message: 'Failed' } });
  await app.dispatch(doUpload('device', ['route--0/rlog.zst'], ['https://files.example/rlog.zst']));
  expect(app.state().device.last_athena_ping).toBe(123456);
  expect(app.state().files['device|route--0/logs']).toEqual({});
});

test.each(['Timed out', 'Device not registered', 'Broken transport'])('upload RPC error classification: %s', async message => {
  const app = setup();
  mocks.rpc.mockRejectedValue(Object.assign(new Error(message), { resp: { status: 503 } }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await app.dispatch(cancelUploads('device', [1]));
  expect(app.state().device.last_athena_ping).toBe(123456);
  expect(mocks.capture).toHaveBeenCalledTimes(message === 'Broken transport' ? 1 : 0);
});

test.each([
  ['0.8.13', 0], ['0.8.13', 987654], ['0.9.8', 0], ['0.9.8', 987654],
])('a late successful %s probe cannot overwrite server ping %i', async (version, ping) => {
  const app = setup(version);
  let resolve;
  mocks.rpc.mockImplementation(() => new Promise(resolvePromise => { resolve = resolvePromise; }));
  const probe = app.dispatch(fetchDeviceNetworkStatus('device'));
  app.dispatch(updateDevices([{ ...app.state().device, last_athena_ping: ping }]));
  resolve({ result: version === '0.8.13' ? 1 : false });
  await probe;
  expect(app.state().device.last_athena_ping).toBe(ping);
  expect(app.state().devices[0].last_athena_ping).toBe(ping);
  expect(app.state().device.network_metered).toBe(false);
});

test('authoritative device polling still updates online status', async () => {
  const app = setup();
  vi.spyOn(api.devices, 'fetchDevice').mockResolvedValue({ last_athena_ping: 987654 });
  app.dispatch(fetchDeviceOnline('device'));
  await vi.waitFor(() => expect(app.state().device.last_athena_ping).toBe(987654));
  expect(app.state().devices[0].last_athena_ping).toBe(987654);
});

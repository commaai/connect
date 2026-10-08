import { vi } from 'vitest';
import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import { athena as Athena } from '../api';
import { doUpload } from './files';
import {
  deviceUnreachable,
  fetchDeviceNetworkStatus,
  primeNav,
  pushTimelineRange,
  streamNav,
  urlForState,
} from './index';
import * as Types from './types';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

vi.mock('../api', () => ({
  athena: { postJsonRpcPayload: vi.fn() },
  billing: {},
}));

vi.mock('../api/backend', () => ({
  api: {
    routes: {},
    devices: {},
    auth: { isAuthenticated: vi.fn() },
  },
}));

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

describe('timeline actions', () => {
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id');
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'statedongle', [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});

function createThunkStore(state) {
  const actions = [];
  const getState = vi.fn(() => state);
  const dispatch = vi.fn((action) => {
    if (typeof action === 'function') {
      return action(dispatch, getState);
    }
    actions.push(action);
    return action;
  });

  return { actions, dispatch, getState };
}

describe('Athena error handling', () => {
  let consoleError;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each([
    ['Timed out waiting for response'],
    ['Device not registered'],
  ])('treats %s as device unreachable', (message) => {
    expect(deviceUnreachable(new Error(message))).toBe(true);
  });

  it.each([
    ['HTTP 500'],
    ['Unauthorized'],
    ['NetworkError when attempting to fetch resource'],
  ])('does not treat unrelated Athena error as device unreachable: %s', (message) => {
    expect(deviceUnreachable(new Error(message))).toBe(false);
  });

  it.each([
    ['getNetworkMetered', '0.8.14', 'athena_fetch_networkmetered'],
    ['getNetworkType', '0.8.13', 'athena_fetch_networktype'],
  ])('reports unrelated %s errors without marking the device offline', async (method, openpilotVersion, fingerprint) => {
    const error = new Error('HTTP 500');
    Athena.postJsonRpcPayload.mockRejectedValue(error);
    const { actions, dispatch, getState } = createThunkStore({
      device: { dongle_id: 'dongle', openpilot_version: openpilotVersion },
      devices: [],
    });

    await fetchDeviceNetworkStatus('dongle')(dispatch, getState);

    expect(Athena.postJsonRpcPayload).toHaveBeenCalledWith('dongle', expect.objectContaining({ method }));
    expect(actions).not.toContainEqual(expect.objectContaining({
      type: Types.ACTION_UPDATE_DEVICE_ONLINE,
      dongleId: 'dongle',
      last_athena_ping: 0,
    }));
    expect(consoleError).toHaveBeenCalledWith(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error, { fingerprint });
  });

  it.each([
    ['Timed out waiting for response'],
    ['Device not registered'],
  ])('marks network status unreachable errors offline without reporting: %s', async (message) => {
    Athena.postJsonRpcPayload.mockRejectedValue(new Error(message));
    const { actions, dispatch, getState } = createThunkStore({
      device: { dongle_id: 'dongle', openpilot_version: '0.8.14' },
      devices: [],
    });

    await fetchDeviceNetworkStatus('dongle')(dispatch, getState);

    expect(actions).toContainEqual(expect.objectContaining({
      type: Types.ACTION_UPDATE_DEVICE_ONLINE,
      dongleId: 'dongle',
      last_athena_ping: 0,
    }));
    expect(consoleError).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports upload RPC errors instead of returning offline for every failure', async () => {
    const error = new Error('HTTP 500');
    error.resp = { status: 500 };
    Athena.postJsonRpcPayload.mockRejectedValue(error);
    const { actions, dispatch, getState } = createThunkStore({
      device: { dongle_id: 'dongle', openpilot_version: '0.8.13' },
      devices: [],
    });

    await doUpload('dongle', ['2026-01-01--00-00-00--0/qlog.bz2'], ['https://upload.example'])(dispatch, getState);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, { fingerprint: 'action_files_athena_uploads' });
    expect(actions).not.toContainEqual(expect.objectContaining({
      type: Types.ACTION_UPDATE_DEVICE_ONLINE,
      dongleId: 'dongle',
      last_athena_ping: 0,
    }));
  });

  it('keeps upload timeout failures as offline and unreported', async () => {
    const error = new Error('Timed out waiting for response');
    error.resp = { status: 504 };
    Athena.postJsonRpcPayload.mockRejectedValue(error);
    const { actions, dispatch, getState } = createThunkStore({
      device: { dongle_id: 'dongle', openpilot_version: '0.8.13' },
      devices: [],
    });

    await doUpload('dongle', ['2026-01-01--00-00-00--0/qlog.bz2'], ['https://upload.example'])(dispatch, getState);

    expect(actions).toContainEqual(expect.objectContaining({
      type: Types.ACTION_UPDATE_DEVICE_ONLINE,
      dongleId: 'dongle',
      last_athena_ping: 0,
    }));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

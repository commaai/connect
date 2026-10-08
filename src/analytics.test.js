import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { ACTION_STARTUP_DATA } from './actions/types';
import { analyticsMiddleware } from './analytics';

const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => auth.signedIn } }));
vi.mock('./timeline', () => ({ currentOffset: () => 0 }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const SHARED = '2222cccc2222cccc';
const devices = [
  { dongle_id: DONGLE, device_type: 'threex', is_owner: true, prime_type: 1 },
  { dongle_id: OTHER, device_type: 'tici', is_owner: false, prime_type: 0 },
];
const profile = { user_id: 'me', superuser: false };

const locationChange = (pathname) => ({
  type: LOCATION_CHANGE,
  payload: { action: 'PUSH', location: { pathname, search: '', hash: '' } },
});

function log(prevState, state, action) {
  let current = prevState;
  analyticsMiddleware({ getState: () => current })(() => { current = state; })(action);
}

function selectDeviceEvents() {
  return gtag.mock.calls.filter(([, name]) => name === 'select_device').map(([, , params]) => params);
}

beforeEach(() => {
  auth.signedIn = true;
  vi.stubGlobal('gtag', vi.fn());
});

describe('select_device', () => {
  it('waits for startup data to describe the first device', () => {
    auth.signedIn = false;
    log({ dongleId: null, devices: null, profile: null }, { dongleId: DONGLE, devices: null, profile: null }, locationChange(`/${DONGLE}`));
    expect(selectDeviceEvents()).toEqual([]);

    auth.signedIn = true;
    log({ dongleId: DONGLE, devices: null, profile: null }, { dongleId: DONGLE, devices, profile }, { type: ACTION_STARTUP_DATA });
    expect(selectDeviceEvents()).toEqual([expect.objectContaining({ device_type: 'threex', device_owner: true, device_prime_type: 1 })]);
  });

  it('logs a later switch when the location changes', () => {
    log({ dongleId: DONGLE, devices, profile }, { dongleId: OTHER, devices, profile }, locationChange(`/${OTHER}`));
    expect(selectDeviceEvents()).toEqual([expect.objectContaining({ device_type: 'tici', device_owner: false, device_prime_type: 0 })]);
  });

  it('skips a device the list does not describe', () => {
    log({ dongleId: DONGLE, devices, profile }, { dongleId: SHARED, devices, profile }, locationChange(`/${SHARED}`));
    expect(selectDeviceEvents()).toEqual([]);
  });
});

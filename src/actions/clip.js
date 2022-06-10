import * as Sentry from '@sentry/react';
import { raw as RawApi, athena as AthenaApi, devices as DevicesApi } from '@commaai/comma-api';

import { updateDeviceOnline, fetchDeviceNetworkStatus } from './';
import * as Types from './types';
import { deviceOnCellular, getDeviceFromState } from '../utils';

export function clipExit() {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    dispatch({
      type: Types.ACTION_CLIP_EXIT,
      dongleId,
    });
  };
}

export function clipInit() {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    dispatch({
      type: Types.ACTION_CLIP_INIT,
      dongleId,
    });
  };
}

import * as Sentry from '@sentry/react';
import { raw as RawApi, athena as AthenaApi, devices as DevicesApi } from '@commaai/comma-api';

import { updateDeviceOnline, fetchDeviceNetworkStatus } from './';
import * as Types from './types';
import { deviceOnCellular, getDeviceFromState } from '../utils';

export function clipBack() {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    dispatch({
      type: Types.ACTION_CLIP_BACK,
      dongleId,
    });
  };
}

export function clipInit() {
  return (dispatch, getState) => {
    const { dongleId, currentSegment } = getState();
    dispatch({
      type: Types.ACTION_CLIP_INIT,
      dongleId,
      route: currentSegment.route,
    });
  };
}

export function clipCreate(video_type, label) {
  return (dispatch, getState) => {
    const { dongleId, loop } = getState();
    dispatch({
      type: Types.ACTION_CLIP_CREATE,
      dongleId,
      start_time: loop.startTime,
      end_time: loop.startTime + loop.duration,
      video_type,
      label,
    });
  };
}

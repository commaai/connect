import * as Sentry from '@sentry/react';
import { clips as ClipsApi } from '@commaai/comma-api';

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

export function clipCreate(clip_id, video_type, label, isPublic) {
  return (dispatch, getState) => {
    const { dongleId, loop } = getState();
    dispatch({
      type: Types.ACTION_CLIP_CREATE,
      dongleId,
      clip_id,
      start_time: loop.startTime,
      end_time: loop.startTime + loop.duration,
      video_type,
      label,
      is_public: isPublic,
    });
  };
}

export function fetchClipDetails(clip_id) {
  return async (dispatch, getState) => {
    const { dongleId } = getState();
    try {
      const resp = await ClipsApi.clipsDetails(dongleId, clip_id);
      dispatch({
        type: Types.ACTION_CLIP_UPDATE,
        dongleId,
        ...resp,
      });
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_details' });
    }
  };
}

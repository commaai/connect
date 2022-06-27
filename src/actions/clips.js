import * as Sentry from '@sentry/react';
import { push } from 'connected-react-router';
import { clips as ClipsApi } from '@commaai/comma-api';

import { selectRange, urlForState } from './';
import { getClipsNav } from '../url';
import * as Types from './types';
import { deviceOnCellular, getDeviceFromState } from '../utils';

export function clipBack() {
  return (dispatch, getState) => {
    const { dongleId, clip, zoom } = getState();

    const shouldPathChange = Boolean(getClipsNav(window.location.pathname));
    dispatch({
      type: Types.ACTION_CLIP_EXIT,
      dongleId,
    });

    if (shouldPathChange) {
      dispatch(push(urlForState(dongleId, zoom?.start || clip.start_time, zoom?.end || clip.end_time, false)));
    }
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

export function clipCreate(clip_id, video_type, title, isPublic) {
  return (dispatch, getState) => {
    const { dongleId, loop, currentSegment } = getState();
    dispatch({
      type: Types.ACTION_CLIP_CREATE,
      dongleId,
      clip_id,
      start_time: loop.startTime,
      end_time: loop.startTime + loop.duration,
      video_type,
      title,
      is_public: isPublic,
      route: currentSegment.route,
    });

    dispatch(push(`/${dongleId}/clips/${clip_id}`));
  };
}

export function fetchClipDetails(clip_id) {
  return async (dispatch, getState) => {
    const { dongleId, zoom } = getState();
    try {
      const resp = await ClipsApi.clipsDetails(dongleId, clip_id);

      if (resp.start_time && resp.end_time && !zoom) {
        dispatch(selectRange(resp.start_time, resp.end_time, false));
      }

      if (resp.status === 'pending') {
        dispatch({
          type: Types.ACTION_CLIP_CREATE,
          dongleId,
          clip_id,
          start_time: resp.start_time,
          end_time: resp.end_time,
          video_type: resp.video_type,
          title: resp.title,
          is_public: resp.is_public,
          route: resp.route_name,
          pending_status: resp.pending_status,
        });
      } else if (resp.status === 'done') {
        throw new Error('not implemented');
      }
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_details' });
    }
  };
}

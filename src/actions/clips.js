import * as Sentry from '@sentry/react';
import { push } from 'connected-react-router';
import MyCommaAuth from '@commaai/my-comma-auth';
import { clips as Clips } from '@commaai/api';

import { checkRoutesData, selectDevice, urlForState } from '.';
import { getClipsNav } from '../url';
import * as Types from './types';

export function clipsExit() {
  return (dispatch, getState) => {
    const { dongleId, clips, zoom } = getState();

    const shouldPathChange = Boolean(getClipsNav(window.location.pathname));
    dispatch({
      type: Types.ACTION_CLIPS_EXIT,
      dongleId,
    });

    if (shouldPathChange) {
      if (clips.state !== 'list' && clips.list) {
        dispatch(push(`/${dongleId}/clips`));
      } else {
        dispatch(push(urlForState(dongleId, zoom?.start, zoom?.end, false)));
      }
    }

    dispatch(checkRoutesData());
  };
}

export function fetchClipsList(dongleId) {
  return async (dispatch, getState) => {
    const { globalDongleId } = getState();
    try {
      if (globalDongleId !== dongleId) {
        dispatch(selectDevice(dongleId, false));
      }

      dispatch({
        type: Types.ACTION_CLIPS_LIST,
        dongleId,
        list: null,
      });
      dispatch(push(`/${dongleId}/clips`));

      const resp = await Clips.clipsList(dongleId);

      dispatch({
        type: Types.ACTION_CLIPS_LIST,
        dongleId,
        list: resp,
      });
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_list' });
    }
  };
}

export function clipsInit() {
  return (dispatch, getState) => {
    const { dongleId, currentRoute } = getState();
    dispatch({
      type: Types.ACTION_CLIPS_INIT,
      dongleId,
      route: currentRoute.fullname,
    });
  };
}

export function clipsCreate(clipId, videoType, title, isPublic) {
  return (dispatch, getState) => {
    const { dongleId, loop, currentRoute } = getState();
    dispatch({
      type: Types.ACTION_CLIPS_CREATE,
      dongleId,
      clip_id: clipId,
      start_time: loop.startTime,
      end_time: loop.startTime + loop.duration,
      video_type: videoType,
      title,
      is_public: isPublic,
      route: currentRoute.fullname,
    });

    dispatch(push(`/${dongleId}/clips/${clipId}`));
  };
}

export function navToClips(clipId, state) {
  return async (dispatch, getState) => {
    const { dongleId } = getState();
    if (state === 'done') {
      dispatch({
        type: Types.ACTION_CLIPS_DONE,
        dongleId,
        clip_id: clipId,
      });
    } else if (state === 'upload') {
      dispatch({
        type: Types.ACTION_CLIPS_CREATE,
        dongleId,
        clip_id: clipId,
      });
    }
    dispatch(push(`/${dongleId}/clips/${clipId}`));
    dispatch(fetchClipsDetails(clipId));
  };
}

export function fetchClipsDetails(clipId) {
  return async (dispatch, getState) => {
    const { dongleId, clips } = getState();
    try {
      if (!clips) {
        dispatch({
          type: Types.ACTION_CLIPS_LOADING,
          dongleId,
          clip_id: clipId,
        });
      }

      const resp = await Clips.clipsDetails(dongleId, clipId);

      if (resp.status === 'pending') {
        dispatch({
          type: Types.ACTION_CLIPS_CREATE,
          dongleId,
          clip_id: clipId,
          start_time: resp.start_time,
          end_time: resp.end_time,
          video_type: resp.video_type,
          title: resp.title,
          is_public: resp.is_public,
          route: resp.route_name,
          pending_status: resp.pending_status,
          pending_progress: resp.pending_progress,
        });
      } else if (resp.status === 'done') {
        dispatch({
          type: Types.ACTION_CLIPS_DONE,
          dongleId,
          clip_id: clipId,
          start_time: resp.start_time,
          end_time: resp.end_time,
          video_type: resp.video_type,
          title: resp.title,
          is_public: resp.is_public,
          route: resp.route_name,
          url: resp.url,
          thumbnail: resp.thumbnail,
        });
      } else if (resp.status === 'failed') {
        dispatch(fetchClipsList(dongleId));
      }
    } catch (err) {
      if (err.resp && err.resp.status === 404) {
        if (!MyCommaAuth.isAuthenticated()) {
          window.location = `/?r=${encodeURI(window.location.pathname)}`; // redirect to login
        } else {
          dispatch({
            type: Types.ACTION_CLIPS_ERROR,
            dongleId,
            clip_id: clipId,
            error: 'clip_doesnt_exist',
          });
        }
        return;
      }

      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_details' });
    }
  };
}

export function clipsUpdateIsPublic(clipId, isPublic) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    dispatch({
      type: Types.ACTION_CLIPS_UPDATE,
      dongleId,
      clip_id: clipId,
      is_public: isPublic,
    });
  };
}

export function clipsDelete(clipId) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    dispatch({
      type: Types.ACTION_CLIPS_DELETE,
      dongleId,
      clip_id: clipId,
    });
    dispatch(clipsExit());
  };
}

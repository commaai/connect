import { LOCATION_CHANGE } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import MyCommaAuth from '@commaai/my-comma-auth';

import * as Types from './actions/types';
import { sendEvent } from './analytics-v2';
import { getDongleID, getZoom } from './url';
import { deviceIsOnline } from './utils';
import { isDemoDevice } from './demo';

function getPageViewEventLocation(pathname) {
  let pageLocation = pathname;
  const dongleId = getDongleID(pageLocation);
  if (dongleId) {
    pageLocation = pageLocation.replace(dongleId, '<dongleId>');
  }
  const zoom = getZoom(pageLocation);
  if (zoom) {
    pageLocation = pageLocation.replace(zoom.start.toString(), '<zoomStart>');
    pageLocation = pageLocation.replace(zoom.end.toString(), '<zoomEnd>');
  }

  if (pageLocation.endsWith('/')) {
    pageLocation = pageLocation.substring(0, pageLocation.length - 1);
  }
  return pageLocation;
}

const clusterMap = {
  s: 1000,
  m: 60000,
  h: 3600000,
};

export function attachRelTime(obj, key, ms = true, cluster = null) {
  if (!obj[key]) {
    console.log(`${key} not in obj`);
    return;
  }

  const now = Date.now();
  let t = obj[key];
  if (ms !== true) {
    t *= 1000;
  }

  const dt = t - now;

  obj[`rel_${key}_ms`] = dt;

  if (cluster) {
    obj[`rel_${key}_${cluster}`] = Math.round(dt / clusterMap[cluster]);
  }
}

function getVideoPercent(state, offset) {
  const { zoom, filter } = state;
  if (!offset) {
    offset = state.offset;
  }
  return (offset - (zoom.start - filter.start)) / (zoom.end - zoom.start);
}

function logAction(action, prevState, state) {
  if (MyCommaAuth.isAuthenticated() && !state.profile) { // no startup data yet
    return;
  }

  let percent;
  let params = {};

  if (process.env.NODE_ENV !== 'production') {
    params = {
      ...params,
      debug_mode: true,
    };
  }

  if (state.profile?.superuser) {
    params = {
      ...params,
      traffic_type: 'internal',
    };
  }

  if (state.profile?.user_id === 'github_92103660' || new URLSearchParams(window.location.search).get('ci')) {
    params = {
      ...params,
      traffic_type: 'ci',
    };
  }

  function tag(event, properties) {
    sendEvent({ event, ...properties });
    if (typeof gtag === 'function') {
      gtag(event, {
        ...params,
        ...properties,
      });
    }
  }

  switch (action.type) {
    case LOCATION_CHANGE:
      gtag('event', 'page_view', {
        page_location: getPageViewEventLocation(action.payload.location.pathname),
      });
      return;

    case Types.TIMELINE_SELECTION_CHANGED:
      if (!prevState.zoom && state.zoom) {
        params = {
          ...params,
          start: state.zoom.start,
          end: state.zoom.end,
        };
        attachRelTime(params, 'start', true, 'h');
        attachRelTime(params, 'end', true, 'h');
        gtag('event', 'select_zoom', params);
      }
      return;

    case Types.ACTION_STARTUP_DATA:
      gtag('set', {
        user_id: state.profile?.user_id,
        user_properties: {
          superuser: state.profile?.superuser,
          has_prime: state.profile?.prime,
          devices_count: state.devices?.length,
          device_is_demo: isDemoDevice(state.device?.dongle_id),
          device_prime_type: state.device?.prime_type,
          device_type: state.device?.device_type,
          device_version: state.device?.openpilot_version,
          device_owner: state.device?.is_owner,
          device_online: state.device ? deviceIsOnline(state.device) : undefined,
          device_sim_type: state.device?.sim_type,
          device_trial_claimed: state.device?.trial_claimed,
        },
      });

      gtag('event', 'page_view', {
        ...params,
        page_location: getPageViewEventLocation(window.location.pathname),
      });
      sendEvent({
        event: 'startup_device',
        dongle_id: state.device?.dongle_id,
        device_type: state.device?.device_type,
      });
      return;

    case Types.ACTION_SELECT_DEVICE:
      gtag('event', 'select_device', {
        ...params,
        device_is_demo: isDemoDevice(state.device?.dongle_id),
        device_prime_type: state.device?.prime_type,
        device_type: state.device?.device_type,
        device_version: state.device?.openpilot_version,
        device_owner: state.device?.is_owner,
        device_online: state.device ? deviceIsOnline(state.device) : undefined,
        device_sim_type: state.device?.sim_type,
        device_trial_claimed: state.device?.trial_claimed,
      });
      sendEvent({
        event: 'select_device',
        dongle_id: state.device?.dongle_id,
        device_type: state.device?.device_type,
      });

      gtag('set', {
        user_properties: {
          device_is_demo: isDemoDevice(state.device?.dongle_id),
          device_prime_type: state.device?.prime_type,
          device_type: state.device?.device_type,
          device_version: state.device?.openpilot_version,
          device_owner: state.device?.is_owner,
          device_online: state.device ? deviceIsOnline(state.device) : undefined,
          device_sim_type: state.device?.sim_type,
          device_trial_claimed: state.device?.trial_claimed,
        },
      });
      return;

    case Types.ACTION_SELECT_TIME_FILTER:
      params = {
        ...params,
        start: action.start,
        end: action.end,
      };
      attachRelTime(params, 'start', true, 'h');
      attachRelTime(params, 'end', true, 'h');
      gtag('event', 'select_time_filter', params);
      return;

    case Types.ACTION_UPDATE_DEVICE_ONLINE:
      if (state.device?.dongleId === action.dongleId) {
        gtag('set', {
          user_properties: {
            device_online: deviceIsOnline(state.device),
          },
        });
      }
      return;

    case Types.ACTION_SEEK:
      if (state.zoom) {
        percent = getVideoPercent(state);
        gtag('event', 'video_seek', {
          ...params,
          play_speed: state.desiredPlaySpeed,
          play_percentage: percent,
          play_percentage_round: Math.round(percent * 10) / 10,
        });
      }
      return;

    case Types.ACTION_PAUSE:
      if (state.zoom) {
        percent = getVideoPercent(state);
        gtag('event', 'video_pause', {
          ...params,
          play_speed: state.desiredPlaySpeed,
          play_percentage: percent,
          play_percentage_round: Math.round(percent * 10) / 10,
        });
      }
      return;

    case Types.ACTION_PLAY:
      if (state.zoom) {
        percent = getVideoPercent(state);
        gtag('event', 'video_play', {
          ...params,
          play_speed: state.desiredPlaySpeed,
          play_percentage: percent,
          play_percentage_round: Math.round(percent * 10) / 10,
        });
      }
      return;

    case Types.ACTION_LOOP:
      if (state.currentRoute && state.zoom && state.loop?.duration !== 0) {
        percent = state.loop && state.currentRoute ? state.loop.duration / state.currentRoute.duration : undefined;
        gtag('event', 'video_loop', {
          ...params,
          loop_duration: state.loop?.duration,
          loop_duration_percentage: percent,
          loop_duration_percentage_round: percent ? Math.round(percent * 10) / 10 : undefined,
        });
      }
      return;

    case Types.ANALYTICS_EVENT:
      tag(action.name, action.parameters);
  }
}

export function analyticsMiddleware({ getState }) {
  return (next) => (action) => {
    const prevState = getState();
    const res = next(action);
    const state = getState();

    try {
      logAction(action, prevState, state);
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'analytics_middleware' });
    }

    return res;
  };
}

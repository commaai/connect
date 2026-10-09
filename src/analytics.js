import { LOCATION_CHANGE } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import MyCommaAuth from '@commaai/my-comma-auth';

import * as Types from './actions/types';
import { destinationFromUrl } from './url';
import { deviceIsOnline } from './utils';

function getPageViewEventLocation(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (/^[a-f0-9]{16}$/.test(parts[0])) {
    parts[0] = '<dongleId>';
  }
  if (destinationFromUrl({ pathname }).range) {
    parts.splice(-2, 2, '<zoomStart>', '<zoomEnd>');
  }
  return parts.length ? `/${parts.join('/')}` : '';
}

const deviceProps = (device) => ({
  device_prime_type: device?.prime_type,
  device_type: device?.device_type,
  device_version: device?.openpilot_version,
  device_owner: device?.is_owner,
  device_online: device ? deviceIsOnline(device) : undefined,
  device_sim_type: device?.sim_type,
  device_trial_claimed: device?.trial_claimed,
});

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
  const { zoom } = state;
  if (!offset) {
    offset = state.offset;
  }
  return (offset - (zoom.start)) / (zoom.end - zoom.start);
}

function logAction(action, prevState, state) {
  if (MyCommaAuth.isAuthenticated() && !state.profile) { // no startup data yet
    return;
  }

  let percent;
  let params = {};

  if (import.meta.env.DEV) {
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
    if (typeof gtag === 'function') {
      gtag(event, {
        ...params,
        ...properties,
      });
    }
  }

  if (!prevState.zoom && state.zoom) {
    const zoom = { ...params, start: state.zoom.start, end: state.zoom.end };
    attachRelTime(zoom, 'start', true, 'h');
    attachRelTime(zoom, 'end', true, 'h');
    gtag('event', 'select_zoom', zoom);
  }

  // eslint-disable-next-line default-case
  switch (action.type) {
    case LOCATION_CHANGE:
      if (!prevState.nav || action.payload.location.pathname !== prevState.router.location.pathname) { // not a dialog
        gtag('event', 'page_view', {
          page_location: getPageViewEventLocation(action.payload.location.pathname),
        });
      }

      if (prevState.dongleId !== state.dongleId) {
        gtag('event', 'select_device', { ...params, ...deviceProps(state.device) });
        gtag('set', { user_properties: deviceProps(state.device) });
      }
      return;

    case Types.ACTION_STARTUP_DATA:
      gtag('set', {
        user_id: state.profile?.user_id,
        user_properties: {
          superuser: state.profile?.superuser,
          has_prime: state.profile?.prime,
          devices_count: state.devices?.length,
          ...deviceProps(state.device),
        },
      });

      gtag('event', 'page_view', {
        ...params,
        page_location: getPageViewEventLocation(window.location.pathname),
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

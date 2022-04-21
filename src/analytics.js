import { LOCATION_CHANGE } from 'connected-react-router';
import * as Sentry from '@sentry/react';

import MyCommaAuth from '@commaai/my-comma-auth';

import * as Types from './actions/types';
import { getDongleID, getZoom } from './url'
import { deviceIsOnline } from './utils';
import { isDemoDevice } from './demo';

function getPageViewEventLocation(pathname) {
  let page_location = pathname;
  const dongleId = getDongleID(page_location);
  if (dongleId) {
    page_location = page_location.replace(dongleId, '<dongleId>');
  }
  const zoom = getZoom(page_location);
  if (zoom.expanded) {
    page_location = page_location.replace(zoom.start.toString(), '<zoomStart>');
    page_location = page_location.replace(zoom.end.toString(), '<zoomEnd>');
  }

  if (page_location.endsWith('/')) {
    page_location = page_location.substring(0, page_location.length - 1);
  }
  return page_location;
}

const cluster_map = {
  's': 1000,
  'm': 60000,
  'h': 3600000,
};

export function attachRelTime(obj, key, ms=true, cluster=null) {
  if (!obj[key]) {
    console.log(`${key} not in obj`);
    return;
  }

  const now = Date.now();
  const t = obj[key];
  if (ms !== true) {
    t *= 1000;
  }

  const dt = t - now;

  obj[`rel_${key}_ms`] = dt;

  if (cluster) {
    obj[`rel_${key}_${cluster}`] = Math.round(dt / cluster_map[cluster]);
  }
}

function getVideoPercent(state, offset) {
  const { zoom, filter } = state;
  if (!offset) {
    offset = state.offset;
  }
  return (offset - (zoom.start - filter.start)) / (zoom.end - zoom.start);
}

export function analyticsMiddleware({ getState }) {
  return (next) => (action) => {
    const prevState = getState();
    const res = next(action);
    const state = getState();

    try {
      log_action(action, prevState, state);
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'analytics_middleware' });
    }

    return res;
  };
}

function log_action(action, prevState, state) {
  if (typeof gtag !== 'function') {
    return;
  }

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

  switch (action.type) {
  case LOCATION_CHANGE:
    gtag('event', 'page_view', {
      page_location: getPageViewEventLocation(action.payload.location.pathname),
    });
    return;

  case Types.TIMELINE_SELECTION_CHANGED:
    if (!prevState.zoom.expanded && state.zoom.expanded) {
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
      user_id: state.profile.user_id,
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
    if (state.zoom?.expanded) {
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
    if (state.zoom?.expanded) {
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
    if (state.zoom?.expanded) {
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
    if (state.currentSegment && state.loop?.duration !== 0 && state.zoom?.expanded) {
      percent = state.loop && state.currentSegment ? state.loop.duration / state.currentSegment.duration : undefined;
      gtag('event', 'video_loop', {
        ...params,
        loop_duration: state.loop?.duration,
        loop_duration_percentage: percent,
        loop_duration_percentage_round: percent ? Math.round(percent * 10) / 10 : undefined,
      });
    }
    return;

  case Types.ANALYTICS_EVENT:
    gtag('event', action.name, {
      ...params,
      ...action.parameters,
    });
    return;
  }
}

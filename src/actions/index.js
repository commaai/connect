import { push } from 'connected-react-router';
import * as Sentry from '@sentry/react';
import document from 'global/document';
import { billing as Billing, devices as DevicesApi, drives as Drives } from '@commaai/comma-api';

import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback'
import { getSegmentFetchRange, hasSegmentMetadata, fetchSegmentMetadata, parseSegmentMetadata, insertSegmentMetadata
  } from '../timeline/segments';
import * as Demo from '../demo';

const demoSegments = require('../demo/segments.json');

let segmentsRequest = null;

export function selectRange(start, end, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (state.zoom.start !== start || state.zoom.end !== end) {
      dispatch({
        type: Types.TIMELINE_SELECTION_CHANGED,
        start,
        end
      });
    }

    dispatch(checkSegmentMetadata());

    if (!state.loop.startTime
      || !state.loop.duration
      || state.loop.startTime < start
      || state.loop.startTime + state.loop.duration > end
      || state.loop.duration < end - start) {
      dispatch(resetPlayback());
      dispatch(selectLoop(start, end - start));
    }

    if (allowPathChange) {
      const desiredPath = urlForState(state.dongleId, start, end, false);
      if (window.location.pathname !== desiredPath) {
        dispatch(push(desiredPath));
      }
    }
  };
}

export function selectDevice(dongleId, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    let device;
    if (state.devices && state.devices.length > 1) {
      device = state.devices.find((d) => d.dongle_id === dongleId);
    }
    if (!device && state.device && state.device.dongle_id === dongleId) {
      device = state.device;
    }

    dispatch({
      type: Types.ACTION_SELECT_DEVICE,
      dongleId,
    });

    dispatch(selectRange(null, null, false))
    if (device && !device.shared) {
      dispatch(primeFetchSubscription(dongleId, device));
      dispatch(fetchDeviceOnline(dongleId));
    }

    dispatch(checkSegmentMetadata());

    if (allowPathChange) {
      const desiredPath = urlForState(dongleId, null, null, null);
      if (window.location.pathname !== desiredPath) {
        dispatch(push(desiredPath));
      }
    }
  };
}

export function primeFetchSubscription(dongleId, device, profile) {
  return (dispatch, getState) => {
    const state = getState();

    if (!device && state.device && state.device === dongleId) {
      device = state.device;
    }
    if (!profile && state.profile) {
      profile = state.profile;
    }

    if (device && (device.is_owner || profile.superuser)) {
      if (device.prime) {
        Billing.getSubscription(dongleId).then((subscription) => {
          dispatch(primeGetSubscription(dongleId, subscription));
        }).catch((err) => {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'actions_fetch_subscription' });
        });
      } else {
        Billing.getSubscribeInfo(dongleId).then((subscribeInfo) => {
          dispatch({
            type: Types.ACTION_PRIME_SUBSCRIBE_INFO,
            dongleId,
            subscribeInfo,
          });
        }).catch((err) => {
          console.log(err);
          Sentry.captureException(err, { fingerprint: 'actions_fetch_subscribe_info' });
        });
      }
    }
  };
}

export function primeNav(nav, allowPathChange = true) {
  return (dispatch, getState) => {
    const state = getState();
    if (!state.dongleId) {
      return;
    }

    if (state.primeNav != nav) {
      dispatch({
        type: Types.ACTION_PRIME_NAV,
        primeNav: nav,
      });
    }

    if (allowPathChange) {
      const curPath = document.location.pathname;
      const desiredPath = urlForState(state.dongleId, null, null, nav);
      if (curPath !== desiredPath) {
        dispatch(push(desiredPath));
      }
    }
  };
}

export function fetchSharedDevice(dongleId) {
  return async (dispatch, getState) => {
    try {
      const resp = await DevicesApi.fetchDevice(dongleId);
      dispatch({
        type: Types.ACTION_UPDATE_SHARED_DEVICE,
        dongleId,
        device: resp,
      });
    } catch(err) {
      if (!err.resp || err.resp.status !== 403) {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'action_fetch_shared_device' });
      }
    }
  };
}

export function fetchDeviceOnline(dongleId) {
  return (dispatch, getState) => {
    DevicesApi.fetchDevice(dongleId).then((resp) => {
      dispatch({
        type: Types.ACTION_UPDATE_DEVICE_ONLINE,
        dongleId: dongleId,
        last_athena_ping: resp.last_athena_ping,
        fetched_at: parseInt(Date.now() / 1000),
      });
    }).catch(console.log);
  };
}

export function updateDeviceOnline(dongleId, last_athena_ping) {
  return (dispatch, getState) => {
    dispatch({
      type: Types.ACTION_UPDATE_DEVICE_ONLINE,
      dongleId: dongleId,
      last_athena_ping,
      fetched_at: parseInt(Date.now() / 1000),
    });
  };
}

export function checkSegmentMetadata() {
  return (dispatch, getState) => {
    let state = getState();
    if (!state.dongleId) {
      return;
    }
    if (hasSegmentMetadata(state)) {
      // already has metadata, don't bother
      return;
    }
    if (segmentsRequest && segmentsRequest.dongleId === state.dongleId) {
      return;
    }
    console.log('We need to update the segment metadata...');
    const { dongleId } = state;
    const fetchRange = getSegmentFetchRange(state);

    if (Demo.isDemo()) {
      segmentsRequest = { req: Promise.resolve(demoSegments), dongleId: dongleId };
    } else {
      segmentsRequest = { req: Drives.getSegmentMetadata(fetchRange.start, fetchRange.end, dongleId), dongleId: dongleId };
    }
    dispatch(fetchSegmentMetadata(fetchRange.start, fetchRange.end));

    segmentsRequest.req.then((segmentData) => {
      state = getState();
      const currFetchRange = getSegmentFetchRange(state);
      if (currFetchRange.start !== fetchRange.start || currFetchRange.end !== fetchRange.end || state.dongleId !== dongleId) {
        segmentsRequest = null;
        checkSegmentMetadata();
        return;
      }

      segmentData = parseSegmentMetadata(state, segmentData);
      dispatch(insertSegmentMetadata(segmentData));

      segmentsRequest = null;
    }).catch((err) => {
      console.error('Failure fetching segment metadata', err);
      Sentry.captureException(err, { fingerprint: 'timeline_fetch_segments' });
      segmentsRequest = null;
    });
  }
}

export function fetchEvents(route) {
  return async (dispatch, getState) => {
    const state = getState();
    for (const r of state.segments) {
      if (r.route === route.route) {
        if (r.events !== null) {
          return;
        }
        break;
      }
    }

    const promises = [];
    for (let i = 0; i < route.segments; i++) {
      promises.push((async (i) => {
        try {
          const resp = await fetch(`${route.url}/${i}/events.json`, { method: 'GET' });
          const events = await resp.json();
          return events;
        } catch (err) {
          console.log(err);
          return [];
        }
      })(i));
    }

    let events = [].concat(...(await Promise.all(promises)));
    events = events.filter((ev) => ev.type === 'engage' || ev.type === 'disengage');
    events.sort((a, b) => {
      if (a.route_offset_millis === b.route_offset_millis) {
        return a.route_offset_nanos - b.route_offset_nanos;
      }
      return a.route_offset_millis - b.route_offset_millis;
    });

    let lastEngage = null;
    for (const ev of events) {
      if (ev.type === 'engage') {
        lastEngage = ev;
      } else if (ev.type === 'disengage' && lastEngage) {
        lastEngage.data = {
          end_offset_nanos: ev.offset_nanos,
          end_offset_millis: ev.offset_millis,
          end_route_offset_nanos: ev.route_offset_nanos,
          end_route_offset_millis: ev.route_offset_millis,
        };
      }
    }

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_EVENTS,
      route: route.route,
      events: events,
    });
  }
}

export function updateDevices(devices) {
  return {
    type: Types.ACTION_UPDATE_DEVICES,
    devices,
  };
}

export function updateDevice(device) {
  return {
    type: Types.ACTION_UPDATE_DEVICE,
    device,
  };
}

export function selectTimeFilter(start, end) {
  return (dispatch, getState) => {
    dispatch({
      type: Types.ACTION_SELECT_TIME_FILTER,
      start,
      end
    });

    dispatch(checkSegmentMetadata());
  }
}

export function primeGetSubscription(dongleId, subscription) {
  return {
    type: Types.ACTION_PRIME_SUBSCRIPTION,
    dongleId,
    subscription,
  };
}

function urlForState(dongleId, start, end, prime_nav) {
  const path = [dongleId];

  if (start && end) {
    path.push(start);
    path.push(end);
  } else if (prime_nav) {
    path.push('prime');
  }

  return `/${path.join('/')}`;
}

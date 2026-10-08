import * as Types from '../actions/types';
import { emptyDevice } from '../utils';
import { getDefaultFilter } from '../utils/filter';
import { OUTSIDE_DRIVE_RANGE_ERROR, resolveDriveRange } from '../utils/driveRange';

const eventsMap = {};
const locationMap = {};

function populateFetchedAt(d) {
  return {
    ...d,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}

function deviceCompareFn(a, b) {
  if (a.is_owner !== b.is_owner) {
    return b.is_owner - a.is_owner;
  }
  if (a.alias && b.alias) {
    return a.alias.localeCompare(b.alias);
  }
  if (!a.alias && !b.alias) {
    return a.dongle_id.localeCompare(b.dongle_id);
  }
  return Boolean(b.alias) - Boolean(a.alias);
}

// Keep one enriched route object available across dashboard and drive visits.
function updateCachedRoute(state, fullname, fields) {
  const logId = fullname.split('|')[1];
  const cached = state.routeCache?.[logId];
  const existing = (cached?.fullname === fullname ? cached : null)
    || state.routes?.find((route) => route.fullname === fullname)
    || (state.currentRoute?.fullname === fullname ? state.currentRoute : null);
  if (!existing) return;
  const updated = { ...existing, ...fields };
  state.routeCache = { ...state.routeCache, [logId]: updated };
  if (state.routes) state.routes = state.routes.map((route) => route.fullname === fullname ? updated : route);
  if (state.currentRoute?.fullname === fullname) state.currentRoute = updated;
}

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case Types.ACTION_NAVIGATION_ERROR:
      state.navigationError = action.error;
      break;
    case Types.ACTION_DEVICE_ERROR:
      if (action.dongleId === state.dongleId) state.deviceError = action.error;
      break;
    case Types.ACTION_STARTUP_DATA: {
      const devices = action.devices.map(populateFetchedAt).sort(deviceCompareFn);

      if (!state.dongleId && devices.length > 0) {
        state = {
          ...state,
          device: devices[0],
        };
      } else {
        state = {
          ...state,
          device: devices.find((device) => device.dongle_id === state.dongleId),
        };
        if (!state.device) {
          state.device = {
            ...emptyDevice,
            dongle_id: state.dongleId,
          };
        }
      }
      state.devices = devices;
      state.profile = action.profile;
      break;
    }
    case Types.ACTION_SELECT_DEVICE:
      state = {
        ...state,
        filter: getDefaultFilter(),
        dongleId: action.dongleId,
        deviceSession: (_state.deviceSession || 0) + 1,
        deviceError: null,
        subscription: null,
        subscribeInfo: null,
        files: null,
        selectedRouteId: null,
        routeCache: {},
        currentRoute: null,
        zoom: null,
        loop: null,
        limit: 0,
      };
      if (action.dongleId) window.localStorage.setItem('selectedDongleId', action.dongleId);
      else window.localStorage.removeItem('selectedDongleId');
      if (state.devices) {
        const newDevice = state.devices.find((device) => device.dongle_id === action.dongleId) || null;
        if (!state.device || state.device.dongle_id !== action.dongleId) {
          state.device = newDevice;
        }
      }
      if (state.routesMeta && state.routesMeta.dongleId !== state.dongleId) {
        state.routesMeta = {
          dongleId: null,
          start: null,
          end: null,
        };
        state.routes = null;
        state.lastRoutes = null;
        state.currentRoute = null;
      }
      break;
    case Types.ACTION_SELECT_TIME_FILTER:
      state = {
        ...state,
        lastRoutes: state.routes,
        filter: {
          start: action.start,
          end: action.end,
        },
        routesMeta: {
          dongleId: null,
          start: null,
          end: null,
        },
        routes: null,
        currentRoute: state.selectedRouteId ? state.currentRoute : null,
      };
      break;
    case Types.ACTION_UPDATE_ROUTE_LIMIT:
      state = {
        ...state,
        limit: action.limit,
      };
      break;
    case Types.ACTION_UPDATE_DEVICES:
      state = {
        ...state,
        devices: action.devices
          .map((d) => {
            // `rpc` holds Athena RPC-fetched values that would be wiped by listDevices payload
            const prev = (_state.devices || []).find((p) => p.dongle_id === d.dongle_id);
            return prev && prev.rpc ? { ...d, rpc: prev.rpc } : d;
          })
          .map(populateFetchedAt)
          .sort(deviceCompareFn),
      };
      if (state.dongleId) {
        const newDevice = state.devices.find((d) => d.dongle_id === state.dongleId);
        if (newDevice) {
          state.device = newDevice;
        }
      }
      break;
    case Types.ACTION_UPDATE_DEVICE: {
      state = {
        ...state,
        devices: state.devices ? [...state.devices] : [],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.device.dongle_id);
      const isSelected = state.device?.dongle_id === action.device.dongle_id;
      const previousDevice = isSelected ? state.device : state.devices[deviceIndex];
      const updatedDevice = populateFetchedAt({
        ...previousDevice, // retains rpc, network_metered
        ...action.device,  // updates alias and other returned fields
      });

      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = updatedDevice;
      } else {
        state.devices.unshift(updatedDevice);
      }

      if (isSelected) {
        state.device = updatedDevice;
      }

      break;
    }
    case Types.ACTION_UPDATE_ROUTE:
      updateCachedRoute(state, action.fullname, action.route);
      break;
    case Types.ACTION_UPDATE_ROUTE_EVENTS: {
      const firstFrame = action.events.find((ev) => ev.type === 'event' && ev.data.event_type === 'first_road_camera_frame');
      const videoStartOffset = firstFrame ? firstFrame.route_offset_millis : null;
      eventsMap[action.fullname] = { events: action.events, videoStartOffset };
      updateCachedRoute(state, action.fullname, eventsMap[action.fullname]);
      break;
    }
    case Types.ACTION_UPDATE_ROUTE_LOCATION:
      locationMap[action.fullname] = { location: action.location, locationKey: action.locationKey };
      updateCachedRoute(state, action.fullname, { [action.locationKey]: action.location });
      break;
    case Types.ACTION_UPDATE_SHARED_DEVICE:
      if (action.dongleId === state.dongleId) {
        state.device = populateFetchedAt(action.device);
      }
      break;
    case Types.ACTION_UPDATE_DEVICE_ONLINE:
      state = {
        ...state,
        devices: [...(state.devices || [])],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.dongleId);

      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = {
          ...state.devices[deviceIndex],
          last_athena_ping: action.last_athena_ping,
          fetched_at: action.fetched_at,
        };
      }

      if (state.device?.dongle_id === action.dongleId) {
        state.device = {
          ...state.device,
          last_athena_ping: action.last_athena_ping,
          fetched_at: action.fetched_at,
        };
      }
      break;
    case Types.ACTION_UPDATE_DEVICE_NETWORK:
      state = {
        ...state,
        devices: [...(state.devices || [])],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.dongleId);

      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = {
          ...state.devices[deviceIndex],
          network_metered: action.networkMetered,
        };
      }

      if (state.device?.dongle_id === action.dongleId) {
        state.device = {
          ...state.device,
          network_metered: action.networkMetered,
        };
      }
      break;
    case Types.ACTION_UPDATE_DEVICE_RPC:
      // merge RPC-fetched values (e.g. not_car) into a specific device's `rpc` field
      state = {
        ...state,
        devices: [...(state.devices || [])],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.dongleId);

      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = {
          ...state.devices[deviceIndex],
          rpc: {
            ...state.devices[deviceIndex].rpc,
            ...action.fields,
          },
        };
      }

      if (state.device?.dongle_id === action.dongleId) {
        state.device = {
          ...state.device,
          rpc: {
            ...state.device.rpc,
            ...action.fields,
          },
        };
      }
      break;
    case Types.ACTION_PRIME_SUBSCRIPTION:
      if (action.dongleId !== state.dongleId) { // ignore outdated info
        break;
      }
      state = {
        ...state,
        subscription: action.subscription,
        subscribeInfo: null,
      };
      break;
    case Types.ACTION_PRIME_SUBSCRIBE_INFO:
      if (action.dongleId !== state.dongleId) {
        break;
      }
      state = {
        ...state,
        subscribeInfo: action.subscribeInfo,
        subscription: null,
      };
      break;
    case Types.TIMELINE_PUSH_SELECTION: {
      state.selectedRouteId = action.log_id;
      state.currentRoute = state.routeCache?.[action.log_id]
        || state.routes?.find((route) => route.log_id === action.log_id) || null;
      if (action.log_id) {
        const requested = action.start != null && action.end != null ? { start: action.start, end: action.end } : null;
        const { zoom, error } = resolveDriveRange(requested, state.currentRoute);
        state.zoom = zoom ? { ...zoom, previous: action.previous || null } : null;
        if (error || state.navigationError === OUTSIDE_DRIVE_RANGE_ERROR) state.navigationError = error;
        if (!requested || !zoom) state.loop = null;
      } else {
        state.zoom = null;
        state.loop = null;
      }
      if (Object.hasOwn(action, 'navigationError')) state.navigationError = action.navigationError;
      break;
    }
    case Types.ACTION_FILES_URLS:
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.urls,
      };
      break;
    case Types.ACTION_FILES_UPDATE:
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.files,
      };
      break;
    case Types.ACTION_FILES_UPLOADING:
      state.filesUploading = action.uploading;
      state.filesUploadingMeta = {
        dongleId: action.dongleId,
        fetchedAt: Date.now(),
      };
      if (Object.keys(action.files).length) {
        state.files = {
          ...(state.files !== null ? { ...state.files } : {}),
          ...action.files,
        };
      }
      break;
    case Types.ACTION_FILES_CANCELLED_UPLOADS:
      if (state.files) {
        const cancelFileNames = Object.keys(state.filesUploading)
          .filter((id) => action.ids.includes(id))
          .map((id) => state.filesUploading[id].fileName);
        state.files = Object.keys(state.files)
          .filter((fileName) => !cancelFileNames.includes(fileName))
          .reduce((obj, fileName) => { obj[fileName] = state.files[fileName]; return obj; }, {});
      }
      state.filesUploading = Object.keys(state.filesUploading)
        .filter((id) => !action.ids.includes(id))
        .reduce((obj, id) => { obj[id] = state.filesUploading[id]; return obj; }, {});
      break;
    case Types.ACTION_ROUTES_METADATA: {
      if (action.dongleId !== state.dongleId) break;
      const received = action.routes.map((route) => ({
        ...(state.routeCache?.[route.log_id]
          || state.routes?.find((existing) => existing.fullname === route.fullname)),
        ...route,
        ...eventsMap[route.fullname],
        ...(locationMap[route.fullname] ? { [locationMap[route.fullname].locationKey]: locationMap[route.fullname].location } : {}),
      }));
      state.routeCache = { ...state.routeCache };
      if (action.selectedRouteId) state.routeCache[action.selectedRouteId] = null;
      for (const route of received) state.routeCache[route.log_id] = route;

      // A single-drive lookup never changes the filtered dashboard list or its
      // coverage. The cache also records confirmed missing drives as null.
      if (!action.selectedRouteId) {
        state.routes = received;
        state.routesMeta = { dongleId: action.dongleId, start: action.start, end: action.end };
      }

      if (state.selectedRouteId) {
        const curr = state.routeCache[state.selectedRouteId];
        if (curr) {
          state.currentRoute = curr;
          const requested = Object.hasOwn(action, 'requestedZoom') ? action.requestedZoom : state.zoom;
          const previous = Object.hasOwn(action, 'zoomPrevious') ? action.zoomPrevious : state.zoom?.previous || null;
          const { zoom, error } = resolveDriveRange(requested, curr);
          const rangeChanged = state.zoom?.start !== zoom?.start || state.zoom?.end !== zoom?.end;
          if (rangeChanged || state.zoom?.previous !== previous) state.zoom = zoom ? { ...zoom, previous } : null;
          if (error || state.navigationError === OUTSIDE_DRIVE_RANGE_ERROR) state.navigationError = error;
          if (!zoom) {
            state.loop = null;
          } else if (rangeChanged || !state.loop || state.loop.startTime == null || !state.loop.duration) {
            state.loop = {
              startTime: state.zoom.start,
              duration: state.zoom.end - state.zoom.start,
            };
          }
        }
      }
      break;
    }
    default:
      return state;
  }

  return state;
}

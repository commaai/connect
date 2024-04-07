import * as Types from '../actions/types';
import { emptyDevice } from '../utils';

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

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case Types.ACTION_STARTUP_DATA:
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
    case Types.ACTION_SELECT_DEVICE:
      state = {
        ...state,
        dongleId: action.dongleId,
        primeNav: false,
        subscription: null,
        subscribeInfo: null,
        files: null,
      };
      window.localStorage.setItem('selectedDongleId', action.dongleId);
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
        state.currentRoute = null;
      }
      break;
    case Types.ACTION_SELECT_TIME_FILTER:
      state = {
        ...state,
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
        currentRoute: null,
      };
      break;
    case Types.ACTION_UPDATE_DEVICES:
      state = {
        ...state,
        devices: action.devices
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
    case Types.ACTION_UPDATE_DEVICE:
      state = {
        ...state,
        devices: state.devices ? [...state.devices] : [],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.device.dongle_id);
      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = populateFetchedAt(action.device);
      } else {
        state.devices.unshift(populateFetchedAt(action.device));
      }
      break;
    case Types.ACTION_UPDATE_ROUTE:
      if (state.routes) {
        state.routes = state.routes.map((route) => {
          if (route.fullname === action.fullname) {
            return {
              ...route,
              ...action.route,
            };
          }
          return route;
        });
      }
      if (state.currentRoute && state.currentRoute.fullname === action.fullname) {
        state.currentRoute = {
          ...state.currentRoute,
          ...action.route,
        };
      }
      break;
    case Types.ACTION_UPDATE_ROUTE_EVENTS:
      const firstFrame = action.events.find((ev) => ev.type === 'event' && ev.data.event_type === 'first_road_camera_frame');
      const videoStartOffset = firstFrame ? firstFrame.route_offset_millis : null;
      if (state.routes) {
        state.routes = state.routes.map((route) => {
          if (route.fullname === action.fullname) {
            return {
              ...route,
              events: action.events,
              videoStartOffset,
            };
          }
          return route;
        });
      }
      if (state.currentRoute && state.currentRoute.fullname === action.fullname) {
        state.currentRoute = {
          ...state.currentRoute,
          events: action.events,
          videoStartOffset,
        };
      }
      break;
    case Types.ACTION_UPDATE_ROUTE_LOCATION:
      if (state.routes) {
        state.routes = state.routes.map((route) => {
          if (route.fullname === action.fullname) {
            return {
              ...route,
              [action.locationKey]: action.location,
            };
          }
          return route;
        });
      }
      if (state.currentRoute && state.currentRoute.fullname === action.fullname) {
        state.currentRoute = {
          ...state.currentRoute,
        };
        state.currentRoute[action.locationKey] = action.location;
      }
      break;
    case Types.ACTION_UPDATE_SHARED_DEVICE:
      if (action.dongleId === state.dongleId) {
        state.device = populateFetchedAt(action.device);
      }
      break;
    case Types.ACTION_UPDATE_DEVICE_ONLINE:
      state = {
        ...state,
        devices: [...state.devices],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.dongleId);

      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = {
          ...state.devices[deviceIndex],
          last_athena_ping: action.last_athena_ping,
          fetched_at: action.fetched_at,
        };
      }

      if (state.device.dongle_id === action.dongleId) {
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
        devices: [...state.devices],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.dongleId);

      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = {
          ...state.devices[deviceIndex],
          network_metered: action.networkMetered,
        };
      }

      if (state.device.dongle_id === action.dongleId) {
        state.device = {
          ...state.device,
          network_metered: action.networkMetered,
        };
      }
      break;
    case Types.ACTION_PRIME_NAV:
      state = {
        ...state,
        primeNav: action.primeNav,
      };
      if (action.primeNav) {
        state.zoom = null;
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
    case Types.TIMELINE_POP_SELECTION:
      if (state.zoom.previous) {
        state.zoom = state.zoom.previous;
      } else {
        state.zoom = null;
        state.loop = null;
      }
      break;
    case Types.TIMELINE_PUSH_SELECTION:
      if (!state.zoom || !action.start || !action.end || action.start < state.zoom.start || action.end > state.zoom.end) {
        state.files = null;
      }
      if (action.start && action.end) {
        state.zoom = {
          start: action.start,
          end: action.end,
          previous: state.zoom,
        };
      } else {
        state.zoom = null;
        state.loop = null;
      }
      break;
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
    case Types.ACTION_ROUTES_METADATA:
      state.routes = action.routes;
      state.routesMeta = {
        dongleId: action.dongleId,
        start: action.start,
        end: action.end,
      };
      break;
    default:
      return state;
  }

  return state;
}

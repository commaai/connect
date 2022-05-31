import {
  ACTION_SELECT_DEVICE,
  ACTION_SELECT_TIME_FILTER,
  ACTION_STARTUP_DATA,
  ACTION_UPDATE_DEVICES,
  ACTION_UPDATE_DEVICE,
  ACTION_UPDATE_ROUTE_EVENTS,
  ACTION_UPDATE_ROUTE_LOCATION,
  ACTION_UPDATE_ROUTE_DRIVE_COORDS,
  ACTION_UPDATE_SHARED_DEVICE,
  ACTION_PRIME_NAV,
  ACTION_PRIME_SUBSCRIPTION,
  ACTION_PRIME_SUBSCRIBE_INFO,
  ACTION_UPDATE_DEVICE_ONLINE,
  ACTION_UPDATE_DEVICE_NETWORK,
  TIMELINE_SELECTION_CHANGED,
  ACTION_FILES_URLS,
  ACTION_FILES_UPDATE,
  ACTION_FILES_UPLOADING,
  ACTION_FILES_CANCELLED_UPLOADS,
} from '../actions/types';
import { emptyDevice } from '../utils';

function populateFetchedAt(d) {
  return {
    ...d,
    fetched_at: parseInt(Date.now() / 1000),
  };
}

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case ACTION_STARTUP_DATA:
      let devices = action.devices.map(populateFetchedAt);
      if (!state.dongleId && devices.length > 0) {
        state = {
          ...state,
          device: devices[0],
        };
      } else {
        state = {
          ...state,
          device: devices.find((device) => device.dongle_id === state.dongleId)
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
    case ACTION_SELECT_DEVICE:
      state = {
        ...state,
        dongleId: action.dongleId,
        primeNav: false,
        subscription: null,
        subscribeInfo: null,
        files: null,
      };
      if (state.devices) {
        const new_device = state.devices.find((device) => device.dongle_id === action.dongleId) || null;
        if (!state.device || state.device.dongle_id !== action.dongleId) {
          state.device = new_device;
        }
      }
      if (state.segmentData && state.segmentData.dongleId !== state.dongleId) {
        state.segmentData = null;
        state.segments = [];
      }
      break;
    case ACTION_SELECT_TIME_FILTER:
      state = {
        ...state,
        filter: {
          start: action.start,
          end: action.end,
        },
        segmentData: null,
        segments: [],
      };
      break;
    case ACTION_UPDATE_DEVICES:
      state = {
        ...state,
        devices: action.devices.map(populateFetchedAt),
      };
      if (state.dongleId) {
        const new_device = state.devices.find((d) => d.dongle_id === state.dongleId);
        if (new_device) {
          state.device = new_device;
        }
      }
      break;
    case ACTION_UPDATE_DEVICE:
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
    case ACTION_UPDATE_ROUTE_EVENTS:
      if (state.segments) {
        state.segments = [...state.segments];
        for (const i in state.segments) {
          if (state.segments[i].route === action.route) {
            state.segments[i] = {
              ...state.segments[i],
              events: action.events,
            }
            break;
          }
        }
      }
      if (state.currentSegment && state.currentSegment.route === action.route) {
        state.currentSegment = {
          ...state.currentSegment,
          events: action.events,
        }
      }
      break;
    case ACTION_UPDATE_ROUTE_LOCATION:
      if (state.segments) {
        state.segments = [...state.segments];
        for (const i in state.segments) {
          if (state.segments[i].route === action.route) {
            state.segments[i] = {
              ...state.segments[i],
            }
            state.segments[i][action.locationKey] = action.location;
            break;
          }
        }
      }
      if (state.currentSegment && state.currentSegment.route === action.route) {
        state.currentSegment = {
          ...state.currentSegment,
        }
        state.currentSegment[action.locationKey] = action.location;
      }
      break;
    case ACTION_UPDATE_ROUTE_DRIVE_COORDS:
      if (state.segments) {
        state.segments = [...state.segments];
        for (const i in state.segments) {
          if (state.segments[i].route === action.route) {
            state.segments[i] = {
              ...state.segments[i],
              driveCoords: action.driveCoords,
            }
            break;
          }
        }
      }
      if (state.currentSegment && state.currentSegment.route === action.route) {
        state.currentSegment = {
          ...state.currentSegment,
          driveCoords: action.driveCoords,
        };
      }
      break;
    case ACTION_UPDATE_SHARED_DEVICE:
      if (action.dongleId === state.dongleId) {
        state.device = populateFetchedAt(action.device);
      }
      break;
    case ACTION_UPDATE_DEVICE_ONLINE:
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
    case ACTION_UPDATE_DEVICE_NETWORK:
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
    case ACTION_PRIME_NAV:
      state = {
        ...state,
        primeNav: action.primeNav,
      };
      if (action.primeNav) {
        state.zoom = null;
      }
      break;
    case ACTION_PRIME_SUBSCRIPTION:
      if (action.dongleId != state.dongleId) { // ignore outdated info
        break;
      }
      state = {
        ...state,
        subscription: action.subscription,
        subscribeInfo: null,
      };
      break;
    case ACTION_PRIME_SUBSCRIBE_INFO:
      if (action.dongleId != state.dongleId) {
        break;
      }
      state = {
        ...state,
        subscribeInfo: action.subscribeInfo,
        subscription: null,
      };
      break;
    case TIMELINE_SELECTION_CHANGED:
      if (!state.zoom || !action.start || !action.end || action.start < state.zoom.start || action.end > state.zoom.end) {
        state.files = null;
      }
      if (action.start && action.end) {
        state.zoom = {
          start: action.start,
          end: action.end,
        };
      } else {
        state.zoom = null;
      }
      break;
    case ACTION_FILES_URLS:
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.urls,
      };
      break;
    case ACTION_FILES_UPDATE:
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.files,
      };
      break;
    case ACTION_FILES_UPLOADING:
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
    case ACTION_FILES_CANCELLED_UPLOADS:
      if (state.files) {
        const cancelFileNames = Object.keys(state.filesUploading)
          .filter((id) => action.ids.includes(id))
          .map((id) => state.filesUploading[id].fileName);
        state.files = Object.keys(state.files)
          .filter((fileName) => !cancelFileNames.includes(fileName))
          .reduce((obj, fileName) => { obj[fileName] = state.files[fileName]; return obj; },  {});
      }
      state.filesUploading = Object.keys(state.filesUploading)
        .filter((id) => !action.ids.includes(id))
        .reduce((obj, id) => { obj[id] = state.filesUploading[id]; return obj; }, {});
      break;
    default:
      return state;
  }

  return state;
}

import { LOCATION_CHANGE } from 'connected-react-router';
import * as Types from '../actions/types';
import { destinationFromUrl } from '../url';
import { emptyDevice } from '../utils';
import { getDefaultFilter, LIMIT_INCREMENT } from '../utils/filter';
import { selectedDrive } from '../timeline/segments';


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

function selectDevice(state, dongleId) {
  if (dongleId === state.dongleId) {
    return state;
  }
  return {
    ...state,
    dongleId,
    device: state.devices?.find((device) => device.dongle_id === dongleId) || null,
    filter: getDefaultFilter(),
    subscription: null,
    subscribeInfo: null,
    files: null,
    limit: LIMIT_INCREMENT,
    routes: null,
    lastRoutes: null,
    drives: {},
  };
}

function patchRoute(state, fullname, patch) {
  const apply = (route) => (route?.fullname === fullname ? { ...route, ...patch } : route);
  return {
    ...state,
    routes: state.routes && state.routes.map(apply),
    lastRoutes: state.lastRoutes && state.lastRoutes.map(apply),
    drives: state.drives[fullname] ? { ...state.drives, [fullname]: apply(state.drives[fullname]) } : state.drives,
    currentRoute: apply(state.currentRoute),
  };
}

function reloadRoutes(state) {
  return {
    ...state,
    lastRoutes: state.routes || state.lastRoutes,
    routes: null,
  };
}

// an unchanged drive and range keep their zoom object, so playback carries on
function selectDrive(state) {
  const { logId, range } = state.nav;
  const currentRoute = (logId && selectedDrive(state)) || null;
  let zoom = currentRoute && { start: 0, end: currentRoute.duration };
  if (zoom && range?.start < zoom.end) zoom = { start: range.start, end: Math.min(range.end, zoom.end) }; // past the end: the whole drive
  const sameDrive = currentRoute?.fullname === state.currentRoute?.fullname;
  if (sameDrive && zoom?.start === state.zoom?.start && zoom?.end === state.zoom?.end) {
    return { ...state, currentRoute };
  }
  const zoomedIn = sameDrive && zoom && state.zoom && zoom.start >= state.zoom.start && zoom.end <= state.zoom.end;
  return {
    ...state,
    currentRoute,
    zoom: zoom || null,
    files: zoomedIn ? state.files : null,
  };
}

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case LOCATION_CHANGE: {
      const nav = destinationFromUrl(action.payload.location);
      state = selectDevice(state, nav.dongleId || state.dongleId);
      state.nav = nav;
      state = selectDrive(state);
      break;
    }
    case Types.ACTION_STARTUP_DATA: {
      const devices = action.devices.map(populateFetchedAt).sort(deviceCompareFn);
      state = selectDevice({ ...state, devices, profile: action.profile }, state.dongleId || action.dongleId);
      state.device = devices.find((device) => device.dongle_id === state.dongleId)
        || (state.dongleId && { ...emptyDevice, dongle_id: state.dongleId });
      break;
    }
    case Types.ACTION_SELECT_TIME_FILTER:
      state = reloadRoutes({ ...state, filter: { start: action.start, end: action.end }, limit: LIMIT_INCREMENT });
      break;
    case Types.ACTION_UPDATE_ROUTE_LIMIT:
      state = reloadRoutes({ ...state, limit: action.limit });
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
      if (!state.dongleId && state.devices.length) { // first device paired
        state = selectDevice(state, state.devices[0].dongle_id);
      }
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
      state = patchRoute(state, action.fullname, action.route);
      break;
    case Types.ACTION_UPDATE_ROUTE_EVENTS: {
      const firstFrame = action.events.find((ev) => ev.type === 'event' && ev.data.event_type === 'first_road_camera_frame');
      const videoStartOffset = firstFrame ? firstFrame.route_offset_millis : null;
      state = patchRoute(state, action.fullname, { events: action.events, videoStartOffset });
      break;
    }
    case Types.ACTION_UPDATE_ROUTE_LOCATION:
      state = patchRoute(state, action.fullname, { [action.locationKey]: action.location });
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
        devices: [...state.devices],
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
        devices: [...state.devices],
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
    case Types.ACTION_URL_NOT_FOUND:
      if (action.nav === state.nav) {
        state.nav = { ...state.nav, page: 'not-found' };
      }
      break;
    case Types.ACTION_DRIVE_METADATA:
      state.drives = { ...state.drives, [action.fullname]: action.route };
      state = selectDrive(state);
      break;
    case Types.ACTION_ROUTES_METADATA:
      if (action.dongleId !== state.dongleId) {
        break;
      }
      // merge existing routes' event and location info with new routes
      state.routes = action.routes.map((route) => {
        const existingRoute = state.lastRoutes ?
          state.lastRoutes.find((r) => r.fullname === route.fullname) : {};
        return {
          ...existingRoute,
          ...route,
        }
      });
      state = selectDrive(state);
      break;
    default:
      return state;
  }

  return state;
}

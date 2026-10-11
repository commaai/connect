import * as Types from '../actions/types';
import { emptyDevice } from '../utils';
import { getDefaultFilter } from '../utils/filter';
import { currentOffset } from '../timeline';
const sameRange = (a, b) => a?.start === b?.start && a?.end === b?.end;

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

function enrichRoute(state, fullname, fields) {
  const existing = state.routeMetadata[fullname];
  if (!existing) return state;
  const route = { ...existing, ...fields };
  return {
    ...state,
    routeMetadata: { ...state.routeMetadata, [fullname]: route },
    routes: state.routes?.some((r) => r.fullname === fullname)
      ? state.routes.map((r) => r.fullname === fullname ? route : r) : state.routes,
    currentRoute: state.currentRoute?.fullname === fullname ? route : state.currentRoute,
  };
}

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case Types.ACTION_STARTUP_DATA: {
      const devices = action.devices.map(populateFetchedAt).sort(deviceCompareFn);
      state.devices = devices;
      state.profile = action.profile;
      state.device = devices.find((device) => device.dongle_id === state.dongleId)
        || (state.dongleId ? { ...emptyDevice, dongle_id: state.dongleId } : null);
      break;
    }
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
      return enrichRoute(_state, action.fullname, action.route);
    case Types.ACTION_UPDATE_ROUTE_EVENTS: {
      const firstFrame = action.events.find((ev) => ev.type === 'event' && ev.data.event_type === 'first_road_camera_frame');
      return enrichRoute(_state, action.fullname, { events: action.events, videoStartOffset: firstFrame?.route_offset_millis ?? null });
    }
    case Types.ACTION_UPDATE_ROUTE_LOCATION:
      return enrichRoute(_state, action.fullname, { [action.locationKey]: action.location });
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
    case Types.ACTION_APPLY_LOCATION: {
      const { dongleId, logId, range, legacyRange } = action.view;
      const deviceChanged = dongleId !== state.dongleId;
      if (deviceChanged) {
        state.dongleId = dongleId;
        state.device = state.devices?.find((device) => device.dongle_id === dongleId) || null;
        state.subscription = null;
        state.subscribeInfo = null;
        state.files = null;
        state.defaultFilter = getDefaultFilter();
        state.routes = null;
        state.lastRoutes = null;
      }
      const filter = action.view.filter || state.defaultFilter;
      if (deviceChanged || !sameRange(state.filter, filter)) {
        state.lastRoutes = state.routes;
        state.filter = filter;
        state.routes = null;
        state.routesMeta = { dongleId: null, start: null, end: null };
        state.limit = 5;
      }
      if (dongleId && !state.limit) state.limit = 5;
      const previous = state.selection;
      const sameSelection = previous && previous.dongleId === state.dongleId && previous.logId === logId
          && sameRange(previous.range, range) && sameRange(previous.legacyRange, legacyRange)
          && previous.filter === state.filter;
      const route = state.routeMetadata[`${dongleId}|${logId}`] || null;
      if (sameSelection && state.currentRoute === route) return _state;
      if (!sameSelection) state.selection = { dongleId, logId, range, legacyRange, filter: state.filter };
      const changedDrive = deviceChanged || state.selectedRouteId !== logId;
      state.selectedRouteId = logId;
      if (changedDrive) state.routeError = null;
      state.currentRoute = route;
      const zoom = range || (state.currentRoute ? { start: 0, end: state.currentRoute.duration } : null);
      if (changedDrive || state.zoom?.start !== zoom?.start || state.zoom?.end !== zoom?.end) {
        state.zoom = zoom;
        state.loop = zoom ? { startTime: zoom.start, duration: zoom.end - zoom.start } : null;
        const offset = currentOffset(_state);
        if (!changedDrive && zoom && (offset < zoom.start || offset >= zoom.end)) {
          state.offset = zoom.start;
          state.startTime = Date.now();
        }
      }
      if (changedDrive) {
        state.offset = state.zoom?.start ?? 0;
        state.startTime = Date.now();
        state.isBufferingVideo = true;
      }
      break;
    }
    case Types.ACTION_FILES_URLS:
      if (action.dongleId !== state.dongleId) return _state;
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.urls,
      };
      break;
    case Types.ACTION_FILES_UPDATE:
      if (action.dongleId !== state.dongleId) return _state;
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.files,
      };
      break;
    case Types.ACTION_FILES_UPLOADING:
      state.uploadQueues = { ...state.uploadQueues, [action.dongleId]: action.uploading };
      if (action.dongleId !== state.dongleId) break;
      if (Object.keys(action.files).length) {
        state.files = {
          ...(state.files !== null ? { ...state.files } : {}),
          ...action.files,
        };
      }
      break;
    case Types.ACTION_FILES_CANCELLED_UPLOADS: {
      const queue = state.uploadQueues?.[action.dongleId];
      if (queue) state.uploadQueues = { ...state.uploadQueues, [action.dongleId]: Object.fromEntries(Object.entries(queue).filter(([id]) => !action.ids.includes(id))) };
      if (action.dongleId !== state.dongleId) break;
      if (state.files) {
        const cancelFileNames = Object.keys(queue || {})
          .filter((id) => action.ids.includes(id))
          .map((id) => queue[id].fileName);
        state.files = Object.keys(state.files)
          .filter((fileName) => !cancelFileNames.includes(fileName))
          .reduce((obj, fileName) => { obj[fileName] = state.files[fileName]; return obj; }, {});
      }
      break;
    }
    case Types.ACTION_ROUTE_ERROR:
      state.routeError = action.error;
      break;
    case Types.ACTION_ROUTES_METADATA: {
      let metadata = state.routeMetadata;
      const routes = action.routes.map((route) => {
        const existing = metadata[route.fullname];
        const merged = existing && !action.active ? existing : { ...existing, ...route };
        if (merged !== existing) {
          if (metadata === state.routeMetadata) metadata = { ...metadata };
          metadata[route.fullname] = merged;
        }
        return merged;
      });
      state.routeMetadata = metadata;
      if (action.kind === 'dashboard' && action.active && state.dongleId === action.dongleId) {
        state.routes = routes;
        state.routesMeta = { dongleId: action.dongleId, start: action.start, end: action.end, limit: action.limit };
      }
      if (action.kind === 'drive' && action.active && !routes.length) state.routeError = 'Route does not exist.';
      break;
    }
    default:
      return state;
  }

  return state;
}

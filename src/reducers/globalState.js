import * as Types from '../actions/types';
import { emptyDevice } from '../utils';
import { getDefaultFilter } from '../utils/filter';

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

function routeListKey(dongleId, filter, limit) {
  return `${dongleId}|${filter.start}|${filter.end}|${limit}`;
}

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
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
      state.startupComplete = true;
      break;
    }
    case Types.ACTION_SYNC_URL: {
      const destination = action.destination;
      const preserveDevice = ['home', 'referrals'].includes(destination.page);
      const dongleId = destination.dongleId || (preserveDevice ? state.dongleId : null);
      const deviceChanged = dongleId !== state.dongleId;
      const nextFilter = destination.filter || getDefaultFilter();
      const filterChanged = nextFilter.start !== state.filter.start || nextFilter.end !== state.filter.end;
      const selectedRouteId = destination.page === 'drive' ? destination.logId : null;
      const routeLists = { ...state.routeLists };
      if (state.routes && state.routesMeta?.dongleId && state.routesMeta.limit != null) {
        routeLists[routeListKey(state.routesMeta.dongleId, state.filter, state.routesMeta.limit)] = {
          routes: state.routes,
          meta: state.routesMeta,
        };
      }
      const cachedList = dongleId
        ? Object.values(routeLists)
          .filter(({ meta }) => meta.dongleId === dongleId
            && meta.start <= nextFilter.start && meta.end >= nextFilter.end)
          .sort((a, b) => b.meta.limit - a.meta.limit)[0]
        : null;
      const routes = deviceChanged || filterChanged
        ? (cachedList?.routes || null)
        : state.routes;
      const routesMeta = deviceChanged || filterChanged
        ? (cachedList?.meta || { dongleId: null, start: null, end: null, limit: null })
        : state.routesMeta;
      const currentRoute = state.routeDetails?.[`${dongleId}|${selectedRouteId}`]
        || routes?.find((route) => route.log_id === selectedRouteId)
        || null;
      const nextZoom = destination.page === 'drive'
        ? (destination.range || (currentRoute ? { start: 0, end: currentRoute.duration } : null))
        : null;
      const selectionChanged = deviceChanged || selectedRouteId !== state.selectedRouteId
        || nextZoom?.start !== state.zoom?.start || nextZoom?.end !== state.zoom?.end;

      state = {
        ...state,
        navigation: destination,
        dongleId,
        device: deviceChanged
          ? (state.devices?.find((device) => device.dongle_id === dongleId) || null)
          : state.device,
        subscription: deviceChanged ? null : state.subscription,
        subscribeInfo: deviceChanged ? null : state.subscribeInfo,
        filter: nextFilter,
        routes,
        lastRoutes: deviceChanged ? null : (filterChanged ? state.routes : state.lastRoutes),
        routesMeta,
        routeLists,
        files: selectionChanged ? null : state.files,
        filesUploading: deviceChanged ? {} : state.filesUploading,
        filesUploadingMeta: deviceChanged ? { dongleId: null, fetchedAt: null } : state.filesUploadingMeta,
        selectedRouteId,
        currentRoute,
        zoom: nextZoom,
        loop: selectionChanged && nextZoom
          ? { startTime: nextZoom.start, duration: nextZoom.end - nextZoom.start }
          : (selectionChanged ? null : state.loop),
        limit: deviceChanged || filterChanged ? (cachedList?.meta.limit || 0) : state.limit,
        ...(selectionChanged ? { desiredPlaySpeed: 1, isBufferingVideo: true, offset: null, startTime: Date.now() } : {}),
      };

      break;
    }
    case Types.ACTION_ROUTE_DETAIL: {
      const logId = action.route?.log_id || action.logId;
      const key = `${action.dongleId}|${logId}`;
      state = {
        ...state,
        routeDetails: { ...state.routeDetails, [key]: action.route },
      };
      if (action.route && state.dongleId === action.dongleId && state.selectedRouteId === action.route.log_id) {
        const zoom = state.navigation?.range || { start: 0, end: action.route.duration };
        state.currentRoute = action.route;
        state.zoom = zoom;
        if (!state.loop || state.loop.startTime !== zoom.start || state.loop.duration !== zoom.end - zoom.start) {
          state.loop = { startTime: zoom.start, duration: zoom.end - zoom.start };
        }
      }
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
    case Types.ACTION_UPDATE_ROUTE_EVENTS: {
      const firstFrame = action.events.find((ev) => ev.type === 'event' && ev.data.event_type === 'first_road_camera_frame');
      const videoStartOffset = firstFrame ? firstFrame.route_offset_millis : null;
      eventsMap[action.fullname] = {
        events: action.events,
        videoStartOffset,
      }
      if (state.routes) {
        state.routes = state.routes.map((route) => {
          const ev = eventsMap[route.fullname];
          if (ev) {
            return {
              ...route,
              events: ev.events,
              videoStartOffset: ev.videoStartOffset,
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
    }
    case Types.ACTION_UPDATE_ROUTE_LOCATION: {
      locationMap[action.fullname] = {
        location: action.location,
        locationKey: action.locationKey,
      }
      if (state.routes) {
        state.routes = state.routes.map((route) => {
          const loc = locationMap[route.fullname];
          if (loc) {
            return {
              ...route,
              [loc.locationKey]: loc.location,
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
    }
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

      if (state.device.dongle_id === action.dongleId) {
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
    case Types.ACTION_ROUTES_METADATA:
      // merge existing routes' event and location info with new routes
      state.routes = action.routes.map((route) => {
        const cache = state.routeLists?.[routeListKey(action.dongleId, state.filter, action.limit)];
        const existingRoutes = state.lastRoutes || cache?.routes;
        const existingRoute = existingRoutes
          ? existingRoutes.find((r) => r.fullname === route.fullname) : {};
        return {
          ...existingRoute,
          ...route,
        }
      });
      state.routesMeta = {
        dongleId: action.dongleId,
        start: action.start,
        end: action.end,
        limit: action.limit,
      };
      state.routeLists = {
        ...state.routeLists,
        [routeListKey(action.dongleId, state.filter, action.limit)]: {
          routes: state.routes,
          meta: state.routesMeta,
        },
      };
      if (!state.currentRoute && state.selectedRouteId) {
        const curr = state.routes?.find((route) => route.log_id === state.selectedRouteId);
        if (curr) {
          state.currentRoute = {
            ...curr,
          };
          if (!state.zoom) {
            state.zoom = {
              start: 0,
              end: state.currentRoute.duration,
            };
          }

          if (!state.loop || !state.loop.startTime || !state.loop.duration) {
            state.loop = {
              startTime: state.zoom.start,
              duration: state.zoom.end - state.zoom.start,
            };
          }
        }
      }
      break;
    default:
      return state;
  }

  return state;
}

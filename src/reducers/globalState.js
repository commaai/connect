import { LOCATION_CHANGE } from 'connected-react-router';
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

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case LOCATION_CHANGE:
      if (action.payload.navigation) state.navigation = action.payload.navigation;
      break;
    case 'ROUTE_LOAD':
      if (action.dongleId === state.dongleId && action.routeId === state.selectedRouteId) {
        state.routeLoad = { dongleId: action.dongleId, routeId: action.routeId, status: action.status, error: action.error };
      }
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
    case Types.ACTION_SELECT_DEVICE: {
      if (action.dongleId === state.dongleId) return _state;
      const deviceViews = { ...state.deviceViews };
      if (state.dongleId) {
        deviceViews[state.dongleId] = {
          filter: state.filter, routes: state.routes, routesMeta: state.routesMeta,
          lastRoutes: state.lastRoutes, limit: state.limit, files: state.files,
          subscription: state.subscription, subscribeInfo: state.subscribeInfo,
        };
      }
      const saved = deviceViews[action.dongleId];
      state = {
        ...state,
        filter: getDefaultFilter(), routes: null, lastRoutes: null,
        routesMeta: { dongleId: null, start: null, end: null },
        limit: 0, files: null, subscription: null, subscribeInfo: null,
        ...saved,
        deviceViews,
        dongleId: action.dongleId,
        device: state.devices?.find((device) => device.dongle_id === action.dongleId)
          || { ...emptyDevice, dongle_id: action.dongleId },
        primeNav: false, streamNav: false,
        selectedRouteId: null, currentRoute: null, zoom: null, loop: null, routeLoad: null,
      };
      break;
    }
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
        currentRoute: null,
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
      if (state.routeDetails?.[action.fullname]) state.routeDetails = {
        ...state.routeDetails, [action.fullname]: { ...state.routeDetails[action.fullname], ...action.route },
      };
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
      eventsMap[action.fullname] = { events: action.events, videoStartOffset };
      if (state.routeDetails?.[action.fullname]) state.routeDetails = {
        ...state.routeDetails, [action.fullname]: { ...state.routeDetails[action.fullname], ...eventsMap[action.fullname] },
      };
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
      locationMap[action.fullname] = { location: action.location, locationKey: action.locationKey };
      if (state.routeDetails?.[action.fullname]) state.routeDetails = {
        ...state.routeDetails, [action.fullname]: { ...state.routeDetails[action.fullname], [action.locationKey]: action.location },
      };
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
    case Types.ACTION_PRIME_NAV:
      state = {
        ...state,
        primeNav: action.primeNav,
      };
      if (action.primeNav) {
        state.zoom = null;
      }
      break;
    case Types.ACTION_STREAM_NAV:
      state = {
        ...state,
        streamNav: action.streamNav,
      };
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
    case Types.TIMELINE_PUSH_SELECTION: {
      const changedRoute = state.selectedRouteId !== action.log_id;
      const previousZoom = state.routeLoad?.status === 'invalid' ? null : state.zoom;
      if (changedRoute) state.files = null;
      state.selectedRouteId = action.log_id;
      state.currentRoute = state.routes?.find((route) => route.log_id === action.log_id)
        || state.routeDetails?.[`${state.dongleId}|${action.log_id}`] || null;
      state.routeLoad = action.log_id ? {
        dongleId: state.dongleId, routeId: action.log_id,
        status: state.currentRoute ? 'ready' : 'loading', error: null,
      } : null;
      if (action.log_id) {
        const start = action.start ?? (state.currentRoute ? 0 : null);
        const end = action.end ?? state.currentRoute?.duration ?? null;
        const previous = changedRoute ? null : previousZoom;
        let ancestor = previous?.previous;
        while (ancestor && (ancestor.start !== start || ancestor.end !== end)) ancestor = ancestor.previous;
        if (ancestor) {
          // Going back to an earlier selection unwinds its chain. Adding the
          // current selection again would make the Back button toggle forever.
          state.zoom = ancestor;
        } else {
          state.zoom = start != null && end != null ? { start, end, previous } : null;
        }
        if (action.start == null || action.end == null) state.loop = null;
        if (state.currentRoute && state.zoom && state.zoom.end > state.currentRoute.duration) {
          state.currentRoute = null;
          state.routeLoad = { ...state.routeLoad, status: 'invalid', error: 'This time range is outside the drive.' };
        }
      } else {
        state.zoom = null;
        state.loop = null;
      }
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
      const routeDetails = { ...state.routeDetails };
      const routes = action.routes.map((route) => {
        const previous = routeDetails[route.fullname] || state.lastRoutes?.find((item) => item.fullname === route.fullname);
        const enriched = { ...previous, ...route, ...eventsMap[route.fullname] };
        const location = locationMap[route.fullname];
        if (location) enriched[location.locationKey] = location.location;
        routeDetails[route.fullname] = enriched;
        return enriched;
      });
      // Metadata is small, but keep historical details bounded in long sessions.
      const keys = Object.keys(routeDetails);
      for (const key of keys.slice(0, Math.max(0, keys.length - 100))) delete routeDetails[key];
      state.routeDetails = routeDetails;
      if (action.dongleId !== state.dongleId) break;
      if (!action.routeId && action.start === state.filter.start && action.end === state.filter.end
        && (action.limit == null || action.limit === state.limit)) {
        state.routes = routes;
        state.routesMeta = { dongleId: action.dongleId, start: action.start, end: action.end, limit: action.limit };
      }
      if (state.selectedRouteId && (!action.routeId || action.routeId === state.selectedRouteId)) {
        const current = routeDetails[`${state.dongleId}|${state.selectedRouteId}`];
        if (current) {
          state.currentRoute = current;
          if (!state.zoom) state.zoom = { start: 0, end: current.duration };
          const invalidRange = state.zoom.end > current.duration;
          state.routeLoad = {
            dongleId: state.dongleId, routeId: state.selectedRouteId,
            status: invalidRange ? 'invalid' : 'ready', error: invalidRange ? 'This time range is outside the drive.' : null,
          };
          if (invalidRange) state.currentRoute = null;
          else if (!state.loop) state.loop = { startTime: state.zoom.start, duration: state.zoom.end - state.zoom.start };
        } else if (action.routeId === state.selectedRouteId) {
          state.routeLoad = { dongleId: state.dongleId, routeId: state.selectedRouteId, status: 'missing', error: null };
        }
      }
      break;
    }
    default:
      return state;
  }

  return state;
}

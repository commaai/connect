import * as Types from '../actions/types';
import { emptyDevice } from '../utils';

const eventsMap = {};
const locationMap = {};

function populateFetchedAt(d) {
  return {
    ...d,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}

export default function reducer(_state, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case Types.ACTION_APPLY_DESTINATION: {
      const {
        kind, dongleId, logId, start, end,
      } = action.destination;
      const deviceChanged = state.dongleId !== dongleId;

      state = {
        ...state,
        destinationKind: kind,
        dongleId: dongleId ?? null,
        deviceNotFound: false,
        primeNav: kind === 'prime',
        streamNav: kind === 'stream',
        settingsOpen: kind === 'settings',
      };

      // Invalidate device-scoped data only when the device actually changes.
      // User-scoped state (the date filter, playback speed, drawer) is reused.
      if (deviceChanged) {
        const listed = state.devices?.find((candidate) => candidate.dongle_id === dongleId);
        const shared = state.sharedDevice?.dongle_id === dongleId ? state.sharedDevice : null;
        state = {
          ...state,
          device: listed || shared || null,
          subscription: null,
          subscribeInfo: null,
          files: null,
          routes: null,
          lastRoutes: null,
          routesMeta: {
            dongleId: null,
            start: null,
            end: null,
          },
          limit: 0,
        };
      }

      // Resolve the route only after any device-scoped data was invalidated, so
      // a drive link can never pick up the previous device's route.
      const route = (logId && !deviceChanged && state.routes)
        ? state.routes.find((candidate) => candidate.log_id === logId)
        : null;

      if (kind === 'drive') {
        const zoom = start != null && end != null
          ? { start, end }
          : (route ? { start: 0, end: route.duration } : null);
        state = {
          ...state,
          selectedRouteId: logId,
          currentRoute: route || null,
          zoom,
          loop: zoom ? { startTime: zoom.start, duration: zoom.end - zoom.start } : null,
        };
      } else {
        state = {
          ...state,
          selectedRouteId: null,
          currentRoute: null,
          zoom: null,
          loop: null,
        };
      }
      break;
    }
    case Types.ACTION_DEVICE_NOT_FOUND:
      state = {
        ...state,
        destinationKind: 'not-found',
        dongleId: action.dongleId ?? null,
        deviceNotFound: true,
        device: null,
      };
      break;
    case Types.ACTION_STARTUP_DATA: {
      const devices = action.devices.map(populateFetchedAt);

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
          .map(populateFetchedAt),
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
      // The device may be selected without being in the owned list (a shared device).
      const isSelected = state.dongleId === action.device.dongle_id
        || state.device?.dongle_id === action.device.dongle_id;
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
      // A shared device that isn't in the owned list is kept aside so it can
      // back `state.device` without appearing in the drawer.
      state.sharedDevice = populateFetchedAt(action.device);
      if (action.dongleId === state.dongleId) {
        state.device = state.sharedDevice;
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
    case Types.ACTION_ROUTES_METADATA:
      // merge existing routes' event and location info with new routes
      state.routes = action.routes.map((route) => {
        const existingRoute = state.lastRoutes ?
          state.lastRoutes.find((r) => r.fullname === route.fullname) : {};
        return {
          ...existingRoute,
          ...route,
        }
      });
      state.routesMeta = {
        dongleId: action.dongleId,
        start: action.start,
        end: action.end,
        // True when this load was restricted to a single route, so a later list
        // view knows to reload the full range.
        routeOnly: action.routeOnly === true,
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

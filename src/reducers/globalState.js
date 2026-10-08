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
    case Types.ACTION_APPLY_DESTINATION: {
      const { dongleId, page, drive, modal, modalDevice } = action.destination;
      const deviceChanged = state.dongleId !== dongleId;
      const routeChanged = !!drive && state.selectedRouteId !== drive.logId;
      const prevLoop = state.loop;
      state.dongleId = dongleId;
      state.deviceNotFound = false;
      state.primeNav = page === 'prime';
      state.streamNav = page === 'stream';
      state.referralsNav = page === 'referrals';
      state.modal = modal ? { name: modal, dongleId: modalDevice ?? dongleId } : null;
      if (deviceChanged) {
        state.device = state.devices?.find((device) => device.dongle_id === dongleId) || null;
        state.subscription = null;
        state.subscribeInfo = null;
        state.files = null;
        state.routes = null;
        state.lastRoutes = null;
        state.limit = 0;
        state.routesMeta = { dongleId: null, start: null, end: null };
        state.filter = getDefaultFilter();
        state.selectedRouteId = null;
        state.currentRoute = null;
        state.zoom = null;
        state.loop = null;
      }

      // state.urlRange mirrors what the URL describes; state.zoom is the
      // resolved millisecond range and keeps its drill history in .previous.
      state.urlRange = drive ? { logId: drive.logId, start: drive.start, end: drive.end } : null;
      state.missingRouteId = null;
      if (!drive) {
        // a non-drive URL names no route — the open drive goes away
        state.selectedRouteId = null;
        state.currentRoute = null;
        state.zoom = null;
        state.loop = null;
        state.files = null;
      } else {
        // keep the resolved route across list refreshes that lack it
        const route = state.routes?.find((candidate) => candidate.log_id === drive.logId)
          || (state.currentRoute?.log_id === drive.logId ? state.currentRoute : null);
        const routeFrame = route ? { start: 0, end: route.duration } : null;
        let newStart = drive.start ?? 0;
        let newEnd = drive.end ?? routeFrame?.end ?? null;
        if (routeFrame) {
          // a URL can name a range past the drive's end; clamp it
          if (newStart >= routeFrame.end) {
            newStart = 0;
            newEnd = routeFrame.end;
          } else {
            newEnd = Math.min(newEnd ?? routeFrame.end, routeFrame.end);
          }
        }
        state.selectedRouteId = drive.logId;
        state.currentRoute = route || null;
        if (routeChanged) state.files = null;
        if (newEnd == null) {
          state.zoom = null;
          state.loop = null;
        } else {
          const prevZoom = state.zoom;
          const sameBounds = prevZoom?.start === newStart && prevZoom?.end === newEnd;
          // a pop may land deeper than one level; walk the whole chain so the
          // ancestor frame is restored with its own history intact
          let ancestor = routeChanged ? null : prevZoom;
          while (ancestor && (ancestor.start !== newStart || ancestor.end !== newEnd)) {
            ancestor = ancestor.previous;
          }
          state.zoom = sameBounds ? prevZoom
            : ancestor ?? {
              start: newStart,
              end: newEnd,
              previous: prevZoom && !routeChanged && newStart >= prevZoom.start && newEnd <= prevZoom.end
                ? prevZoom : routeFrame,
            };
          state.loop = { startTime: state.zoom.start, duration: state.zoom.end - state.zoom.start };
        }
      }

      if (state.loop && (routeChanged
        || prevLoop?.startTime !== state.loop.startTime || prevLoop?.duration !== state.loop.duration)) {
        // the URL moved playback to a new range; restart at the range start.
        // speed only resets when the route itself changes.
        if (routeChanged) state.desiredPlaySpeed = 1;
        state.isBufferingVideo = true;
        state.offset = state.loop.startTime;
        state.startTime = Date.now();
      }
      break;
    }
    case Types.ACTION_DEVICE_NOT_FOUND:
      state.deviceNotFound = true;
      state.device = null;
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

      if (isSelected || state.dongleId === action.device.dongle_id) {
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
      if (action.dongleId !== state.dongleId) break;
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.urls,
      };
      break;
    case Types.ACTION_FILES_UPDATE:
      if (action.dongleId !== state.dongleId) break;
      state.files = {
        ...(state.files !== null ? { ...state.files } : {}),
        ...action.files,
      };
      break;
    case Types.ACTION_FILES_UPLOADING:
      if (action.dongleId !== state.dongleId
          && state.modal?.dongleId !== action.dongleId) break;
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
      if (action.dongleId !== state.dongleId
          && state.modal?.dongleId !== action.dongleId) break;
      if (state.files) {
        const cancelFileNames = Object.keys(state.filesUploading || {})
          .filter((id) => action.ids.includes(id))
          .map((id) => state.filesUploading[id].fileName);
        state.files = Object.keys(state.files)
          .filter((fileName) => !cancelFileNames.includes(fileName))
          .reduce((obj, fileName) => { obj[fileName] = state.files[fileName]; return obj; }, {});
      }
      state.filesUploading = Object.keys(state.filesUploading || {})
        .filter((id) => !action.ids.includes(id))
        .reduce((obj, id) => { obj[id] = state.filesUploading[id]; return obj; }, {});
      break;
    case Types.ACTION_ROUTES_METADATA: {
      // merge existing routes' event and location info into incoming routes
      const incoming = action.routes.map((route) => {
        const existingRoute = (state.routes || state.lastRoutes || [])
          .find((r) => r.fullname === route.fullname) || {};
        return { ...existingRoute, ...route };
      });
      if (action.logId) {
        // a drive-scoped fetch augments the cached list; it never replaces it
        // or claims to cover the filter range
        const known = new Map((state.routes || []).map((r) => [r.fullname, r]));
        incoming.forEach((route) => known.set(route.fullname, route));
        state.routes = [...known.values()];
        state.missingRouteId = incoming.length ? null : action.logId;
      } else {
        state.routes = incoming;
        state.routesMeta = {
          dongleId: action.dongleId,
          start: action.start,
          end: action.end,
        };
      }
      if (!state.currentRoute && state.selectedRouteId) {
        const curr = state.routes?.find((route) => route.log_id === state.selectedRouteId);
        if (curr) {
          state.currentRoute = {
            ...curr,
          };
          state.missingRouteId = null;
          if (!state.zoom || state.zoom.start >= curr.duration || state.zoom.end > curr.duration) {
            // the url range predates the route's resolved duration; clamp it,
            // and rebuild the loop so it mirrors the zoom it describes
            const zoomStart = Math.min(state.zoom?.start ?? 0, curr.duration);
            const zoomEnd = Math.min(state.zoom?.end ?? curr.duration, curr.duration);
            state.zoom = zoomStart < zoomEnd ? { start: zoomStart, end: zoomEnd } : { start: 0, end: curr.duration };
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

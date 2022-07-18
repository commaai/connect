import * as Types from '../actions/types';
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
    case Types.ACTION_STARTUP_DATA:
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
    case Types.ACTION_SELECT_DEVICE:
      state = {
        ...state,
        dongleId: action.dongleId,
        primeNav: false,
        subscription: null,
        subscribeInfo: null,
        files: null,
        clips: null,
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
    case Types.ACTION_SELECT_TIME_FILTER:
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
    case Types.ACTION_UPDATE_DEVICES:
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
    case Types.ACTION_UPDATE_ROUTE_EVENTS:
      const firstFrame = action.events.find((ev) => ev.type === 'event' && ev.data.event_type === 'first_road_camera_frame');
      const videoStartOffset = firstFrame ? firstFrame.route_offset_millis : null;
      if (state.segments) {
        state.segments = [...state.segments];
        for (const i in state.segments) {
          if (state.segments[i].route === action.route) {
            state.segments[i] = {
              ...state.segments[i],
              events: action.events,
              videoStartOffset,
            }
            break;
          }
        }
      }
      if (state.currentSegment && state.currentSegment.route === action.route) {
        state.currentSegment = {
          ...state.currentSegment,
          events: action.events,
          videoStartOffset,
        }
      }
      break;
    case Types.ACTION_UPDATE_ROUTE_LOCATION:
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
    case Types.ACTION_UPDATE_ROUTE_DRIVE_COORDS:
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
        state.clips = null;
        state.zoom = null;
      }
      break;
    case Types.ACTION_PRIME_SUBSCRIPTION:
      if (action.dongleId != state.dongleId) { // ignore outdated info
        break;
      }
      state = {
        ...state,
        subscription: action.subscription,
        subscribeInfo: null,
      };
      break;
    case Types.ACTION_PRIME_SUBSCRIBE_INFO:
      if (action.dongleId != state.dongleId) {
        break;
      }
      state = {
        ...state,
        subscribeInfo: action.subscribeInfo,
        subscription: null,
      };
      break;
    case Types.TIMELINE_SELECTION_CHANGED:
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
          .reduce((obj, fileName) => { obj[fileName] = state.files[fileName]; return obj; },  {});
      }
      state.filesUploading = Object.keys(state.filesUploading)
        .filter((id) => !action.ids.includes(id))
        .reduce((obj, id) => { obj[id] = state.filesUploading[id]; return obj; }, {});
      break;
    case Types.ACTION_CLIPS_EXIT:
      if (state.clips && state.clips.state === 'create') {
        if (state.zoom) {
          state.loop = {
            startTime: state.zoom.start,
            duration: state.zoom.end - state.zoom.start,
          };
        } else {
          state.loop = null;
        }
      }

      if (state.clips && state.clips.state !== 'list' && state.clips.list && state.clips.list.length) {
        state.clips = {
          state: 'list',
          dongleId: state.clips.dongleId,
          list: state.clips.list,
        };
      } else {
        state.clips = null;
      }
      break;
    case Types.ACTION_CLIPS_LOADING:
      state.clips = {
        state: 'loading',
        dongleId: action.dongleId,
      };
      break;
    case Types.ACTION_CLIPS_LIST:
      let clipList = null;
      if (action.list) {
        clipList = action.list.map((c) => ({
          clip_id: c.id,
          dongle_id: c.dongle_id,
          create_time: c.create_time,
          route_name: c.route_name,
          start_time: c.start_time,
          end_time: c.end_time,
          status: c.status,
          title: c.title,
          video_type: c.video_type,
          is_public: c.is_public,
          thumbnail: c.thumbnail,
        }));
      }
      state.clips = {
        state: 'list',
        dongleId: action.dongleId,
        list: clipList,
      };
      break;
    case Types.ACTION_CLIPS_INIT:
      state.clips = {
        state: 'create',
        dongleId: action.dongleId,
        route: action.route,
      };
      break;
    case Types.ACTION_CLIPS_CREATE:
      state.clips = {
        ...state.clips,
        state: 'upload',
        clip_id: action.clip_id,
        start_time: action.start_time,
        end_time: action.end_time,
        video_type: action.video_type,
        title: action.title,
        route: action.route,
        pending_status: action.pending_status,
        pending_progress: action.pending_progress,
      };
      break;
    case Types.ACTION_CLIPS_DONE:
      state.clips = {
        ...state.clips,
        state: 'done',
        clip_id: action.clip_id,
        start_time: action.start_time,
        end_time: action.end_time,
        video_type: action.video_type,
        title: action.title,
        route: action.route,
        url: action.url,
        is_public: action.is_public,
        thumbnail: action.thumbnail,
      };
      break;
    case Types.ACTION_CLIPS_UPDATE:
      state.clips = {
        ...state.clips,
        is_public: action.is_public,
      };
      break;
    case Types.ACTION_CLIPS_DELETE:
      if (state.clips?.list?.length) {
        state.clips = {
          ...state.clips,
          list: state.clips?.list.filter((c) => c.clip_id !== action.clip_id),
        };
      }
      break;
    case Types.ACTION_CLIPS_ERROR:
      state.clips = {
        state: 'error',
        clip_id: action.clip_id,
        error: action.error,
      };
      break;
    default:
      return state;
  }

  return state;
}

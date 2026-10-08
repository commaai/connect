import * as Sentry from '@sentry/react';
import { athena as Athena } from '../api';
import { api } from '../api/backend';

import { updateDeviceOnline, fetchDeviceNetworkStatus } from '.';
import * as Types from './types';
import { deviceOnCellular, getDeviceFromState, deviceVersionAtLeast, asyncSleep } from '../utils';

export const FILE_NAMES = {
  qcameras: ['qcamera.ts'],
  cameras: ['fcamera.hevc'],
  dcameras: ['dcamera.hevc'],
  ecameras: ['ecamera.hevc'],
  qlogs: ['qlog.bz2', 'qlog.zst'],
  logs: ['rlog.bz2', 'rlog.zst'],
};
const MAX_OPEN_REQUESTS = 15;
const MAX_RETRIES = 5;

// connect uploads should be high priority as they are user requested (lower is higher)
const HIGH_PRIORITY = 0;

let uploadQueueTimeout = null;
let uploadQueueGeneration = 0;
let uploadQueueDongleId = null;
let openRequests = 0;

function pathToFileName(dongleId, path) {
  const [seg, fileType] = path.split('/');
  const type = Object.entries(FILE_NAMES).find((e) => e[1].includes(fileType))[0];
  return `${dongleId}|${seg}/${type}`;
}

async function athenaCall(dongleId, payload, sentryFingerprint, retryCount = 0) {
  try {
    while (openRequests > MAX_OPEN_REQUESTS) {
      // eslint-disable-next-line no-await-in-loop
      await asyncSleep(2000);
    }
    openRequests += 1;
    const resp = await Athena.postJsonRpcPayload(dongleId, payload);
    openRequests -= 1;
    return resp;
  } catch (err) {
    openRequests -= 1;
    if (!err.resp && retryCount < MAX_RETRIES) {
      await asyncSleep(2000);
      return athenaCall(dongleId, payload, sentryFingerprint, retryCount + 1);
    }
    if (err.message && (err.message.indexOf('Timed out') === -1
      || err.message.indexOf('Device not registered') === -1)) {
      return { offline: true };
    }
    console.error(err);
    Sentry.captureException(err, { fingerprint: sentryFingerprint });
    return { error: err.message };
  }
}

export function setRouteViewed(dongleId, route) {
  return async (dispatch, getState) => {
    const { device } = getState();
    if (!deviceVersionAtLeast(device, '0.9.6')) {
      return;
    }

    const payload = {
      id: 0,
      jsonrpc: '2.0',
      method: 'setRouteViewed',
      params: { route },
    };
    await athenaCall(dongleId, payload, 'action_files_set_route_viewed');
  };
}

export async function fetchUploadUrls(dongleId, paths) {
  try {
    const resp = await api.routes.getUploadUrls(dongleId, paths, 7);
    if (resp && !resp.error) {
      return resp.map((r) => r.url);
    }
  } catch (err) {
    console.error(err);
    Sentry.captureException(err, { fingerprint: 'action_files_upload_geturls' });
  }
  return null;
}

export function updateFiles(files) {
  return (dispatch, getState) => {
    const { dongleId } = getState();
    dispatch({
      type: Types.ACTION_FILES_UPDATE,
      dongleId,
      files,
    });
  };
}

export function fetchFiles(routeName, nocache = false) {
  return async (dispatch, getState) => {
    let files;
    try {
      files = await api.routes.getRouteFiles(routeName, nocache);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'action_files_fetch_files' });
      return { error: 'Unable to load files. Try again.' };
    }

    if (!files || typeof files !== 'object' || Array.isArray(files) || files.error) {
      return { error: 'Unable to load files. Try again.' };
    }
    const dongleId = routeName.split('|')[0];
    const urls = {};
    for (const type of Object.keys(FILE_NAMES)) {
      if (!Array.isArray(files[type])) continue;
      for (const file of files[type]) {
        if (typeof file !== 'string') continue;
        let asset;
        try {
          asset = new URL(file);
        } catch {
          continue;
        }
        if (!['https:', 'http:'].includes(asset.protocol)) continue;
        const parts = asset.pathname.split('/');
        const segment = parts[parts.length - 2];
        if (!parts[parts.length - 1] || !/^\d+$/.test(segment) || !Number.isSafeInteger(Number(segment))) continue;
        // Demo routes retain public asset URLs with a different route name.
        // The asset path determines its segment; Redux keys use the requested route.
        urls[`${routeName}--${Number(segment)}/${type}`] = { url: file };
      }
    }

    if (getState().dongleId !== dongleId) return { urls };
    dispatch({ type: Types.ACTION_FILES_URLS, dongleId, urls });
    return { urls };
  };
}

export function cancelFetchUploadQueue() {
  uploadQueueGeneration += 1;
  uploadQueueDongleId = null;
  if (uploadQueueTimeout) {
    if (uploadQueueTimeout !== true) {
      clearTimeout(uploadQueueTimeout);
    }
    uploadQueueTimeout = null;
  }
}

export function fetchUploadQueue(dongleId) {
  return async (dispatch, getState) => {
    if (uploadQueueTimeout && uploadQueueDongleId === dongleId) return;
    if (uploadQueueDongleId !== dongleId) cancelFetchUploadQueue();
    const generation = uploadQueueGeneration;
    uploadQueueDongleId = dongleId;
    uploadQueueTimeout = true;

    dispatch(fetchDeviceNetworkStatus(dongleId));

    const payload = {
      method: 'listUploadQueue',
      jsonrpc: '2.0',
      id: 0,
    };
    const uploadQueue = await athenaCall(dongleId, payload, 'action_files_athena_uploadqueue');
    if (generation !== uploadQueueGeneration || uploadQueueDongleId !== dongleId) return;
    if (!Array.isArray(uploadQueue?.result)) {
      if (uploadQueue && uploadQueue.offline) {
        dispatch(updateDeviceOnline(dongleId, 0));
      }
      cancelFetchUploadQueue();
      return;
    }
    dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));

    const prevFilesUploading = getState().filesUploadingMeta?.dongleId === dongleId
      ? { ...getState().filesUploading } : {};
    const device = getDeviceFromState(getState(), dongleId);
    const uploadingFiles = {};
    const newCurrentUploading = {};
    uploadQueue.result.forEach((uploading) => {
      if (!uploading || typeof uploading.url !== 'string' || uploading.id == null) return;
      let url;
      try {
        url = new URL(uploading.url);
      } catch {
        return;
      }
      if (!['https:', 'http:'].includes(url.protocol)) return;
      const urlParts = url.pathname.split('/');
      const filename = urlParts[urlParts.length - 1];
      const segNum = urlParts[urlParts.length - 2];
      const datetime = urlParts[urlParts.length - 3];
      const dongle = urlParts[urlParts.length - 4];
      const type = Object.keys(FILE_NAMES).find((name) => FILE_NAMES[name].includes(filename));
      if (!type || dongle !== dongleId || !datetime || !/^\d+$/.test(segNum)) return;
      const fileName = `${dongle}|${datetime}--${segNum}/${type}`;
      const waitingWifi = Boolean(deviceOnCellular(device) && uploading.allow_cellular === false);
      uploadingFiles[fileName] = {
        current: uploading.current,
        progress: uploading.progress,
        paused: waitingWifi,
      };
      newCurrentUploading[uploading.id] = {
        fileName,
        current: uploading.current,
        progress: uploading.progress,
        createdAt: uploading.created_at,
        paused: waitingWifi,
      };
      delete prevFilesUploading[uploading.id];
    });
    // some item is done uploading
    if (getState().dongleId === dongleId && Object.keys(prevFilesUploading).length) {
      const routeName = Object.values(prevFilesUploading)[0].fileName.split('--').slice(0, 2).join('--');
      dispatch(fetchFiles(routeName, true));
    }
    dispatch({
      type: Types.ACTION_FILES_UPLOADING,
      dongleId,
      uploading: newCurrentUploading,
      files: uploadingFiles,
    });
    if (generation !== uploadQueueGeneration || uploadQueueDongleId !== dongleId) return;
    if (Object.keys(newCurrentUploading).length) {
      uploadQueueTimeout = setTimeout(() => {
        uploadQueueTimeout = null;
        dispatch(fetchUploadQueue(dongleId));
      }, 2000);
    } else {
      uploadQueueTimeout = null;
    }
  };
}

export function doUpload(dongleId, paths, urls) {
  return async (dispatch, getState) => {
    const { device } = getState();
    let loopedUploads = !deviceVersionAtLeast(device, '0.8.13');
    if (!loopedUploads) {
      const filesData = paths.map((path, i) => ({
        fn: path,
        url: urls[i],
        headers: { 'x-ms-blob-type': 'BlockBlob' },
        allow_cellular: false,
        priority: HIGH_PRIORITY,
      }));
      const payload = {
        id: 0,
        jsonrpc: '2.0',
        method: 'uploadFilesToUrls',
        params: { files_data: filesData },
        expiry: Math.floor(Date.now() / 1000) + (86400 * 7),
      };
      const resp = await athenaCall(dongleId, payload, 'action_files_athena_uploads');
      if (resp && resp.error && resp.error.code === -32000
        && resp.error.data.message === 'too many values to unpack (expected 3)') {
        loopedUploads = true;
      } else if (!resp || resp.error) {
        const newUploading = paths.reduce((state, path) => {
          state[pathToFileName(dongleId, path)] = {};
          return state;
        }, {});
        dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));
        dispatch(updateFiles(newUploading));
      } else if (resp.offline) {
        dispatch(updateDeviceOnline(dongleId, 0));
      } else if (resp.result === 'Device offline, message queued') {
        const newUploading = paths.reduce((state, path) => {
          state[pathToFileName(dongleId, path)] = { progress: 0, current: false };
          return state;
        }, {});
        dispatch(updateFiles(newUploading));
      } else if (resp.result) {
        let failed = resp.result.failed || [];

        // only if all file names for a segment file type failed
        let failedFiltered = [];
        for (const f of failed) {
          let failedCnt = failed.filter((p) => pathToFileName(dongleId, p) === pathToFileName(dongleId, f)).length;
          let requestedCnt = paths.filter((p) => pathToFileName(dongleId, p) === pathToFileName(dongleId, f)).length;
          if (failedCnt >= requestedCnt) {
            failedFiltered.push(f);
          }
        }

        if (failedFiltered) {
          const uploading = failedFiltered
            .reduce((state, path) => {
              const fn = pathToFileName(dongleId, path);
              state[fn] = { notFound: true };
              return state;
            }, {});
          dispatch(updateFiles(uploading));
        }
        dispatch(fetchUploadQueue(dongleId));
      }
    }

    if (loopedUploads) {
      for (let i = 0; i < paths.length; i++) {
        const payload = {
          id: 0,
          jsonrpc: '2.0',
          method: 'uploadFileToUrl',
          params: [paths[i], urls[i], { 'x-ms-blob-type': 'BlockBlob' }],
          expiry: Math.floor(Date.now() / 1000) + (86400 * 7),
        };
        // eslint-disable-next-line no-await-in-loop
        const resp = await athenaCall(dongleId, payload, 'files_actions_athena_upload');
        if (!resp || resp.error) {
          const uploading = {};
          uploading[pathToFileName(dongleId, paths[i])] = {};
          dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));
          dispatch(updateFiles(uploading));
        } else if (resp.offline) {
          dispatch(updateDeviceOnline(dongleId, 0));
        } else if (resp.result === 'Device offline, message queued') {
          const uploading = {};
          uploading[pathToFileName(dongleId, paths[i])] = { progress: 0, current: false };
          dispatch(updateFiles(uploading));
        } else if (resp.result === 404 || resp?.result?.failed?.[0] === paths[i]) {
          const uploading = {};
          uploading[pathToFileName(dongleId, paths[i])] = { notFound: true };
          dispatch(updateFiles(uploading));
        } else if (resp.result) {
          dispatch(fetchUploadQueue(dongleId));
        }
      }
    }
  };
}

export function fetchAthenaQueue(dongleId) {
  return async (dispatch, getState) => {
    let queue;
    try {
      queue = await api.devices.getAthenaQueue(dongleId);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'action_files_fetch_athena_queue' });
      return;
    }

    if (!Array.isArray(queue) || getState().dongleId !== dongleId) return;
    const newUploading = {};
    const addQueuedFile = (path) => {
      if (typeof path !== 'string') return;
      const [segment, filename] = path.split('/');
      if (!segment || !Object.values(FILE_NAMES).some((names) => names.includes(filename))) return;
      newUploading[pathToFileName(dongleId, path)] = { progress: 0, current: false };
    };
    for (const q of queue) {
      if (!q?.method || !Number.isFinite(Number(q.expiry)) || q.expiry < Math.floor(Date.now() / 1000)) {
        continue;
      }

      if (q.method === 'uploadFileToUrl') {
        addQueuedFile(q.params?.[0]);
      } else if (q.method === 'uploadFilesToUrls' && Array.isArray(q.params?.files_data)) {
        for (const file of q.params.files_data) addQueuedFile(file?.fn);
      }
    }
    dispatch(updateFiles(newUploading));
  };
}

export function cancelUploads(dongleId, ids) {
  return async (dispatch) => {
    const payload = {
      id: 0,
      jsonrpc: '2.0',
      method: 'cancelUpload',
      params: { upload_id: ids },
    };
    const resp = await athenaCall(dongleId, payload, 'action_files_athena_canceluploads');
    if (resp && resp.result && resp.result.success) {
      const idsArray = Array.isArray(ids) ? ids : [ids];
      dispatch({
        type: Types.ACTION_FILES_CANCELLED_UPLOADS,
        dongleId,
        ids: idsArray,
      });
    } else if (resp && resp.offline) {
      dispatch(updateDeviceOnline(dongleId, 0));
    }
  };
}

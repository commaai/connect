import * as Sentry from '@sentry/react';
import { raw as RawApi, athena as AthenaApi, devices as DevicesApi } from '@commaai/comma-api';

import { updateDeviceOnline, fetchDeviceNetworkStatus } from '.';
import * as Types from './types';
import { deviceOnCellular, getDeviceFromState, deviceVersionAtLeast } from '../utils';

const FILE_NAMES = {
  qcameras: 'qcamera.ts',
  cameras: 'fcamera.hevc',
  dcameras: 'dcamera.hevc',
  ecameras: 'ecamera.hevc',
  qlogs: 'qlog.bz2',
  logs: 'rlog.bz2',
};
const MAX_OPEN_REQUESTS = 15;
const MAX_RETRIES = 5;

let uploadQueueTimeout = null;
let openRequests = 0;

function pathToFileName(dongleId, path) {
  const [seg, fileType] = path.split('/');
  const type = Object.entries(FILE_NAMES).find((e) => e[1] === fileType)[0];
  return `${dongleId}|${seg}/${type}`;
}

async function athenaCall(dongleId, payload, sentryFingerprint, retryCount = 0) {
  try {
    while (openRequests > MAX_OPEN_REQUESTS) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    openRequests += 1;
    const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
    openRequests -= 1;
    return resp;
  } catch (err) {
    openRequests -= 1;
    if (!err.resp && retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
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

export async function fetchUploadUrls(dongleId, paths) {
  try {
    const resp = await RawApi.getUploadUrls(dongleId, paths, 7);
    if (resp && !resp.error) {
      return resp.map((r) => r.url);
    }
  } catch (err) {
    console.error(err);
    Sentry.captureException(err, { fingerprint: 'action_files_upload_geturls' });
  }
  return null;
}

export function doUpload(dongleId, fileNames, paths, urls) {
  return async (dispatch, getState) => {
    const { device } = getState();
    let loopedUploads = !deviceVersionAtLeast(device, '0.8.13');
    if (!loopedUploads) {
      const files_data = paths.map((path, i) => ({
        fn: path,
        url: urls[i],
        headers: { 'x-ms-blob-type': 'BlockBlob' },
        allow_cellular: false,
      }));
      const payload = {
        id: 0,
        jsonrpc: '2.0',
        method: 'uploadFilesToUrls',
        params: { files_data },
        expiry: Math.floor(Date.now() / 1000) + (86400 * 7),
      };
      const resp = await athenaCall(dongleId, payload, 'action_files_athena_uploads');
      if (resp && resp.error && resp.error.code === -32000
        && resp.error.data.message === 'too many values to unpack (expected 3)') {
        loopedUploads = true;
      } else if (!resp || resp.error) {
        const newUploading = {};
        for (const fileName of fileNames) {
          newUploading[fileName] = {};
        }
        dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));
        dispatch(updateFiles(newUploading));
      } else if (resp.offline) {
        dispatch(updateDeviceOnline(dongleId, 0));
      } else if (resp.result === 'Device offline, message queued') {
        const newUploading = {};
        for (const fileName of fileNames) {
          newUploading[fileName] = { progress: 0, current: false };
        }
        dispatch(updateFiles(newUploading));
      } else if (resp.result) {
        if (resp.result.failed) {
          const uploading = {};
          for (const path of resp.result.failed) {
            const idx = paths.indexOf(path);
            if (idx !== -1) {
              uploading[fileNames[idx]] = { notFound: true };
            }
          }
          dispatch(updateFiles(uploading));
        }
        dispatch(fetchUploadQueue(dongleId));
      }
    }

    if (loopedUploads) {
      for (let i = 0; i < fileNames.length; i++) {
        const payload = {
          id: 0,
          jsonrpc: '2.0',
          method: 'uploadFileToUrl',
          params: [paths[i], urls[i], { 'x-ms-blob-type': 'BlockBlob' }],
          expiry: Math.floor(Date.now() / 1000) + (86400 * 7),
        };
        const resp = await athenaCall(dongleId, payload, 'files_actions_athena_upload');
        if (!resp || resp.error) {
          const uploading = {};
          uploading[fileNames[i]] = {};
          dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));
          dispatch(updateFiles(uploading));
        } else if (resp.offline) {
          dispatch(updateDeviceOnline(dongleId, 0));
        } else if (resp.result === 'Device offline, message queued') {
          const uploading = {};
          uploading[fileNames[i]] = { progress: 0, current: false };
          dispatch(updateFiles(uploading));
        } else if (resp.result === 404 || (resp.result && resp.result.failed && resp.result.failed[0] === paths[i])) {
          const uploading = {};
          uploading[fileNames[i]] = { notFound: true };
          dispatch(updateFiles(uploading));
        } else if (resp.result) {
          dispatch(fetchUploadQueue(dongleId));
        }
      }
    }
  };
}

export function fetchFiles(routeName, nocache = false) {
  return async (dispatch, getState) => {
    let files;
    try {
      files = await RawApi.getRouteFiles(routeName, nocache);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'action_files_fetch_files' });
      return;
    }

    const dongleId = routeName.split('|')[0];
    const urlName = routeName.replace('|', '/');
    const res = {};
    for (const type of Object.keys(FILE_NAMES)) {
      if (files[type]) {
        for (const file of files[type]) {
          const segmentNum = parseInt(file.split(urlName)[1].split('/')[1], 10);
          const fileName = `${routeName}--${segmentNum}/${type}`;
          res[fileName] = {
            url: file,
          };
        }
      }
    }

    dispatch({
      type: Types.ACTION_FILES_URLS,
      dongleId,
      urls: res,
    });
  };
}

export function fetchAthenaQueue(dongleId) {
  return async (dispatch, getState) => {
    let queue;
    try {
      queue = await DevicesApi.getAthenaQueue(dongleId);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'action_files_fetch_athena_queue' });
      return;
    }

    const newUploading = {};
    for (const q of queue) {
      if (!q.method || !q.expiry || q.expiry < Math.floor(Date.now() / 1000)) {
        continue;
      }

      if (q.method === 'uploadFileToUrl') {
        const fileName = pathToFileName(dongleId, q.params[0]);
        newUploading[fileName] = { progress: 0, current: false };
      } else if (q.method === 'uploadFilesToUrls') {
        for (const { fn } of q.params.files_data) {
          const fileName = pathToFileName(dongleId, fn);
          newUploading[fileName] = { progress: 0, current: false };
        }
      }
    }
    dispatch(updateFiles(newUploading));
  };
}

export function cancelFetchUploadQueue() {
  if (uploadQueueTimeout) {
    if (uploadQueueTimeout !== true) {
      clearTimeout(uploadQueueTimeout);
    }
    uploadQueueTimeout = null;
  }
}

export function fetchUploadQueue(dongleId) {
  return async (dispatch, getState) => {
    if (uploadQueueTimeout) {
      return;
    }
    uploadQueueTimeout = true;

    dispatch(fetchDeviceNetworkStatus(dongleId));

    const payload = {
      method: 'listUploadQueue',
      jsonrpc: '2.0',
      id: 0,
    };
    const uploadQueue = await athenaCall(dongleId, payload, 'action_files_athena_uploadqueue');
    if (!uploadQueue || !uploadQueue.result) {
      if (uploadQueue && uploadQueue.offline) {
        dispatch(updateDeviceOnline(dongleId, 0));
      }
      cancelFetchUploadQueue();
      return;
    }
    dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));

    const prevFilesUploading = getState().filesUploading || {};
    const device = getDeviceFromState(getState(), dongleId);
    const uploadingFiles = {};
    const newCurrentUploading = {};
    for (const uploading of uploadQueue.result) {
      const urlParts = uploading.url.split('?')[0].split('/');
      const filename = urlParts[urlParts.length - 1];
      const segNum = urlParts[urlParts.length - 2];
      const datetime = urlParts[urlParts.length - 3];
      const dongleId = urlParts[urlParts.length - 4];
      const type = Object.entries(FILE_NAMES).find((e) => e[1] == filename)[0];
      const fileName = `${dongleId}|${datetime}--${segNum}/${type}`;
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
    }
    if (getState().dongleId === dongleId && Object.keys(prevFilesUploading).length) { // some item is done uploading
      const routeName = Object.values(prevFilesUploading)[0].fileName.split('--').slice(0, 2).join('--');
      dispatch(fetchFiles(routeName, true));
    }
    dispatch({
      type: Types.ACTION_FILES_UPLOADING,
      dongleId,
      uploading: newCurrentUploading,
      files: uploadingFiles,
    });
    if (uploadQueueTimeout === true && uploadQueue.result.length) {
      cancelFetchUploadQueue();
      uploadQueueTimeout = setTimeout(() => {
        uploadQueueTimeout = null;
        dispatch(fetchUploadQueue(dongleId));
      }, 2000);
    }
  };
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

export function cancelUploads(dongleId, ids) {
  return async (dispatch, getState) => {
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

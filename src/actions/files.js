import * as Sentry from '@sentry/react';
import { athena as Athena, devices as Devices, raw as Raw } from '@commaai/api';

import { updateDeviceOnline, fetchDeviceNetworkStatus } from '.';
import * as Types from './types';
import { deviceOnCellular, getDeviceFromState, deviceVersionAtLeast, asyncSleep } from '../utils';

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

export async function fetchUploadUrls(dongleId, paths) {
  try {
    const resp = await Raw.getUploadUrls(dongleId, paths, 7);
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
  return async (dispatch) => {
    let files;
    try {
      files = await Raw.getRouteFiles(routeName, nocache);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'action_files_fetch_files' });
      return;
    }

    const dongleId = routeName.split('|')[0];
    const urlName = routeName.replace('|', '/');
    const urls = Object
      .keys(FILE_NAMES)
      .filter((type) => files[type])
      .flatMap((type) => files[type].map((file) => ([type, file])))
      .reduce((state, [type, file]) => {
        const segmentNum = parseInt(file.split(urlName)[1].split('/')[1], 10);
        const fileName = `${routeName}--${segmentNum}/${type}`;
        state[fileName] = {
          url: file,
        };
        return state;
      }, {});

    dispatch({
      type: Types.ACTION_FILES_URLS,
      dongleId,
      urls,
    });
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
    uploadQueue.result.forEach((uploading) => {
      const urlParts = uploading.url.split('?')[0].split('/');
      const filename = urlParts[urlParts.length - 1];
      const segNum = urlParts[urlParts.length - 2];
      const datetime = urlParts[urlParts.length - 3];
      const dongle = urlParts[urlParts.length - 4];
      const type = Object.entries(FILE_NAMES).find((e) => e[1] === filename)[0];
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
    if (uploadQueueTimeout === true && uploadQueue.result.length) {
      cancelFetchUploadQueue();
      uploadQueueTimeout = setTimeout(() => {
        uploadQueueTimeout = null;
        dispatch(fetchUploadQueue(dongleId));
      }, 2000);
    }
  };
}

export function doUpload(dongleId, fileNames, paths, urls) {
  return async (dispatch, getState) => {
    const { device } = getState();
    let loopedUploads = !deviceVersionAtLeast(device, '0.8.13');
    if (!loopedUploads) {
      const filesData = paths.map((path, i) => ({
        fn: path,
        url: urls[i],
        headers: { 'x-ms-blob-type': 'BlockBlob' },
        allow_cellular: false,
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
        const newUploading = fileNames.reduce((state, fn) => {
          state[fn] = {};
          return state;
        }, {});
        dispatch(updateDeviceOnline(dongleId, Math.floor(Date.now() / 1000)));
        dispatch(updateFiles(newUploading));
      } else if (resp.offline) {
        dispatch(updateDeviceOnline(dongleId, 0));
      } else if (resp.result === 'Device offline, message queued') {
        const newUploading = fileNames.reduce((state, fn) => {
          state[fn] = { progress: 0, current: false };
          return state;
        }, {});
        dispatch(updateFiles(newUploading));
      } else if (resp.result) {
        if (resp.result.failed) {
          const uploading = resp.result.failed
            .filter((path) => paths.indexOf(path) > -1)
            .reduce((state, path) => {
              const fn = fileNames[paths.indexOf(path)];
              state[fn] = { notFound: true };
              return state;
            }, {});
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
        } else if (resp.result === 404 || resp?.result?.failed?.[0] === paths[i]) {
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

export function fetchAthenaQueue(dongleId) {
  return async (dispatch) => {
    let queue;
    try {
      queue = await Devices.getAthenaQueue(dongleId);
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

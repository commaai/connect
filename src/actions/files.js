import * as Sentry from '@sentry/react';
import { raw as RawApi, athena as AthenaApi, devices as DevicesApi } from '@commaai/comma-api';

import { updateDeviceOnline, fetchDeviceNetworkStatus } from './';
import * as Types from './types';
import { deviceOnCellular } from '../utils';

const demoLogUrls = require('../demo/logUrls.json');
const demoFiles = require('../demo/files.json');

const FILE_NAMES = {
  'qcameras': 'qcamera.ts',
  'cameras': 'fcamera.hevc',
  'dcameras': 'dcamera.hevc',
  'ecameras': 'ecamera.hevc',
  'qlogs': 'qlog.bz2',
  'logs': 'rlog.bz2',
};
const MAX_OPEN_REQUESTS = 15;
const MAX_RETRIES = 5;

let uploadQueueTimeout = null;
let openRequests = 0;

function pathToFileName(dongleId, path) {
  const [seg, fileType] = path.split('/');
  const type = Object.entries(FILE_NAMES).find((e) => e[1] == fileType)[0];
  return `${dongleId}|${seg}/${type}`
}

async function athenaCall(dongleId, payload, sentry_fingerprint, retryCount = 0) {
  try {
    while (openRequests > MAX_OPEN_REQUESTS) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    openRequests += 1;
    const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
    openRequests -= 1;
    return resp;
  } catch(err) {
    openRequests -= 1;
    if (!err.resp && retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return await athenaCall(dongleId, payload, sentry_fingerprint, retryCount + 1);
    }
    if (err.message && (err.message.indexOf('Timed out') === -1 ||
      err.message.indexOf('Device not registered') === -1))
    {
      return { offline: true };
    } else {
      console.log(err);
      Sentry.captureException(err, { fingerprint: sentry_fingerprint });
      return { error: err.message };
    }
  }
}

export function fetchFiles(routeName, nocache=false) {
  return async (dispatch, getState) => {
    let files;
    if (Object.keys(demoLogUrls).includes(routeName)) {
      files = demoFiles;
    } else {
      try {
        files = await RawApi.getRouteFiles(routeName, nocache);
      } catch (err) {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'action_files_fetch_files' });
        return;
      }
    }

    const dongleId = routeName.split('|')[0];
    const urlName = routeName.replace('|', '/');
    const res = {};
    for (const type of Object.keys(FILE_NAMES)) {
      for (const file of files[type]) {
        const segmentNum = parseInt(file.split(urlName)[1].split('/')[1]);
        const fileName = `${routeName}--${segmentNum}/${type}`;
        res[fileName] = {
          url: file,
        };
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
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'action_files_fetch_athena_queue' });
      return;
    }

    const newUploading = {};
    for (const q of queue) {
      if (!q.method || !q.expiry || q.expiry < parseInt(Date.now()/1000)) {
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
      return;
    }
    dispatch(updateDeviceOnline(dongleId, parseInt(Date.now() / 1000)));

    let prevFilesUploading = getState().filesUploading || {};
    let device;
    if (getState().device.dongle_id === dongleId) {
      device = getState().device;
    } else {
      device = getState().devices.find((d) => d.dongle_id === dongleId) || null;
    }
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
      jsonrpc: "2.0",
      method: "cancelUpload",
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

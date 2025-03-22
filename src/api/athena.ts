import {
  AthenaCallResponse, BackendAthenaCallResponse, BackendAthenaCallResponseError, CancelUploadRequest,
  CancelUploadResponse, UploadFile, UploadFilesToUrlsRequest, UploadFilesToUrlsResponse, UploadQueueItem,
} from '~/types'
import { fetcher } from '.'
import { getAccessToken } from './auth/client'
import { ATHENA_URL } from './config'

// Higher number is lower priority
const HIGH_PRIORITY = 0

// Uploads expire after 1 week if device remains offline
const EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7

export const cancelUpload = (dongleId: string, ids: string[]) =>
  makeAthenaCall<CancelUploadRequest, CancelUploadResponse>(dongleId, 'cancelUpload', { upload_id: ids })

export const getNetworkMetered = (dongleId: string) =>
  makeAthenaCall<void, boolean>(dongleId, 'getNetworkMetered')

export const getUploadQueue = (dongleId: string) =>
  makeAthenaCall<void, UploadQueueItem[]>(dongleId, 'listUploadQueue')

export const uploadFilesToUrls = (dongleId: string, files: UploadFile[]) =>
  makeAthenaCall<UploadFilesToUrlsRequest, UploadFilesToUrlsResponse>(dongleId, 'uploadFilesToUrls', {
    files_data: files.map((file) => ({
      allow_cellular: false,
      fn: file.filePath,
      headers: file.headers,
      priority: HIGH_PRIORITY,
      url: file.url,
    })),
  }, Math.floor(Date.now() / 1000) + EXPIRES_IN_SECONDS)

export const makeAthenaCall = async <REQ, RES>(dongleId: string, method: string, params?: REQ, expiry?: number): Promise<AthenaCallResponse<RES>> => {
  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `JWT ${getAccessToken()}`,
    },
    body: JSON.stringify({ id: 0, jsonrpc: '2.0', method, params, expiry }),
  }
  const res = await fetcher<BackendAthenaCallResponse<RES> | BackendAthenaCallResponseError>(`/${dongleId}`, opts, ATHENA_URL)
  if ('error' in res) {
    return { queued: false, error: res.error, result: undefined }
  }
  if (typeof res.result === 'string' && res.result === 'Device offline, message queued') {
    return { queued: true, error: undefined, result: undefined }
  }
  return { queued: false, error: undefined, result: res.result as RES }
}

import request from './request';

export function listDevices() {
  return request.get('v1/me/devices/');
}

export function setDeviceAlias(dongleId, alias) {
  return request.patch(`v1/devices/${dongleId}/`, { alias });
}

export function grantDeviceReadPermission(dongleId, email) {
  return request.post(`v1/devices/${dongleId}/add_user`, { email });
}

export async function fetchLocation(dongleId) {
  const location = await request.get(`v1/devices/${dongleId}/location`);
  if (location !== undefined && location.error === undefined) {
    return location;
  }
  throw Error(`Could not fetch device location: ${JSON.stringify(location)}`);
}

export function fetchDevice(dongleId) {
  return request.get(`v1.1/devices/${dongleId}/`);
}

export function pilotPair(pairToken) {
  return request.postForm('v2/pilotpair/', { pair_token: pairToken });
}

export function fetchDeviceStats(dongleId) {
  return request.get(`v1.1/devices/${dongleId}/stats`);
}

export function unpair(dongleId) {
  return request.post(`v1/devices/${dongleId}/unpair`);
}

export function getAthenaQueue(dongleId) {
  return request.get(`v1/devices/${dongleId}/athena_offline_queue`);
}

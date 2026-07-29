import request from './request';

export function getProfile(dongleId = 'me') {
  return request.get(`v1/${dongleId}/`);
}

import request from './request';

export function getCredentials() {
  return request.get('v1/me/turn');
}

import Config from './config';
import ConfigRequest from './instance';

const request = new ConfigRequest(Config.ATHENA_URL_ROOT);

export function configure(accessToken, errorResponseCallback = null) {
  request.configure(accessToken, errorResponseCallback);
}

export function postJsonRpcPayload(dongleId, payload) {
  return request.post(dongleId, payload);
}

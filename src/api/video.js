import qs from 'query-string';

import Config from './config';
import ConfigRequest from './instance';

const request = new ConfigRequest(Config.COMMA_URL_ROOT);

export function getQcameraStreamUrl(routeStr, exp, sig) {
  return `${request.baseUrl}v1/route/${routeStr}/qcamera.m3u8?${qs.stringify({ exp, sig })}`;
}

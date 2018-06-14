import { timeout } from 'thyming';
import * as request from './request';
import { AnnotationValidator } from './validators';

export async function getSegmentMetadata (start, end, dongleId) {
  return request.get('devices/' + dongleId + '/segments', {
    from: start,
    to: end
  });
}

const urlStore = {};
export async function getLogUrls (routeName) {
  // don't bother bouncing because the URLs themselves expire
  // our expiry time is from initial fetch time, not most recent access
  if (urlStore[routeName]) {
    return urlStore[routeName];
  }
  var data = await request.get('route/' + routeName + '/log_urls');

  urlStore[routeName] = data;

  setTimeout(function() {
    delete urlStore[routeName];
  }, 1000 * 60 * 45); // expires in 1h, lets reset in 45m

  return urlStore[routeName];
}

export async function listDevices () {
  return request.get('me/devices/');
}

export async function createAnnotation (data) {
  data = AnnotationValidator.validate(data);
  if (data.error) {
    throw data.error;
  }
  data = data.value;

  return request.post('annotations/new', data);
}

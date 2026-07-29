import qs from 'query-string';

import request from './request';

const urlStore = {};

async function getCached(endpoint, params, nocache) {
  let url = endpoint;
  if (params !== undefined) {
    url += `?${qs.stringify(params)}`;
  }

  if (urlStore[url] && !nocache) {
    return urlStore[url];
  }

  urlStore[url] = await request.get(url);
  setTimeout(() => {
    delete urlStore[url];
  }, 1000 * 60 * 45);

  return urlStore[url];
}

export function getRouteFiles(routeName, nocache = false) {
  return getCached(`v1/route/${routeName}/files`, undefined, nocache);
}

export function getUploadUrls(dongleId, paths, expiry) {
  return request.post(`v1/${dongleId}/upload_urls/`, { paths, expiry_days: expiry });
}

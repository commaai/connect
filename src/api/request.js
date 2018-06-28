import ConfigRequest from 'config-request/instance';
import qs from 'querystringify';

import { getCommaAccessToken } from './auth/storage';
import errorHandler from './errorHandler';
import { COMMA_URL_ROOT } from './config';

const request = ConfigRequest();

var initPromise;
function ensureInit() {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

async function init() {
  const config = {
    baseUrl: COMMA_URL_ROOT,
    jwt: false
  };

  var token = await getCommaAccessToken();
  if (token) {
    config.token = `JWT ${token}`;
  }

  request.configure(config);
}

export async function get(endpoint, data) {
  await ensureInit();
  return new Promise((resolve, reject) => {
    request.get(
      endpoint,
      {
        query: data,
        json: true
      },
      errorHandler(resolve, reject)
    );
  });
}

export async function post(endpoint, data) {
  await ensureInit();
  return new Promise((resolve, reject) => {
    request.post(
      endpoint,
      {
        body: data,
        json: true
      },
      errorHandler(resolve, reject)
    );
  });
}

export async function postForm(endpoint, data) {
  await ensureInit();
  return new Promise((resolve, reject) => {
    request.post(
      endpoint,
      {
        body: qs.stringify(data),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      },
      errorHandler(resolve, reject)
    )
  });
}

export async function patch(endpoint, data) {
  await ensureInit();
  return new Promise((resolve, reject) => {
    request.patch(
      endpoint,
      {
        body: data,
        json: true
      },
      errorHandler(resolve, reject)
    );
  });
}

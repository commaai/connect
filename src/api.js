import { stringifyQuery } from './utils/query';

const COMMA_URL_ROOT = import.meta.env.VITE_COMMA_URL_ROOT || 'https://api.comma.ai/';
const ATHENA_URL_ROOT = import.meta.env.VITE_ATHENA_URL_ROOT || 'https://athena.comma.ai/';
const BILLING_URL_ROOT = import.meta.env.VITE_BILLING_URL_ROOT || 'https://billing.comma.ai/';

export const USERADMIN_URL_ROOT = import.meta.env.VITE_USERADMIN_URL_ROOT
  || 'https://useradmin.comma.ai/';

class RequestError extends Error {
  constructor(response, message) {
    super(message);
    this.resp = response;
  }
}

class ApiRequest {
  constructor(baseUrl) {
    this.baseUrl = `${baseUrl.replace(/\/?$/, '/')}`;
    this.headers = { 'Content-Type': 'application/json' };
    this.errorResponseCallback = null;
  }

  configure(accessToken, errorResponseCallback = null) {
    if (accessToken) {
      this.headers.Authorization = `JWT ${accessToken}`;
    }
    if (errorResponseCallback) {
      this.errorResponseCallback = errorResponseCallback;
    }
  }

  async request(method, endpoint, params, json = true, responseJson = true, throwOnError = false) {
    const headers = { ...this.headers };
    if (!json) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    let url = this.baseUrl + endpoint;
    let body;
    if (params && Object.keys(params).length) {
      if (method === 'GET' || method === 'HEAD') {
        url += `?${stringifyQuery(params)}`;
      } else {
        body = json ? JSON.stringify(params) : stringifyQuery(params);
      }
    }

    const options = { method, headers };
    if (body !== undefined) {
      options.body = body;
    }
    const response = await fetch(url, options);
    if (!response.ok) {
      if (this.errorResponseCallback) {
        await this.errorResponseCallback(response);
        if (!throwOnError) return null;
      }
      throw new RequestError(response, `${response.status}: ${await response.text()}`);
    }
    return responseJson ? response.json() : response;
  }

  get(endpoint, params, json = true, responseJson = true) {
    return this.request('GET', endpoint, params, json, responseJson);
  }

  post(endpoint, params, json = true, responseJson = true) {
    return this.request('POST', endpoint, params, json, responseJson);
  }

  postForm(endpoint, params) {
    return this.post(endpoint, params, false);
  }

  patch(endpoint, params, json = true, responseJson = true) {
    return this.request('PATCH', endpoint, params, json, responseJson);
  }
}

export const request = new ApiRequest(COMMA_URL_ROOT);
const athenaRequest = new ApiRequest(ATHENA_URL_ROOT);
const billingRequest = new ApiRequest(BILLING_URL_ROOT);

export const account = {
  getProfile(dongleId = 'me') {
    return request.get(`v1/${dongleId}/`);
  },
};

export const auth = {
  async refreshAccessToken(code, provider) {
    const response = await request.postForm('v2/auth/', { code, provider });
    if (response.access_token != null) {
      request.configure(response.access_token);
      return response.access_token;
    }
    if (response.response !== undefined) {
      throw new Error(`Could not exchange oauth code for access token: response ${response.response}`);
    }
    if (response.error !== undefined) {
      throw new Error(`Could not exchange oauth code for access token: error ${response.error}`);
    }
    throw new Error(`Could not exchange oauth code for access token: ${response}`);
  },
};

export const athena = {
  configure(accessToken, errorResponseCallback = null) {
    athenaRequest.configure(accessToken, errorResponseCallback);
  },

  postJsonRpcPayload(dongleId, payload) {
    return athenaRequest.post(dongleId, payload);
  },
};

export const billing = {
  configure(accessToken, errorResponseCallback = null) {
    billingRequest.configure(accessToken, errorResponseCallback);
  },

  getSubscription: (dongle_id) => billingRequest.get('v1/prime/subscription', { dongle_id }),
  getSubscribeInfo: (dongle_id) => billingRequest.get('v1/prime/subscribe_info', { dongle_id }),
  cancelPrime: (dongle_id) => billingRequest.post('v1/prime/cancel', { dongle_id }),
  getStripeCheckout: (dongle_id, sim_id, plan) => (
    billingRequest.post('v1/prime/stripe_checkout', { dongle_id, sim_id, plan })
  ),
  getStripePortal: (dongle_id) => billingRequest.get('v1/prime/stripe_portal', { dongle_id }),
  getStripeSession: (dongle_id, session_id) => (
    billingRequest.get('v1/prime/stripe_session', { dongle_id, session_id })
  ),
  switchPrimePlan: (dongle_id, plan, sim_id = null) => (
    billingRequest.post('v1/prime/switch_plan', { dongle_id, plan, sim_id })
  ),
  getReferrals: () => billingRequest.get('v1/referrals'),
  createReferralCode: () => billingRequest.request('POST', 'v1/referrals', undefined, true, true, true),
};

export const devices = {
  listDevices: () => request.get('v1/me/devices/'),
  setDeviceAlias: (dongleId, alias) => request.patch(`v1/devices/${dongleId}/`, { alias }),
  grantDeviceReadPermission: (dongleId, email) => (
    request.post(`v1/devices/${dongleId}/add_user`, { email })
  ),
  async fetchLocation(dongleId) {
    const location = await request.get(`v1/devices/${dongleId}/location`);
    if (location !== undefined && location.error === undefined) {
      return location;
    }
    throw new Error(`Could not fetch device location: ${JSON.stringify(location)}`);
  },
  fetchDevice: (dongleId) => request.get(`v1.1/devices/${dongleId}/`),
  pilotPair: (pair_token) => request.postForm('v2/pilotpair/', { pair_token }),
  fetchDeviceStats: (dongleId) => request.get(`v1.1/devices/${dongleId}/stats`),
  unpair: (dongleId) => request.post(`v1/devices/${dongleId}/unpair`),
  getAthenaQueue: (dongleId) => request.get(`v1/devices/${dongleId}/athena_offline_queue`),
};

export const drives = {
  getRoutesSegments: (dongleId, start, end, limit, route_str) => (
    request.get(`v1/devices/${dongleId}/routes_segments`, { start, end, limit, route_str })
  ),
  setRoutePublic: (routeName, is_public) => (
    request.patch(`v1/route/${routeName}/`, { is_public })
  ),
  setRoutePreserved: (routeName, preserved) => (
    request.request(preserved ? 'POST' : 'DELETE', `v1/route/${routeName}/preserve`)
  ),
  getPreservedRoutes: (dongleId) => request.get(`v1/devices/${dongleId}/routes/preserved`),
};

const urlCache = {};

async function getCached(endpoint, params, nocache = false) {
  const url = params === undefined ? endpoint : `${endpoint}?${stringifyQuery(params)}`;
  if (urlCache[url] && !nocache) {
    return urlCache[url];
  }
  urlCache[url] = await request.get(url);
  setTimeout(() => delete urlCache[url], 45 * 60 * 1000);
  return urlCache[url];
}

export const raw = {
  getRouteFiles: (routeName, nocache = false, params = undefined) => (
    getCached(`v1/route/${routeName}/files`, params, nocache)
  ),
  getUploadUrls: (dongleId, paths, expiry) => (
    request.post(`v1/${dongleId}/upload_urls/`, { paths, expiry_days: expiry })
  ),
};

export const video = {
  getQcameraStreamUrl(routeStr, exp, sig) {
    return `${request.baseUrl}v1/route/${routeStr}/qcamera.m3u8?${stringifyQuery({ exp, sig })}`;
  },
};

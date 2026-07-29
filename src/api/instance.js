import qs from 'query-string';

export class RequestError extends Error {
  constructor(resp, ...params) {
    super(...params);
    this.resp = resp;
  }
}

export default class ConfigRequest {
  constructor(baseUrl) {
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    this.baseUrl = baseUrl + (!baseUrl.endsWith('/') ? '/' : '');
    this.errorResponseCallback = null;
  }

  configure(accessToken, errorResponseCallback = null) {
    if (accessToken) {
      this.defaultHeaders.Authorization = `JWT ${accessToken}`;
    }
    if (errorResponseCallback) {
      this.errorResponseCallback = errorResponseCallback;
    }
  }

  async request(method, endpoint, params, dataJson = true, respJson = true) {
    const headers = { ...this.defaultHeaders };
    if (!dataJson) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    let requestUrl = this.baseUrl + endpoint;
    let body;
    if (params && Object.keys(params).length !== 0) {
      if (method === 'GET' || method === 'HEAD') {
        requestUrl += `?${qs.stringify(params)}`;
      } else if (dataJson) {
        body = JSON.stringify(params);
      } else {
        body = qs.stringify(params);
      }
    }

    const options = { method, headers };
    if (body !== undefined) {
      options.body = body;
    }
    const resp = await fetch(requestUrl, options);
    if (!resp.ok) {
      if (this.errorResponseCallback) {
        await this.errorResponseCallback(resp);
        return null;
      }
      const error = await resp.text();
      throw new RequestError(resp, `${resp.status}: ${error}`);
    }
    if (!respJson) {
      return resp;
    }
    return resp.json();
  }

  get(endpoint, params, dataJson = true, respJson = true) {
    return this.request('GET', endpoint, params, dataJson, respJson);
  }

  post(endpoint, params, dataJson = true, respJson = true) {
    return this.request('POST', endpoint, params, dataJson, respJson);
  }

  postForm(endpoint, params) {
    return this.post(endpoint, params, false);
  }

  delete(endpoint, params, dataJson = true, respJson = true) {
    return this.request('DELETE', endpoint, params, dataJson, respJson);
  }

  patch(endpoint, params, dataJson = true, respJson = true) {
    return this.request('PATCH', endpoint, params, dataJson, respJson);
  }
}

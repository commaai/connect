import ConfigRequest from 'config-request/instance';
import qs from 'querystringify';

import errorHandler from '../errorHandler';
import * as Config from '../config';

const googleRequest = ConfigRequest();
googleRequest.configure({
  baseUrl: Config.GOOGLE_URL_ROOT,
  parse: JSON.parse
});

export async function postForm(endpoint, data) {
  return new Promise((resolve, reject) => {
    googleRequest.post(
      endpoint,
      {
        body: qs.stringify(data),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      },
      errorHandler(resolve, reject)
    )
  });
}

export async function exchangeCodeForTokens(code) {
  const params = {
    code: code,
    client_id: Config.GOOGLE_CLIENT_ID,
    client_secret: Config.GOOGLE_CLIENT_SECRET,
    redirect_uri: Config.REDIRECT_URI,
    grant_type: 'authorization_code'
  };

  return postForm('oauth2/v4/token/', params);
}

export async function commaTokenExchange (accessToken, idToken) {
  const request = ConfigRequest();
  request.configure({
    baseUrl: Config.COMMA_URL_ROOT
  });

  let promise = new Promise(function (resolve, reject) {
    request.post('auth/', {
      body: qs.stringify({
        access_token: accessToken,
        id_token: idToken
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, errorHandler(resolve, reject));
  });

  var data = await promise;
  localStorage.authorization = JSON.parse(data).access_token;
}

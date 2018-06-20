import ConfigRequest from 'config-request/instance';
import errorHandler from '../errorHandler';
import qs from 'query-string';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/auth'
var redirectOrigin = 'http://127.0.0.1';
if (typeof window !== 'undefined') {
  redirectOrigin = window.location.origin;
}
const REDIRECT_URI = `${redirectOrigin}/auth/g/redirect`;
const OAUTH_PARAMS = qs.stringify({
    type: 'web_server',
    client_id: '45471411055-ffgv404iin6vi94qv6g6hd8fb48hr4bf.apps.googleusercontent.com',
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/userinfo.email'
  });

export const oauthRedirectLink = `${GOOGLE_AUTH_ENDPOINT}?${OAUTH_PARAMS}`

const request = ConfigRequest();

const initPromise = init();
async function init() {
  request.configure({
      baseUrl: "https://www.googleapis.com/",
      parse: JSON.parse
  });
}

export async function postForm(endpoint, data) {
  await initPromise;
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

export async function exchangeCodeForTokens(code) {
  await initPromise;
  const params = {
    code: code,
    client_id: '45471411055-ffgv404iin6vi94qv6g6hd8fb48hr4bf.apps.googleusercontent.com',
    client_secret: '_9OMwDPbbx2JktznntXt-1Hs',
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  };

  return postForm("oauth2/v4/token/", params);
}
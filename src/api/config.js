import qs from 'query-string';
import document from 'global/document';

export const COMMA_URL_ROOT = 'https://api.commadotai.com/v1/';
export const GOOGLE_URL_ROOT = 'https://www.googleapis.com/';
export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/auth';
export const GOOGLE_CLIENT_ID = '45471411055-ffgv404iin6vi94qv6g6hd8fb48hr4bf.apps.googleusercontent.com';
export const GOOGLE_CLIENT_SECRET = '_9OMwDPbbx2JktznntXt-1Hs';

var redirectOrigin = 'http://127.0.0.1';
if (document.location) {
  redirectOrigin = document.location.origin;
}
export const REDIRECT_URI = `${redirectOrigin}/auth/g/redirect`;

export const OAUTH_PARAMS = {
  type: 'web_server',
  client_id: GOOGLE_CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/userinfo.email',
  prompt: 'select_account',
};

export const oauthRedirectLink = [GOOGLE_AUTH_ENDPOINT, qs.stringify(OAUTH_PARAMS)].join('?');

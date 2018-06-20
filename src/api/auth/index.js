import qs from 'query-string';
import document from 'global/document';

import * as storage from './storage';
import * as Api from '../';
export { oauthRedirectLink } from './google';

// seed cache
export async function init() {
  if (document.location) {
    if (document.location.pathname == "/auth/g/redirect") {
      var code = qs.parse(document.location.search)['code'];
      await Api.exchangeAndStoreTokens(code);
    }
  }

  return storage.getCommaAccessToken();
}

export function logOut() {
  storage.logOut();
  document.location.href = document.location.origin;
}

export function isAuthenticated() {
  return storage.isAuthed;
}

// async function delay (ms) {
//   return new Promise(function (resolve, reject) {
//     setTimeout(resolve, ms);
//   });
// }

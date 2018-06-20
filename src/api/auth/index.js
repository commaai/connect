import qs from 'query-string';

import * as storage from './storage';
import * as Api from '../';
export { oauthRedirectLink } from './google';

// seed cache
export async function init() {
  if (typeof window !== 'undefined') {
    if (window.location.pathname == "/auth/g/redirect") {
      var code = qs.parse(window.location.search)['code'];
      await Api.exchangeAndStoreTokens(code);
    }
  }

  return storage.getCommaAccessToken();
}

export function logOut() {
  storage.logOut();
  window.location.href = window.location.origin;
}

export function isAuthenticated() {
  return storage.isAuthed;
}

// async function delay (ms) {
//   return new Promise(function (resolve, reject) {
//     setTimeout(resolve, ms);
//   });
// }

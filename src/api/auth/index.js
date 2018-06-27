import document from 'global/document';

import * as storage from './storage';

export { oauthRedirectLink } from '../config';

// seed cache
export async function init() {
  const token = await storage.getCommaAccessToken();
  return token;
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

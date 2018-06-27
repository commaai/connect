import storage from 'localforage';

export { oauthRedirectLink } from './google';

export let isAuthed = false;
let useForage = true;

export function logOut () {
  localStorage.removeItem('authorization');
  if (useForage) {
    storage.removeItem('authorization');
  }
}

export function getTokenInternal () {
  if (typeof localStorage !== 'undefined') {
    if (localStorage.authorization) {
      return localStorage.authorization;
    }
  }
  return null;
}

export async function getCommaAccessToken () {
  let token = getTokenInternal();
  if (!token) {
    try {
      token = await storage.getItem('authorization');
    } catch (e) {
      useForage = false;
    }
  }

  if (token) {
    isAuthed = true;
    if (useForage) {
      await storage.setItem('authorization', token);
    }
  }

  return token;
}

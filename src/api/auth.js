import storage from 'localforage';

let isAuthed = false;
let useForage = true;

export async function getCommaAccessToken() {
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

// seed cache
var initPromise = getCommaAccessToken();
export async function init () {
  return initPromise;
}

function getTokenInternal() {
  if (typeof localStorage !== 'undefined') {
    if (localStorage.authorization) {
      return localStorage.authorization;
    }
  }
  return null;
}

export function isAuthenticated() {
  return isAuthed;
}

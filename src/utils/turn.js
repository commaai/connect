import { request as Request } from '@commaai/api';

const TURN_TTL_S = 1800;
const TURN_REFRESH_MARGIN_S = 100;

let cache = null;
let fetchedAt = null;
let pending = null;

export async function fetchTurnCredentials() {
  if (pending) return pending;
  pending = (async () => {
    const resp = await Request.get('v1/me/turn');
    cache = resp;
    fetchedAt = Math.floor(Date.now() / 1000);
    return resp;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export async function getTurnCredentials() {
  const now = Math.floor(Date.now() / 1000);
  if (cache && fetchedAt && (now - fetchedAt) < (TURN_TTL_S - TURN_REFRESH_MARGIN_S)) {
    return cache;
  }
  return fetchTurnCredentials();
}

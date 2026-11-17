import MyCommaAuth from '@commaai/my-comma-auth';

import { unsubscribeFromPush } from './notifications';

// Single logout path: clean up per-user client state, then clear the session.
export async function logOut() {
  await unsubscribeFromPush().catch((err) => console.error('Failed to unsubscribe from push:', err));
  await MyCommaAuth.logOut();
}

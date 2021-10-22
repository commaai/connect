import Auth from '@commaai/my-comma-auth';
import { request as Request } from '@commaai/comma-api'; // eslint-disable-line

import { selectDevice as selectDeviceAction } from '../actions';
import Segments from './segments';
import init from './startup';
import store from '../store';
import * as Demo from '../demo';

// fire off init method / construct init promises
export const initAuthPromise = Auth.init().then((token) => {
  Request.configure(token);
});
let hasGottenSegmentData = null;
const hasGottenSegmentDataPromise = new Promise(((resolve) => {
  hasGottenSegmentData = function segmentDataHandler() {
    hasGottenSegmentData = null;
    resolve();
  };
}));

store.subscribe(() => {
  const state = store.getState();

  if (hasGottenSegmentData && Segments.hasSegmentMetadata(state)) {
    hasGottenSegmentData();
  }
});

async function hello(data) {
  await initAuthPromise;
  store.dispatch(selectDeviceAction(data.dongleId));

  await Promise.all([
    init(Demo.isDemo()),
    hasGottenSegmentDataPromise
  ]);

  return 'hello';
}

export const commands = {
  hello,
};

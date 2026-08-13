import { webrtcConnectionManager } from './utils/webrtc';

export function webrtcMiddleware({ getState }) {
  return (next) => (action) => {
    const prevDongleId = getState().dongleId;
    const res = next(action);
    if (getState().dongleId !== prevDongleId) {
      webrtcConnectionManager.disconnect();
    }
    return res;
  };
}

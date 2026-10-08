import * as Types from '../actions/types';

// One controller per Redux store. Commands run synchronously in the click's
// user-activation task, including iOS/PWA play requests.
export const bindMedia = controller => ({ type: Types.ACTION_BIND_MEDIA, controller });
export const mediaTime = (route, offset) => ({ type: Types.ACTION_MEDIA_TIME, route, offset });

export const mediaMiddleware = ({ dispatch, getState }) => {
  let controller = null;
  return next => action => {
    if (action.type === Types.ACTION_BIND_MEDIA) {
      controller = action.controller;
      const binding = controller;
      next({ type: Types.ACTION_MEDIA_SOURCE, route: binding.route });
      binding.sync(getState(), true);
      return () => {
        if (controller === binding) {
          controller = null;
          dispatch({ type: Types.ACTION_MEDIA_SOURCE, route: null });
        }
      };
    }
    if (action.type === Types.ACTION_PAUSE || action.type === Types.ACTION_PLAY) {
      controller?.sample();
    }
    const result = next(action);
    if ([Types.ACTION_SEEK, Types.ACTION_LOOP, Types.ACTION_RESET].includes(action.type)) {
      controller?.sync(getState(), true);
    } else if (action.type === Types.ACTION_PLAY || action.type === Types.ACTION_PAUSE) {
      controller?.sync(getState(), false);
    }
    return result;
  };
};

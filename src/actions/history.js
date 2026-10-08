import { LOCATION_CHANGE } from 'connected-react-router';

import { parseUrl } from '../url';
import { commitView } from './index';

// Every location change, including the one a click just pushed, is applied
// the same way. Components do not write dongle, drive, or zoom themselves.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return undefined;
  if (action.type !== LOCATION_CHANGE) return next(action);

  const result = next(action);
  const location = action.payload.location;
  dispatch(commitView(parseUrl(location.pathname, location.search || '')));
  return result;
};

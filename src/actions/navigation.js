import { push } from 'connected-react-router';
import { locationForModal } from '../url';

// Closing a directly loaded modal works just like closing one opened in-app.
// A new history entry allows Back/Forward to restore either view reliably.
export function showModal(modal, device) {
  return (dispatch, getState) => {
    const location = getState().router.location;
    const target = locationForModal(location, modal, device);
    if (target.search !== location.search) dispatch(push(target));
  };
}

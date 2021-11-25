import { TIMELINE_SELECTION_CHANGED } from '../actions/types';

export default function zoom(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case TIMELINE_SELECTION_CHANGED:
      state.zoom = {
        start: action.start,
        end: action.end,
        expanded: Boolean(action.start && action.end),
      };
      break;
    default:
      return state;
  }

  return state;
}

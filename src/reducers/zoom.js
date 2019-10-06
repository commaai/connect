import { TIMELINE_SELECTION_CHANGED } from '../actions/types';

const initialState = {
  start: 0,
  end: 0,
  expanded: false
};

export default function zoom(_state = initialState, action) {
  let state = _state;
  switch (action.type) {
    case TIMELINE_SELECTION_CHANGED:
      state = {
        start: action.start,
        end: action.end,
        expanded: !!(action.start && action.end)
      };
      break;
    default:
      return state;
  }

  return state;
}

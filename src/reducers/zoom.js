import { TIMELINE_SELECTION_CHANGED } from '../actions/types';

const initialState = {
  start: 0,
  end: 0,
  expanded: false
};

export default function zoom(state = initialState, action) {
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

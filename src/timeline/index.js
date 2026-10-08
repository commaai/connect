import store from '../store';
import { currentOffset as offsetFromState } from './clock';

export function currentOffset(state = store.getState()) {
  return offsetFromState(state);
}

import store from '../store';
import { currentOffset as offsetForState } from './offset';
// UI convenience wrapper. Reducers use the pure calculation directly.
export function currentOffset(state = store.getState()) { return offsetForState(state); }

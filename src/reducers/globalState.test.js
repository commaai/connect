import { describe, expect, it } from 'vitest';

// evaluate the store before the reducer: globalState -> utils -> timeline ->
// store -> reducers is a module cycle that only resolves cleanly when
// store.js runs first
import '../store';
import * as Types from '../actions/types';
import reducer from './globalState';

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function stateWith(over = {}) {
  return {
    dongleId: DONGLE,
    zoom: { start: 0, end: 60000 },
    files: { '0.mp4': 'https://files.example/0.mp4' },
    ...over,
  };
}

describe('globalState reducer', () => {
  it('keeps cached files when a start-0 range stays inside the zoom', () => {
    const state = reducer(stateWith(), {
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: LOG,
      start: 0,
      end: 20000,
    });
    expect(state.files).toEqual({ '0.mp4': 'https://files.example/0.mp4' });
  });

  it('clears cached files when a range grows past the zoom', () => {
    const state = reducer(stateWith(), {
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: LOG,
      start: 0,
      end: 90000,
    });
    expect(state.files).toBeNull();
  });
});

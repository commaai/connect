vi.mock('../store', () => ({ default: { getState: vi.fn() } }));
import reducer from './globalState';
import { createInitialState } from '../initialState';
import * as Types from '../actions/types';

const DONGLE = 'aaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbb';
const ROUTE = `${DONGLE}|2026-08-06--12-00-00`;
const OLD_ROUTE = `${DONGLE}|2026-08-06--11-00-00`;
const file = `${ROUTE}--0/cameras`;
const state = { ...createInitialState(), dongleId: DONGLE, currentRoute: { fullname: ROUTE }, files: { [file]: { url: 'current' } } };

it.each([
  { type: Types.ACTION_FILES_URLS, dongleId: OTHER, routeName: `${OTHER}|2026-08-06--12-00-00`, urls: { [file]: { url: 'stale' } } },
  { type: Types.ACTION_FILES_URLS, dongleId: DONGLE, routeName: OLD_ROUTE, urls: { [`${OLD_ROUTE}--0/cameras`]: { url: 'stale' } } },
  { type: Types.ACTION_FILES_UPDATE, dongleId: OTHER, files: { [file]: { requested: true } } },
])('ignores files belonging to an earlier selection (%j)', action => {
  expect(reducer(state, action).files).toEqual(state.files);
});

it('updates queue data for another device without changing drive files', () => {
  const next = reducer(state, { type: Types.ACTION_FILES_UPLOADING, dongleId: OTHER,
    uploading: { '1': { fileName: 'other' } }, files: { [file]: { progress: 0.5 } } });
  expect(next.files).toEqual(state.files);
  expect(next.filesUploadingMeta.dongleId).toBe(OTHER);
});

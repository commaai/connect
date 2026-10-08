import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { ACTION_CURRENT_ROUTE, ACTION_ROUTES_METADATA } from '../actions/types';
import { createInitialState } from '../initialState';
import { play, seek } from '../timeline/playback';
import reducer from './globalState';
import rootReducer from '.';

vi.mock('../timeline', () => ({ currentOffset: () => 0 }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const route = { fullname: `${DONGLE}|${LOG}`, log_id: LOG, duration: 60000 };

const locationChange = (pathname, search = '') => ({
  type: LOCATION_CHANGE,
  payload: { action: 'POP', location: { pathname, search, hash: '' } },
});

describe('location changes', () => {
  it('project the URL into navigation state', () => {
    const state = reducer(createInitialState(), locationChange(`/${DONGLE}/${LOG}/10/20`, '?modal=settings'));
    expect(state).toMatchObject({
      page: 'drive',
      dongleId: DONGLE,
      selectedRouteId: LOG,
      currentRoute: null,
      zoom: { start: 10000, end: 20000 },
      modal: 'settings',
      modalDongleId: DONGLE,
    });
  });

  it('select the whole drive once its duration is known', () => {
    let state = reducer(createInitialState(), locationChange(`/${DONGLE}/${LOG}`));
    expect(state.zoom).toBeNull();
    state = reducer(state, { type: ACTION_CURRENT_ROUTE, route });
    expect(state.currentRoute).toEqual(route);
    expect(state.zoom).toEqual({ start: 0, end: 60000 });
  });

  it('reuse loaded routes for the same device', () => {
    let state = reducer(createInitialState(), locationChange(`/${DONGLE}`));
    state = reducer(state, { type: ACTION_ROUTES_METADATA, dongleId: DONGLE, start: 0, end: 1, routes: [route] });
    state = reducer(state, locationChange(`/${DONGLE}/${LOG}`));
    expect(state.currentRoute).toEqual(route);
    expect(state.zoom).toEqual({ start: 0, end: 60000 });
    state = reducer(state, locationChange(`/${DONGLE}`));
    expect(state.routes).toEqual([route]);
    expect(state.zoom).toBeNull();
  });

  it('load a drive outside the loaded list without touching the list', () => {
    const other = { ...route, fullname: `${DONGLE}|2026-08-06--13-00-00`, log_id: '2026-08-06--13-00-00' };
    const list = { routes: [other], routesMeta: { dongleId: DONGLE, start: 0, end: 1 } };
    let state = reducer(createInitialState(), locationChange(`/${DONGLE}`));
    state = reducer(state, { type: ACTION_ROUTES_METADATA, dongleId: DONGLE, start: 0, end: 1, routes: [other] });
    state = reducer(state, locationChange(`/${DONGLE}/${LOG}`));
    expect(state).toMatchObject({ ...list, currentRoute: null, zoom: null });
    state = reducer(state, { type: ACTION_CURRENT_ROUTE, route });
    expect(state).toMatchObject({ ...list, currentRoute: route, zoom: { start: 0, end: 60000 } });
    state = reducer(state, locationChange(`/${DONGLE}/${LOG}/10/20`, '?modal=settings'));
    expect(state).toMatchObject({ ...list, currentRoute: route, zoom: { start: 10000, end: 20000 } });
    state = reducer(state, locationChange(`/${DONGLE}`));
    expect(state).toMatchObject({ ...list, currentRoute: null, zoom: null });
  });

  it('mark a drive that does not exist', () => {
    let state = reducer(createInitialState(), locationChange(`/${DONGLE}/${LOG}`));
    state = reducer(state, { type: ACTION_CURRENT_ROUTE, route: null });
    expect(state).toMatchObject({ currentRoute: null, currentRouteMissing: true, zoom: null });
    state = reducer(state, locationChange(`/${DONGLE}/2026-08-06--13-00-00`));
    expect(state.currentRouteMissing).toBe(false);
  });

  it('drop the files when the device changes, even for the same log id', () => {
    const OTHER = '1111bbbb1111bbbb';
    const files = { [`${DONGLE}|${LOG}--0/qlogs`]: { url: 'https://files.example.com' } };
    let state = reducer(createInitialState(), locationChange(`/${DONGLE}/${LOG}`));
    state = reducer({ ...state, files }, locationChange(`/${DONGLE}/${LOG}/10/20`));
    expect(state.files).toEqual(files);
    state = reducer(state, locationChange(`/${OTHER}/${LOG}`));
    expect(state.files).toBeNull();
  });

  it('restart playback in another drive with the same range', () => {
    const playing = (state) => rootReducer(rootReducer(state, play(2)), seek(15000));
    let state = playing(rootReducer(createInitialState(), locationChange(`/${DONGLE}/${LOG}/10/20`)));
    expect(state).toMatchObject({ desiredPlaySpeed: 2, offset: 15000 });
    state = rootReducer(state, locationChange(`/${DONGLE}/2026-08-06--13-00-00/10/20`));
    expect(state).toMatchObject({ zoom: { start: 10000, end: 20000 }, desiredPlaySpeed: 1, offset: 10000 });
    state = rootReducer(playing(state), locationChange(`/1111bbbb1111bbbb/2026-08-06--13-00-00/10/20`));
    expect(state).toMatchObject({ zoom: { start: 10000, end: 20000 }, desiredPlaySpeed: 1, offset: 10000 });
  });
});

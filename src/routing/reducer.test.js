import { describe, it, expect } from 'vitest';
import { createInitialState } from '../initialState';
import reducer from '../reducers';
import { parseUrl } from './routes';
import { ROUTE_CHANGED } from './actions';
import * as Types from '../actions/types';
const D = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const R = '2026-08-06--12-00-00';
const navigate = (state, url) => reducer(state, { type: ROUTE_CHANGED, route: parseUrl(url) });
function loaded() {
 const state = createInitialState(`/${D}/drive/${R}`);
 const drive = { log_id: R, fullname: `${D}|${R}`, duration: 60000 };
 return { ...state, routes: [drive], currentRoute: drive, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 }, offset: 15000, files: { test: 'cached' }, limit: 5 };
}
describe('navigation state reuse', () => {
 it('keeps route, media and playback identities when opening and closing a dialog', () => {
   const state = loaded();
   const opened = navigate(state, `/${D}/drive/${R}?dialog=settings`);
   const closed = navigate(opened, `/${D}/drive/${R}`);
   for (const key of ['routes', 'files', 'currentRoute', 'zoom', 'loop', 'offset', 'startTime']) expect(closed[key]).toBe(state[key]);
 });
 it('changes a range without invalidating metadata or media', () => {
   const state = loaded();
   const next = navigate(state, `/${D}/drive/${R}/10/20`);
   expect(next.routes).toBe(state.routes);
   expect(next.files).toBe(state.files);
   expect(next.zoom).toMatchObject({ start: 10000, end: 20000 });
   expect(next.offset).toBe(10000);
 });
 it('restores cached device data on A -> B -> A', () => {
   const state = loaded();
   const other = reducer(state, { type: Types.ACTION_SELECT_DEVICE, dongleId: OTHER });
   const restored = reducer(other, { type: Types.ACTION_SELECT_DEVICE, dongleId: D });
   expect(restored.routes).toBe(state.routes);
   expect(restored.files).toBe(state.files);
   expect(restored.filter).toBe(state.filter);
 });
 it('keeps the dashboard list when loading a drive outside its filter', () => {
   const state = { ...loaded(), currentRoute: null, selectedRouteId: 'older-drive' };
   const older = { log_id: 'older-drive', fullname: D + '|older-drive', duration: 30000 };
   const next = reducer(state, { type: Types.ACTION_ROUTES_METADATA, dongleId: D, selectedRouteId: 'older-drive', routes: [older] });
   expect(next.routes).toBe(state.routes);
   expect(next.currentRoute.log_id).toBe('older-drive');
   expect(next.routeEntities[older.fullname]).toMatchObject(older);
 });
 it('ignores metadata for an inactive device', () => {
   const state = loaded();
   expect(reducer(state, { type: Types.ACTION_ROUTES_METADATA, dongleId: OTHER, routes: [] }).routes).toBe(state.routes);
 });
});

import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { navigate } from './navigation';
const DEVICE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';
const path = `/${DEVICE}/${LOG}/10/11`;
function setup(url = path) {
 const history = createMemoryHistory({initialEntries:[url]});
 const store = createAppStore(history, createInitialState(history.location));
 history.listen((location, action) => store.dispatch({type: LOCATION_CHANGE, payload:{location, action}}));
 store.dispatch({type:LOCATION_CHANGE,payload:{location:history.location,action:'POP'}});
 return {history,store};
}
beforeEach(() => {
 vi.spyOn(api.auth,'isAuthenticated').mockReturnValue(true);
 vi.spyOn(api.routes,'getRoutesSegments').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());
test('exact sub-millisecond input does not silently drift', () => {
 const {store}=setup();
 store.dispatch(navigate({page:'drive',dongleId:DEVICE,logId:LOG,zoom:{start:10100.25,end:10200.75}}));
 expect(store.getState().zoom).toEqual({start:10100.25,end:10200.75});
});
test('unusable precise history marker cannot crash a valid cold URL', () => {
 const {history,store}=setup();
 expect(() => history.replace({pathname:path,state:{connectZoom:{start:0,end:Number.MAX_SAFE_INTEGER}}})).not.toThrow();
 expect(store.getState().zoom).toEqual({start:10000,end:11000});
});

test('seeded fractional range navigation keeps exact selection and canonical URL', () => {
 const {history,store}=setup();
 let seed=773;
 for(let i=0;i<500;i++) {
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const start=(seed%55000)+.25;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const end=start+1+(seed%1000)+.125;
  store.dispatch(navigate({page:'drive',dongleId:DEVICE,logId:LOG,zoom:{start,end}}));
  expect(store.getState().zoom).toEqual({start,end});
  expect(history.location.pathname).toBe(`/${DEVICE}/${LOG}/${Math.floor(start/1000)}/${Math.ceil(end/1000)}`);
 }
});
test.each([null,0,NaN,-1,Infinity,'1',{start:0,end:0},{start:0,end:NaN},{start:-1,end:1},{start:3,end:2},{start:0,end:Infinity},{start:0,end:Number.MAX_SAFE_INTEGER}])('invalid precise marker %j never throws', (connectZoom) => {
 const {history}=setup();
 expect(()=>history.replace({pathname:path,state:{connectZoom}})).not.toThrow();
});

test('same rounded path with a different exact range replaces and restores through history', () => {
 const {history,store}=setup();
 const selection={page:'drive',dongleId:DEVICE,logId:LOG};
 store.dispatch(navigate({...selection,zoom:{start:10100.25,end:10200.75}}));
 const length=history.length;
 store.dispatch(navigate({...selection,zoom:{start:10200.25,end:10300.75}}));
 expect(history.length).toBe(length);
 expect(store.getState().zoom).toEqual({start:10200.25,end:10300.75});
 history.push(`/${DEVICE}/prime`);
 history.goBack();
 expect(store.getState().zoom).toEqual({start:10200.25,end:10300.75});
 history.goForward();
 expect(store.getState().primeNav).toBe(true);
 expect(store.getState().zoom).toBeNull();
});

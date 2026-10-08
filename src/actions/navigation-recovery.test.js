import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
function setup(url) {
 const history=createMemoryHistory({initialEntries:[url]});
 const store=createAppStore(history,createInitialState(history.location));
 history.listen((location,action)=>store.dispatch({type:LOCATION_CHANGE,payload:{location,action}}));
 store.dispatch({type:LOCATION_CHANGE,payload:{location:history.location,action:'POP'}});
 return {history,store};
}
beforeEach(()=>{
 vi.spyOn(api.auth,'isAuthenticated').mockReturnValue(true);
 vi.spyOn(api.routes,'getRoutesSegments').mockResolvedValue([]);
});
afterEach(()=>vi.restoreAllMocks());
test.each(['/demo/','/demo/NaN/Infinity','/demo/a/b/c','/demo/00000000--0000000001/0/0','/demo/00000000--0000000001/-1/3','/demo/00000000--0000000001/0/9007199254740991','/demo?modal=unknown','/demo?modal=files','/demo?device=x','/demo?modal=settings&modal=settings'])('malformed demo link %s recovers once with no extra history', url=>{
 const {history,store}=setup(url);
 expect(history.location.pathname).toBe('/demo');
 expect(history.length).toBe(1);
 expect(store.getState().dongleId).toBe('deadbeefdeadbeef');
 expect(store.getState().selectedRouteId).toBeNull();
});
test('recovery from invalid push keeps previous valid drive available on Back',()=>{
 const device='aaaaaaaaaaaaaaaa';
 const log='2026-08-06--12-00-00';
 const {history,store}=setup(`/${device}/${log}/0/20`);
 history.push(`/${device}/bad/NaN/NaN?theme=dark&modal=bogus#map`);
 expect(history.location.pathname).toBe(`/${device}`);
 expect(history.location.search).toBe('?theme=dark');
 expect(history.location.hash).toBe('#map');
 expect(history.length).toBe(2);
 history.goBack();
 expect(store.getState().selectedRouteId).toBe(log);
 expect(store.getState().zoom).toEqual({start:0,end:20000});
});

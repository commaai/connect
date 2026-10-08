import React from 'react';
import { render, screen, act } from '@testing-library/react';
import DriveVideo from './index';
import { createAppStore } from '../../store';
import { createInitialState } from '../../initialState';
import { createMemoryHistory } from 'history';
import { seek, play } from '../../timeline/playback';
vi.mock('./transport',()=>({ attachSource:(_video, {onTimeline})=>{
 queueMicrotask(()=>onTimeline([{number:0,start:0,duration:60}]));
 return {destroy:vi.fn(),reportError:vi.fn()};
} }));
vi.mock('./VideoStatus',()=>({default:()=>null}));
const route={fullname:'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00',duration:60000,segment_numbers:[0],segment_start_times:[0],segment_end_times:[60000]};
let playing=false;
beforeEach(()=>{
 playing=false;
 vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(){playing=true; return Promise.resolve();});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(){playing=false;});
 vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 vi.spyOn(HTMLMediaElement.prototype,'paused','get').mockImplementation(()=>!playing);
 vi.spyOn(HTMLMediaElement.prototype,'readyState','get').mockReturnValue(4);
 vi.spyOn(HTMLMediaElement.prototype,'buffered','get').mockReturnValue({length:1,start:()=>0,end:()=>60});
 vi.spyOn(HTMLMediaElement.prototype,'duration','get').mockReturnValue(60);
});
afterEach(()=>vi.restoreAllMocks());
function mount(){
 const history=createMemoryHistory();
 const store=createAppStore(history,{...createInitialState(),currentRoute:route,selectedRouteId:'2026-08-06--12-00-00',
 dongleId:'aaaaaaaaaaaaaaaa',zoom:{start:0,end:60000},loop:{startTime:0,duration:60000}});
 const view=render(<DriveVideo store={store} isMuted={true}/>);
 return {...view,store,video:screen.getByLabelText('Drive video')};
}
test('real controller external pause persists through progress and metadata events',async()=>{
 const {store,video}=mount();
 await act(async()=>{});
 act(()=>{playing=false;video.dispatchEvent(new Event('pause'));});
 expect(store.getState().desiredPlaySpeed).toBe(0);
 const playCalls=video.play.mock.calls.length;
 act(()=>{video.currentTime=3;video.dispatchEvent(new Event('timeupdate'));video.dispatchEvent(new Event('loadedmetadata'));});
 expect(video.play.mock.calls.length).toBe(playCalls);
 expect(store.getState().offset).toBe(3000);
});
test('real controller applies zero and 1ms seeks synchronously without source remount',async()=>{
 const {store,video}=mount();
 await act(async()=>{});
 act(()=>store.dispatch(seek(1)));
 expect(video.currentTime).toBe(.001);
 act(()=>store.dispatch(seek(0)));
 expect(video.currentTime).toBe(0);
 expect(screen.getByLabelText('Drive video')).toBe(video);
 act(()=>store.dispatch(play(.5)));
 expect(video.playbackRate).toBe(.5);
});

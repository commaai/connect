import React from 'react';
import { Provider } from 'react-redux';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

import store from '../../store';
import { currentOffset } from '../../timeline';
import * as Types from '../../actions/types';
import { pause, play, seek, selectLoop } from '../../timeline/playback';
import DriveVideo from '.';

const ROUTE = { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--10-00-00', log_id: '2026-08-06--10-00-00', duration: 60000, videoStartOffset: 2000 };

const video = { currentTime: 0, ended: false, play: vi.fn(async () => undefined) };
let player = {};
vi.mock('react-player/file', () => ({
  default: React.forwardRef((props, ref) => {
    player = props;
    React.useImperativeHandle(ref, () => ({ getInternalPlayer: () => video }));
    return null;
  }),
}));

function renderLoadedVideo() {
  const view = render(<Provider store={store}><DriveVideo /></Provider>);
  act(() => { player.onDuration(); });
  return view;
}

describe('DriveVideo', () => {
  beforeAll(() => {
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: 'aaaaaaaaaaaaaaaa', routes: [ROUTE] });
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: ROUTE.log_id });
    store.dispatch(selectLoop(0, 30000));
  });

  beforeEach(() => {
    store.dispatch(pause());
    store.dispatch(seek(5000));
  });

  it('becomes the playback clock once loaded, starting where playback was', () => {
    renderLoadedVideo();
    expect(video.currentTime).toEqual(3);
    expect(store.getState().isBufferingVideo).toEqual(false);

    video.currentTime = 10;
    expect(currentOffset()).toEqual(ROUTE.videoStartOffset + 10000);
  });

  it('carries out seeks', () => {
    renderLoadedVideo();
    act(() => { store.dispatch(seek(20000)); });
    expect(video.currentTime).toEqual(18);
  });

  it('wraps to the loop start past the end of the loop', () => {
    renderLoadedVideo();
    video.currentTime = 29;
    act(() => { player.onProgress(); });
    expect(video.currentTime).toEqual(0);
    expect(currentOffset()).toEqual(ROUTE.videoStartOffset);
  });

  it('stops buffering when waiting and playing fire back to back', () => {
    renderLoadedVideo();
    act(() => {
      player.onBuffer();
      player.onBufferEnd();
    });
    expect(store.getState().isBufferingVideo).toEqual(false);
  });

  it('follows pauses that come from the browser', () => {
    renderLoadedVideo();
    act(() => { store.dispatch(play()); });
    act(() => { player.onPause(); });
    expect(store.getState().desiredPlaySpeed).toEqual(0);
  });

  it('hands the clock back to redux when unmounted', () => {
    const view = renderLoadedVideo();
    video.currentTime = 7;
    view.unmount();
    expect(store.getState().offset).toEqual(9000);
    video.currentTime = 1;
    expect(currentOffset()).toEqual(9000);
  });
});

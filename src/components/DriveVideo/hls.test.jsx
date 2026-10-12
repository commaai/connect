import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { act, render, waitFor } from '@testing-library/react';

import DriveVideo from '.';
import { reducer, seek } from '../../timeline/playback';

const created = [];
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (route) => `https://video.test/${route}.m3u8` } },
}));
vi.mock('hls.js/light', () => {
  class Hls {
    static isSupported() { return true; }

    constructor(config) { this.config = config; this.loads = []; created.push(this); }

    on() {}

    loadSource() {}

    attachMedia() {}

    startLoad(position) { this.loads.push(position); }

    destroy() {}
  }
  Hls.Events = {};
  Hls.ErrorTypes = {};
  Hls.ErrorDetails = {};
  return { default: Hls };
});

async function setup() {
  created.length = 0;
  const store = createStore((state = {
    desiredPlaySpeed: 1, offset: null, seekId: 0, loop: null,
    currentRoute: { fullname: 'dongle|route', videoStartOffset: 0 },
  }, action) => reducer(state, action));
  render(<Provider store={store}><DriveVideo /></Provider>);
  await waitFor(() => expect(created).toHaveLength(1));
  return { store, hls: created[0] };
}

it('transmuxes off the main thread', async () => {
  const { hls } = await setup();
  expect(hls.config.workerPath).toBeTruthy(); // the light ES build has no inline worker
});

it('loads from a position chosen before the first segment arrived, instead of dropping the seek', async () => {
  const { store, hls } = await setup();
  act(() => { store.dispatch(seek(230000)); }); // video has no metadata yet (readyState 0)
  expect(hls.loads).toEqual([230]);
});

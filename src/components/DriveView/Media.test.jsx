import React from 'react';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import Media from './Media';
import { createAppStore } from '../../store';
import * as Types from '../../actions/types';

vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: (name) => `https://example.test/${name}/qcamera.m3u8` } } }));
vi.mock('../DriveMap', () => ({ default: () => null }));

describe('Media', () => {
  it('starts the next drive muted: its new video may only play with sound after a tap', async () => {
    window.MediaSource = undefined;
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
    const store = createAppStore(createMemoryHistory());
    store.dispatch({
      type: Types.ACTION_ROUTES_METADATA,
      routes: [{ log_id: 'r', fullname: 'x|r', duration: 180000 }, { log_id: 's', fullname: 'x|s', duration: 180000 }],
    });
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'r', start: 0, end: 180000 });
    render(<Provider store={store}><Media /></Provider>);
    const first = document.querySelector('video');
    // the user unmutes drive r with a tap (as if it had an audio track)
    Object.defineProperty(first, 'audioTracks', { value: [{}] });
    fireEvent.loadedMetadata(first);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Unmute' })));
    expect(first.muted).toBe(false);

    // browser Back goes straight to drive s: no tap
    await act(async () => store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 's', start: 0, end: 180000 }));
    const next = document.querySelector('video');
    expect(next).not.toBe(first);
    expect(next.muted).toBe(true);
  });
});

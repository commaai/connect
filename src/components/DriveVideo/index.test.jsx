import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import DriveVideo, { DriveVideo as PlayerView } from '.';
import { loadVideoSource } from './source';
import { reducer } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({ api: { video: {
  getQcameraStreamUrl: (fullname) => `https://video.test/${fullname}.m3u8`,
} } }));
vi.mock('./source', () => ({ loadVideoSource: vi.fn(() => vi.fn()) }));
const initial = { currentRoute: { fullname: 'a|one', duration: 60000, videoStartOffset: 0 },
  zoom: { start: 0, end: 60000 }, offset: 0, playSpeed: 1, playRequested: true, isPaused: true };
let play;
beforeEach(() => {
  loadVideoSource.mockClear();
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () { this.currentTime = 0; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(element = null) {
  const store = createStore(reducer, initial, applyMiddleware(thunk));
  const view = render(<Provider store={store}>{element ?? <DriveVideo isMuted />}</Provider>);
  const video = view.container.querySelector('video');
  Object.defineProperties(video, { readyState: { configurable: true, value: 2 },
    duration: { configurable: true, value: 60 } });
  return { ...view, video, store };
}

it('Tap to play issues a fresh command even though the rate remains one', async () => {
  const { video } = mount();
  play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
  await act(async () => fireEvent.loadedMetadata(video));
  fireEvent.click(await screen.findByRole('button', { name: 'Tap to play' }));
  expect(play).toHaveBeenCalledTimes(2);
});

it('Retry seeks to actual media position instead of the last Redux snapshot', () => {
  const { video, store } = mount();
  fireEvent.loadedMetadata(video);
  video.currentTime = 12.5;
  expect(store.getState().offset).toBe(0);
  act(() => loadVideoSource.mock.calls.at(-1)[2].onError('Unable to load video. Check your connection.'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(12.5);
  expect(store.getState().offset).toBe(12500);
});

it('keeps recovery controls accessible while the map hides the video image', () => {
  mount(<DriveVideo isMuted hidden />);
  act(() => loadVideoSource.mock.calls.at(-1)[2].onError('Unable to load video. Check your connection.'));
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retry' })).not.toHaveAttribute('tabindex', '-1');
});

it('survives StrictMode source teardown and ignores an obsolete source failure', () => {
  // Test the player boundary: legacy react-redux v5 does not support StrictMode's dev remount.
  const { unmount } = mount(<React.StrictMode><PlayerView {...initial} dispatch={vi.fn()} isMuted /></React.StrictMode>);
  expect(loadVideoSource).toHaveBeenCalledTimes(2);
  act(() => loadVideoSource.mock.calls[0][2].onError('Obsolete source'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  unmount();
  expect(loadVideoSource.mock.results.at(-1).value).toHaveBeenCalledOnce();
});

import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import { DriveVideo } from './index';
import { createPlayer } from './player';
import { reducer as playbackReducer } from '../../timeline/playback';
vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: (name) => name } } }));
vi.mock('../../store', () => ({ default: { getState: vi.fn() } }));
vi.mock('./player', () => ({ createPlayer: vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() })) }));
const route = { fullname: 'device|route' };
const props = { currentRoute: route, desiredPlaySpeed: 1, offset: 10000, isMuted: true,
  loop: { startTime: 0, duration: 60000 }, dispatch: vi.fn(), onAudioStatusChange: vi.fn() };
it('keeps the same native element and player when switching to the map', () => {
  const view = render(<DriveVideo {...props} showVideo />);
  const video = screen.getByLabelText('Drive video');
  const player = createPlayer.mock.results.at(-1).value;
  view.rerender(<DriveVideo {...props} showVideo={false} />);
  expect(screen.getByLabelText('Drive video')).toBe(video);
  expect(video).toHaveAttribute('playsinline');
  expect(player.destroy).not.toHaveBeenCalled();
  view.unmount(); expect(player.destroy).toHaveBeenCalledOnce();
});
it('retry disposes the old player and retains the requested position', () => {
  const view = render(<DriveVideo {...props} />);
  const oldPlayer = createPlayer.mock.results.at(-1).value;
  act(() => createPlayer.mock.calls.at(-1)[1].onStatus({ error: 'Missing segment' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(oldPlayer.destroy).toHaveBeenCalledOnce();
  const player = createPlayer.mock.results.at(-1).value;
  expect(player.update).toHaveBeenLastCalledWith(expect.objectContaining({ seekOffset: 10000 }));
  view.unmount();
});
it('source replacement ignores retired status callbacks', () => {
  const view = render(<DriveVideo {...props} />);
  const old = createPlayer.mock.calls.at(-1)[1];
  view.rerender(<DriveVideo {...props} currentRoute={{ fullname: 'device|next' }} />);
  act(() => old.onStatus({ error: 'Retired failure' }));
  expect(screen.queryByText('Retired failure')).not.toBeInTheDocument();
  view.unmount();
});

it('forwards late alignment to the existing player without reloading its source', () => {
  const view = render(<DriveVideo {...props} />);
  const player = createPlayer.mock.results.at(-1).value;
  const count = createPlayer.mock.calls.length;
  const currentRoute = { ...route, videoStartOffset: 5000 };
  view.rerender(<DriveVideo {...props} currentRoute={currentRoute} />);
  expect(createPlayer).toHaveBeenCalledTimes(count);
  expect(player.destroy).not.toHaveBeenCalled();
  expect(player.update).toHaveBeenLastCalledWith(expect.objectContaining({ currentRoute }));
  view.unmount();
});
it('Retry captures the advanced map-only clock before dispatch changes it, despite stale React props', () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  let state = { ...props, mediaSource: null, startTime: Date.now(), isBufferingVideo: false };
  const dispatch = action => {
    if (typeof action === 'function') return action(dispatch, () => state);
    if (action.type === 'ACTION_BIND_MEDIA') return () => {};
    state = playbackReducer(state, action);
    return action;
  };
  const view = render(<DriveVideo {...props} dispatch={dispatch} showVideo={false} />);
  try {
    act(() => createPlayer.mock.calls.at(-1)[1].onStatus({ error: 'Missing segment', buffering: false }));
    vi.advanceTimersByTime(20000);
    expect(state.offset).toBe(10000);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const player = createPlayer.mock.results.at(-1).value;
    expect(player.update).toHaveBeenLastCalledWith(expect.objectContaining({ seekOffset: 30000 }));
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

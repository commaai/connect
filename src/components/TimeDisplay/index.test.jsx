import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import TimeDisplay from '.';
import { pause, play, reducer } from '../../timeline/playback';

const mocks = vi.hoisted(() => ({ offset: 25000, ios: false, subscribeFrames: vi.fn() }));
vi.mock('../../timeline', () => ({ currentOffset: () => mocks.offset, subscribePlaybackFrames: mocks.subscribeFrames }));
vi.mock('../../utils/browser.js', () => ({ isIos: () => mocks.ios }));

function renderControls(overrides = {}, mediaProps = {}) {
  const fullname = 'demo|route';
  const state = {
    currentRoute: { fullname, duration: 60000, start_time_utc_millis: 0 },
    playbackRoute: fullname, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 },
    offset: mocks.offset, seekRequest: { id: 1, offset: 0 }, desiredPlaySpeed: 1, isBufferingVideo: false,
    ...overrides,
  };
  const store = createStore(reducer, state);
  const onMuteToggle = vi.fn();
  const view = render(<Provider store={store}><TimeDisplay isThin hasAudio isMuted onMuteToggle={onMuteToggle} {...mediaProps} /></Provider>);
  return { ...view, store, onMuteToggle };
}

beforeEach(() => {
  mocks.offset = 25000;
  mocks.ios = false;
  mocks.subscribeFrames.mockReset().mockImplementation(() => vi.fn());
});

describe('playback controls', () => {
  it('groups back, Play/Pause, and forward in that order using native buttons', () => {
    const { store } = renderControls();
    const buttons = within(screen.getByRole('group', { name: 'Playback transport' })).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Jump back 10 seconds', 'Pause', 'Jump forward 10 seconds']);
    buttons.forEach((button) => expect(button.tagName).toBe('BUTTON'));
    buttons[1].focus();
    expect(buttons[1]).toHaveFocus();
    fireEvent.click(buttons[1]);
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(screen.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  it('seeks ten seconds around the native video position', () => {
    const { store } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Jump back 10 seconds' }));
    expect(store.getState().seekRequest.offset).toBe(15000);
    mocks.offset = 35000;
    fireEvent.click(screen.getByRole('button', { name: 'Jump forward 10 seconds' }));
    expect(store.getState().seekRequest.offset).toBe(45000);
    expect(store.getState().offset).toBe(25000);
  });

  it('cycles the supported rates upward and wraps without arrow controls', () => {
    const { store } = renderControls();
    expect(screen.queryByRole('button', { name: /Increase play speed|Decrease play speed/ })).not.toBeInTheDocument();
    for (const speed of [2, 4, 8, 0.1, 0.25, 0.5, 1]) {
      fireEvent.click(screen.getByRole('button', { name: /Playback speed, current/ }));
      expect(store.getState().desiredPlaySpeed).toBe(speed);
      expect(screen.getByRole('button', { name: `Playback speed, current ${speed}x` })).toHaveTextContent(`${speed}×`);
    }
  });

  it('remembers the chosen rate through pause and changes it without resuming', () => {
    const { store } = renderControls({ desiredPlaySpeed: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true }));
    expect(screen.getByRole('button', { name: 'Playback speed, current 2x' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Playback speed, current 2x' }));
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(screen.getByRole('button', { name: 'Playback speed, current 4x' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true }));
    expect(store.getState().desiredPlaySpeed).toBe(4);
    act(() => store.dispatch(pause()));
    fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true }));
    expect(store.getState().desiredPlaySpeed).toBe(4);
  });

  it('tracks a playback-rate change from elsewhere before cycling', () => {
    const { store } = renderControls();
    act(() => store.dispatch(play(0.25)));
    fireEvent.click(screen.getByRole('button', { name: 'Playback speed, current 0.25x' }));
    expect(store.getState().desiredPlaySpeed).toBe(0.5);
  });

  it('keeps speed changes unavailable on iOS', () => {
    mocks.ios = true;
    renderControls();
    expect(screen.queryByRole('button', { name: /Playback speed/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Playback transport' })).toBeVisible();
  });

  it('retains mute controls and disables them for a silent route', () => {
    const { onMuteToggle, unmount } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Unmute', exact: true }));
    expect(onMuteToggle).toHaveBeenCalledOnce();
    unmount();
    renderControls({}, { hasAudio: false });
    expect(screen.getByRole('button', { name: 'Unmute', exact: true })).toBeDisabled();
  });

  it('updates the visible time through the shared clock and unsubscribes on close', () => {
    const { unmount } = renderControls();
    const time = screen.getByLabelText('Current playback time');
    const initial = time.textContent;
    mocks.offset += 2000;
    act(() => mocks.subscribeFrames.mock.calls[0][0]());
    expect(time.textContent).not.toBe(initial);
    const unsubscribe = mocks.subscribeFrames.mock.results[0].value;
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

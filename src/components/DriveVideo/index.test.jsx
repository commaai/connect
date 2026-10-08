import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import * as Redux from 'redux';
import { describe, expect, it, vi } from 'vitest';

import DriveVideo from './index';

const mocks = vi.hoisted(() => ({ playerProps: null }));

vi.mock('react-player/file', () => ({
  default: React.forwardRef((props, ref) => {
    mocks.playerProps = props;
    React.useImperativeHandle(ref, () => ({
      getCurrentTime: () => 0,
      getDuration: () => 0,
      getInternalPlayer: () => null,
      seekTo: vi.fn(),
    }));
    return null;
  }),
}));
vi.mock('../../timeline', () => ({ currentOffset: vi.fn(() => 0) }));

const initialState = {
  dongleId: null,
  desiredPlaySpeed: 1,
  offset: 0,
  startTime: 0,
  isBufferingVideo: false,
  routes: null,
  currentRoute: null,
};

function renderVideo() {
  const actions = [];
  const store = Redux.createStore((state = initialState, action) => {
    actions.push(action);
    return state;
  });
  render(<Provider store={store}><DriveVideo /></Provider>);
  return { actions };
}

function emitHlsError(data) {
  act(() => {
    mocks.playerProps.onError('hlsError', data);
  });
}

describe('DriveVideo HLS errors', () => {
  it('keeps buffering on a non-fatal error instead of showing an error', () => {
    const { actions } = renderVideo();
    emitHlsError({ type: 'networkError', details: 'fragLoadError', fatal: false, response: { code: 500 } });
    expect(actions).toContainEqual(expect.objectContaining({ type: 'ACTION_BUFFER_VIDEO', buffering: true }));
    expect(screen.queryByText('Unable to load video')).not.toBeInTheDocument();
  });

  it('shows an error once a network error is fatal', () => {
    renderVideo();
    emitHlsError({ type: 'networkError', details: 'manifestLoadError', fatal: true, response: { code: 500 } });
    expect(screen.getByText('Unable to load video')).toBeVisible();
  });

  it('explains a fatal 404 for a segment that is missing', () => {
    renderVideo();
    emitHlsError({ type: 'networkError', details: 'fragLoadError', fatal: true, response: { code: 404 } });
    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeVisible();
  });
});

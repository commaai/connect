import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { publicRoute } from '../../../config/vitest/publicRoute';
import { reducer, mediaState } from '../../timeline/playback';
import TimeDisplay from './index';

it('uses its own observed store and accumulates rapid commands while a seek is pending', () => {
  const store = createStore(reducer, {
    currentRoute: publicRoute, zoom: { start: 0, end: publicRoute.duration },
    offset: 60000, isPlaying: false, desiredPlaySpeed: 1, playRequest: 0,
    seekRequest: { offset: null, id: 0 },
  });
  render(<Provider store={store}><TimeDisplay isThin isMuted hasAudio={false} /></Provider>);
  expect(screen.getByLabelText('Unpause')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Unpause'));
  expect(store.getState().playRequest).toBe(1);
  fireEvent.click(screen.getByLabelText('Jump forward 10 seconds'));
  fireEvent.click(screen.getByLabelText('Jump forward 10 seconds'));
  fireEvent.click(screen.getByLabelText('Jump back 10 seconds'));
  expect(store.getState().seekRequest.offset).toBe(70000);
  expect(store.getState().offset).toBe(60000);
  // A browser event acknowledges actual position; commands have not moved it.
  act(() => store.dispatch(mediaState(publicRoute.fullname, { offset: 70000 })));
  expect(store.getState().offset).toBe(70000);
});

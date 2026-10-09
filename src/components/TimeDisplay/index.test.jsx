import React from 'react';
import * as Redux from 'redux';
import { act, fireEvent, render, screen } from '@testing-library/react';

import TimeDisplay from '.';
import rootReducer from '../../reducers';
import { createInitialState } from '../../initialState';
import { setPlaybackSpeed } from '../../timeline/playback';

describe('time display', () => {
  it('steps from a speed between steps', () => {
    const store = Redux.createStore(rootReducer, { ...createInitialState('/'), currentRoute: {}, desiredPlaySpeed: 1.25 });
    render(<TimeDisplay store={store} />);
    expect(screen.getByText(/1\.25/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Increase play speed by 1 step'));
    expect(store.getState().desiredPlaySpeed).toEqual(2);

    act(() => store.dispatch(setPlaybackSpeed(1.25)));
    fireEvent.click(screen.getByLabelText('Decrease play speed by 1 step'));
    expect(store.getState().desiredPlaySpeed).toEqual(1);
  });
});

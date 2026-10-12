import React from 'react';
import { Provider } from 'react-redux';
import { act, fireEvent, render, screen } from '@testing-library/react';

import PlayerBox from './PlayerBox';

vi.mock('../../hooks/window', () => ({ useIsLandscape: () => false }));

const renderBox = (desiredPlaySpeed) => {
  const store = { getState: () => ({ desiredPlaySpeed }), subscribe: () => () => {}, dispatch: vi.fn() };
  render(<Provider store={store}><PlayerBox controls={<div data-testid="controls" />}><div data-testid="layer" /></PlayerBox></Provider>);
  return screen.getByTestId('controls').parentElement;
};

describe('PlayerBox', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hides the controls after the pointer is idle while playing, and brings them back on movement', () => {
    const controls = renderBox(1);
    expect(controls.className).toContain('opacity-100');

    act(() => { vi.advanceTimersByTime(2600); });
    expect(controls.className).toContain('opacity-0');

    fireEvent.pointerMove(screen.getByTestId('layer'));
    expect(controls.className).toContain('opacity-100');
  });

  it('keeps the controls while paused', () => {
    const controls = renderBox(0);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(controls.className).toContain('opacity-100');
  });
});

/* eslint-env jest */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';

import ResizeHandler from '.';
import { asyncSleep } from '../../utils';

describe('resize handler', () => {
  it('registers, triggers and unregistered resize listener', async () => {
    let aResizeEventListenerWasAddedToWindow = false;
    let aResizeEventListenerWasRemovedFromWindow = false;

    const originalAddMethod = window.addEventListener;
    const addSpy = jest.spyOn(window, 'addEventListener');

    addSpy.mockImplementation((...args) => {
      originalAddMethod(...args);

      const [eventType] = args;
      if (eventType === 'resize') {
        aResizeEventListenerWasAddedToWindow = true;
      }
    });

    const originalRemoveMethod = window.removeEventListener;
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    removeSpy.mockImplementation((...args) => {
      const [eventType] = args;
      if (eventType === 'resize') {
        aResizeEventListenerWasRemovedFromWindow = true;
      }

      originalRemoveMethod(...args);
    });

    const container = document.createElement('div');
    const callback = jest.fn();
    const { unmount } = render(<ResizeHandler onResize={callback} />, { container });

    // Wait for the resize handler in the component to be registered (useEffect callback is async)
    await waitFor(() => expect(aResizeEventListenerWasAddedToWindow).toBeTruthy());
    fireEvent.resize(window);
    await asyncSleep(150);
    expect(callback).toHaveBeenCalled();

    unmount();

    // Wait for resize handler in the component to be unregistered
    await waitFor(() => expect(aResizeEventListenerWasRemovedFromWindow).toBeTruthy());

    // Restore the original methods to window
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

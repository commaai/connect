import { vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';

import { subscribeWindowSize } from './window';
import { asyncSleep } from '../utils';

describe('subscribeWindowSize', () => {
  it('registers, triggers and unregisters resize listener', async () => {
    let aResizeEventListenerWasAddedToWindow = false;
    let aResizeEventListenerWasRemovedFromWindow = false;

    const originalAddMethod = window.addEventListener;
    const addSpy = vi.spyOn(window, 'addEventListener');

    addSpy.mockImplementation((...args) => {
      originalAddMethod(...args);

      const [eventType] = args;
      if (eventType === 'resize') {
        aResizeEventListenerWasAddedToWindow = true;
      }
    });

    const originalRemoveMethod = window.removeEventListener;
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    removeSpy.mockImplementation((...args) => {
      const [eventType] = args;
      if (eventType === 'resize') {
        aResizeEventListenerWasRemovedFromWindow = true;
      }

      originalRemoveMethod(...args);
    });

    const callback = vi.fn();
    const unsubscribe = subscribeWindowSize(callback);

    await waitFor(() => expect(aResizeEventListenerWasAddedToWindow).toBeTruthy());
    fireEvent.resize(window);
    await asyncSleep(150);
    expect(callback).toHaveBeenCalledWith({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    unsubscribe();

    await waitFor(() => expect(aResizeEventListenerWasRemovedFromWindow).toBeTruthy());

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

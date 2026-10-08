import React from 'react';
import { act, render } from '@testing-library/react';
import { VisibilityHandler } from '.';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('refreshes on window focus once the minimum interval has elapsed', () => {
  const onVisible = vi.fn();
  render(<VisibilityHandler onVisible={onVisible} minInterval={10} />);
  act(() => vi.advanceTimersByTime(10000));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(onVisible).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(onVisible).toHaveBeenCalledTimes(1);
});

test('window blur resets the interval when requested', () => {
  const onVisible = vi.fn();
  render(<VisibilityHandler onVisible={onVisible} minInterval={10} resetOnHidden />);
  act(() => vi.advanceTimersByTime(15000));
  act(() => window.dispatchEvent(new Event('blur')));
  act(() => vi.advanceTimersByTime(5000));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(onVisible).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(5000));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(onVisible).toHaveBeenCalledTimes(1);
});

test('refreshes every configured interval, including its exact boundary', () => {
  const onVisible = vi.fn();
  const view = render(<VisibilityHandler onVisible={onVisible} onInterval={10} minInterval={10} />);
  act(() => vi.advanceTimersByTime(30000));
  expect(onVisible).toHaveBeenCalledTimes(3);
  view.unmount();
  act(() => vi.advanceTimersByTime(20000));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(onVisible).toHaveBeenCalledTimes(3);
});

test('ignores hidden interval ticks and refreshes when visibility returns', () => {
  const onVisible = vi.fn();
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  render(<VisibilityHandler onVisible={onVisible} onInterval={10} minInterval={10} />);
  act(() => vi.advanceTimersByTime(20000));
  expect(onVisible).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(onVisible).toHaveBeenCalledTimes(1);
});

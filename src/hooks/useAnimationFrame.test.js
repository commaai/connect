import { act, renderHook } from '@testing-library/react';
import useAnimationFrame from './useAnimationFrame';

afterEach(() => vi.unstubAllGlobals());

it('reads the latest callback without restarting the loop and cancels its pending frame', () => {
  const frames = [];
  const request = vi.fn((callback) => { frames.push(callback); return frames.length; });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(({ callback }) => useAnimationFrame(callback), {
    initialProps: { callback: first },
  });
  act(() => frames[0]());
  expect(first).toHaveBeenCalledOnce();
  rerender({ callback: second });
  expect(request).toHaveBeenCalledTimes(2);
  act(() => frames[1]());
  expect(second).toHaveBeenCalledOnce();
  expect(first).toHaveBeenCalledOnce();
  unmount();
  expect(cancel).toHaveBeenCalledWith(3);
});

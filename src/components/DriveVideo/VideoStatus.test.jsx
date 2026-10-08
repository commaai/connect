import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import VideoStatus from './VideoStatus';

it('keeps Retry outside video pixels and invokes only its callback', () => {
  const onRetry = vi.fn();
  render(<VideoStatus error="Unable to load video" onRetry={onRetry} />);
  expect(screen.getByRole('status')).toHaveTextContent('Unable to load video');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
it('offers a user gesture after blocked play', () => {
  const onPlay = vi.fn();
  render(<VideoStatus blocked onPlay={onPlay} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
  expect(onPlay).toHaveBeenCalledOnce();
});
it('does not leave an overlay on ready playback', () => {
  render(<VideoStatus />);
  expect(screen.queryByRole('status')).toBeNull();
});

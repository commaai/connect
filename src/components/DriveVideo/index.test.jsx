import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DriveVideo } from './index';

const sessions = vi.hoisted(() => []);
vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: (route) => `https://example.com/${route}.m3u8` } } }));
vi.mock('./VideoSession', () => ({ default: class {
  constructor(element, _dispatch, onError) {
    this.element = element;
    this.onError = onError;
    sessions.push(this);
  }
  update = vi.fn(); load = vi.fn(); destroy = vi.fn();
} }));

const currentRoute = { fullname: 'route' };
let dispatch;
beforeEach(() => {
  sessions.length = 0;
  dispatch = vi.fn(() => vi.fn());
});

it('keeps native controls usable during buffering and retries with the audio preference', () => {
  render(<DriveVideo currentRoute={currentRoute} dispatch={dispatch} isBufferingVideo />);
  const video = screen.getByLabelText('Drive video');
  expect(video).toHaveAttribute('controls');
  expect(video).toHaveAttribute('playsinline');
  expect(video.muted).toBe(true);
  video.muted = false;
  video.volume = 0.4;
  act(() => sessions[0].onError('Unavailable segment'));
  expect(screen.getByRole('alert')).toHaveTextContent('Unavailable segment');
  fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
  expect(sessions[0].destroy).toHaveBeenCalledOnce();
  expect(sessions[1].element).not.toBe(video);
  expect(sessions[1].element.muted).toBe(false);
  expect(sessions[1].element.volume).toBe(0.4);
});

it('preserves the video element and source when switching to the map', () => {
  const view = render(<DriveVideo currentRoute={currentRoute} dispatch={dispatch} />);
  const video = screen.getByLabelText('Drive video');
  view.rerender(<DriveVideo currentRoute={currentRoute} dispatch={dispatch} hidden />);
  expect(sessions).toHaveLength(1);
  expect(video.parentElement).toHaveAttribute('hidden');
  expect(sessions[0].destroy).not.toHaveBeenCalled();
  view.unmount();
  expect(sessions[0].destroy).toHaveBeenCalledOnce();
});

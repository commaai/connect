import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import Media from './Media';

const mocks = vi.hoisted(() => ({ playerProps: null }));
vi.mock('../DriveVideo', () => ({ default: (props) => {
  mocks.playerProps = props;
  return <video aria-label="Drive video" />;
} }));
vi.mock('../DriveMap', () => ({ default: () => <div data-testid="route-map" /> }));
vi.mock('../TimeDisplay', () => ({ default: () => <div data-testid="playback-controls" /> }));
vi.mock('../../api/clips', () => ({ deviceSupportsClips: vi.fn(async () => false) }));
vi.mock('../../actions/cached', () => ({ fetchEvents: () => ({ type: 'TEST_FETCH_EVENTS' }) }));

async function showMap() {
  const state = {
    dongleId: 'demo', device: null, profile: null, routes: [], files: null,
    currentRoute: { fullname: 'demo|route', duration: 60000, start_time_utc_millis: 0 },
    zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 },
  };
  const store = createStore(() => state);
  const view = render(<Provider store={store}><Media /></Provider>);
  await act(async () => {});
  const video = screen.getByLabelText('Drive video');
  fireEvent.click(screen.getByText('Map', { exact: true }));
  return { ...view, video, map: screen.getByTestId('route-map') };
}

describe('map playback notices', () => {
  it('shows an accessible error and Retry while retaining the map and video', async () => {
    const { video, map } = await showMap();
    const recover = vi.fn();
    act(() => mocks.playerProps.onPlaybackStatusChange({ message: 'This video segment is unavailable.', error: true, label: 'Retry', recover }));
    const notice = screen.getByRole('alert');
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent('This video segment is unavailable.');
    expect(notice.closest('[inert]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(recover).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Drive video')).toBe(video);
    expect(screen.getByTestId('route-map')).toBe(map);
    act(() => mocks.playerProps.onPlaybackStatusChange(null));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(map).toBeVisible();
  });

  it('makes autoplay recovery usable without leaving Map', async () => {
    const { video, map } = await showMap();
    const recover = vi.fn();
    act(() => mocks.playerProps.onPlaybackStatusChange({ message: 'Play the video to continue this route.', label: 'Play video', recover }));
    expect(screen.getByRole('status')).toHaveTextContent('Play the video');
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(recover).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Drive video')).toBe(video);
    expect(map).toBeVisible();
  });

  it('explains an empty camera interval without offering an ineffective recovery action', async () => {
    const { map } = await showMap();
    act(() => mocks.playerProps.onPlaybackStatusChange({ message: 'No video is available in this selected range.' }));
    expect(screen.getByRole('status')).toHaveTextContent('No video is available in this selected range.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry|Play video/ })).not.toBeInTheDocument();
    expect(map).toBeVisible();
  });
});

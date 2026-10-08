import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Media } from './Media';

const lifecycle = vi.hoisted(() => ({ mounts: 0, disposals: 0 }));
vi.mock('../DriveVideo', () => ({ default: ({ showVideo, isMuted }) => {
  React.useEffect(() => { lifecycle.mounts += 1; return () => { lifecycle.disposals += 1; }; }, []);
  return <video data-testid="retained-video" hidden={!showVideo} muted={isMuted} />;
} }));
vi.mock('../DriveMap', () => ({ default: () => <div data-testid="drive-map" /> }));
vi.mock('../TimeDisplay', () => ({ default: () => null }));
vi.mock('../Files/UploadQueue', () => ({ default: () => null }));
vi.mock('./ClipMenu', () => ({ default: () => null }));
vi.mock('../../api/clips', () => ({ deviceSupportsClips: () => false }));
vi.mock('../../actions/cached', () => ({ fetchEvents: () => ({ type: 'FETCH_EVENTS' }) }));
vi.mock('../../hooks/window', () => ({ subscribeWindowSize: () => () => {} }));

function mount() {
  const ref = React.createRef();
  const dispatch = vi.fn();
  const props = { classes: {}, nav: {}, dispatch, dongleId: null, device: null,
    currentRoute: null, files: null, profile: null };
  return { ...render(<Media ref={ref} {...props} />), ref, dispatch };
}
beforeEach(() => { lifecycle.mounts = 0; lifecycle.disposals = 0; });

test('video and its user audio state survive Map and Video switches', () => {
  const { ref, dispatch } = mount();
  const video = screen.getByTestId('retained-video');
  act(() => ref.current.setState({ isMuted: false }));
  fireEvent.click(screen.getByText('Map'));
  expect(screen.getByTestId('retained-video')).toBe(video);
  expect(video).not.toBeVisible();
  expect(video.muted).toBe(false);
  expect(screen.getByTestId('drive-map')).toBeVisible();
  fireEvent.click(screen.getByText('Video'));
  expect(screen.getByTestId('retained-video')).toBe(video);
  expect(video).toBeVisible();
  expect(lifecycle.mounts).toBe(1);
  expect(lifecycle.disposals).toBe(0);
  expect(dispatch.mock.calls.some(([action]) => action?.type === 'ACTION_BUFFER_VIDEO')).toBe(false);
});

test('wide resize does not replace the media element and unmount disposes once', () => {
  const { ref, unmount } = mount();
  const video = screen.getByTestId('retained-video');
  act(() => ref.current.setState({ inView: 'map', windowWidth: 1600 }));
  expect(screen.getByTestId('retained-video')).toBe(video);
  expect(video).toBeVisible();
  expect(screen.getByTestId('drive-map')).toBeVisible();
  unmount();
  expect(lifecycle.disposals).toBe(1);
});

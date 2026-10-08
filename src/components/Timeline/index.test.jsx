import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import dayjs from 'dayjs';

import { api } from '../../api/backend';
import { Timeline, getVideoPreviewTime } from './index';

vi.mock('react-player/file', () => ({
  default: React.forwardRef(({ url }, ref) => <div ref={ref} data-testid="timeline-preview-player" data-url={url} />),
}));

vi.mock('../../timeline', () => ({
  currentOffset: vi.fn(() => 0),
}));

vi.mock('../../api/backend', () => ({
  api: {
    routeAssets: {
      thumbnail: vi.fn((_route, segment) => `/route/${segment}/sprite.jpg`),
    },
    video: {
      getQcameraStreamUrl: vi.fn(() => 'https://video.example/route.m3u8'),
    },
  },
}));

const route = {
  duration: 60000,
  end_time_utc_millis: 60000,
  events: [],
  fullname: 'device|route',
  log_id: 'route',
  segment_end_times: [60000],
  segment_numbers: [0],
  segment_start_times: [0],
  start_time_utc_millis: 0,
  url: '/route',
};

const classes = Object.fromEntries([
  'base',
  'segments',
  'segment',
  'statusGradient',
  'thumbnails',
  'ruler',
  'rulerRemaining',
  'dragHighlight',
  'hoverBead',
  'hoverPreview',
  'hoverPreviewLabel',
  'previewPlayer',
  'previewCanvas',
  'previewMessage',
  'segmentColor',
].map((name) => [name, name]));

describe('timeline hover preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [0, 0, 0],
    [7000, 0, 7],
    [7000, 2000, 5],
    [500, 1000, 0],
  ])('maps route offset %i to video time %i', (offset, videoStartOffset, expectedTime) => {
    expect(getVideoPreviewTime(offset, videoStartOffset)).toBe(expectedTime);
  });

  it('loads an independent video preview at the hovered timeline position', () => {
    const dispatch = vi.fn();
    render(
      <Timeline
        classes={classes}
        dispatch={dispatch}
        hasRuler
        route={route}
        thumbnailsVisible={false}
        zoom={{ start: 0, end: route.duration }}
      />,
    );
    const ruler = screen.getByRole('slider', { name: 'Drive timeline' });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 100,
      right: 700,
      top: 0,
      width: 600,
      x: 100,
      y: 0,
      toJSON: () => {},
    });

    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 170 });
    Object.defineProperty(move, 'pointerType', { value: 'mouse' });
    fireEvent(ruler, move);

    const timestamp = dayjs(7000).format('HH:mm:ss');
    const preview = screen.getByRole('img', { name: `Frame preview at 0, ${timestamp}` });
    expect(preview).toHaveStyle({ left: '42px', top: '8px' });
    expect(preview.parentElement).toBe(document.body);
    expect(screen.getByTestId('timeline-preview-player')).toHaveAttribute('data-url', 'https://video.example/route.m3u8');
    expect(api.video.getQcameraStreamUrl).toHaveBeenCalledWith(route.fullname, undefined, undefined);
    expect(preview).toHaveTextContent(`0, ${timestamp}`);
    expect(preview).toHaveTextContent('Loading frame…');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shows video previews on the dashboard timeline without adding the ruler', () => {
    render(
      <Timeline
        classes={classes}
        dispatch={vi.fn()}
        route={route}
        thumbnailsVisible={false}
        zoomOverride={{ start: 0, end: route.duration }}
      />,
    );
    const thumbnails = document.querySelector('.thumbnails');
    vi.spyOn(thumbnails, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 20,
      left: 100,
      right: 700,
      top: 100,
      width: 600,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 170 });
    Object.defineProperty(move, 'pointerType', { value: 'mouse' });
    fireEvent(thumbnails, move);

    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: `Frame preview at 0, ${dayjs(7000).format('HH:mm:ss')}` }))
      .toBeInTheDocument();
    expect(screen.getByTestId('timeline-preview-player')).toBeInTheDocument();
  });

  it('does not load hover video previews for touch pointers', () => {
    render(
      <Timeline
        classes={classes}
        dispatch={vi.fn()}
        hasRuler
        route={route}
        thumbnailsVisible={false}
        zoom={{ start: 0, end: route.duration }}
      />,
    );
    const ruler = screen.getByRole('slider', { name: 'Drive timeline' });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 100,
      right: 700,
      top: 0,
      width: 600,
      x: 100,
      y: 0,
      toJSON: () => {},
    });
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 170 });
    Object.defineProperty(move, 'pointerType', { value: 'touch' });
    fireEvent(ruler, move);

    expect(screen.queryByRole('img', { name: /Frame preview/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-preview-player')).not.toBeInTheDocument();
  });

  it('does not load hover video previews when the device has no hover capability', () => {
    window.matchMedia.mockReturnValue({ matches: false });
    render(
      <Timeline
        classes={classes}
        dispatch={vi.fn()}
        hasRuler
        route={route}
        thumbnailsVisible={false}
        zoom={{ start: 0, end: route.duration }}
      />,
    );
    const ruler = screen.getByRole('slider', { name: 'Drive timeline' });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 100,
      right: 700,
      top: 0,
      width: 600,
      x: 100,
      y: 0,
      toJSON: () => {},
    });
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 170 });
    Object.defineProperty(move, 'pointerType', { value: 'mouse' });
    fireEvent(ruler, move);

    expect(screen.queryByTestId('timeline-preview-player')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Frame preview/ })).not.toBeInTheDocument();
  });

  it('clears the frame preview when the pointer leaves the timeline', () => {
    render(
      <Timeline
        classes={classes}
        dispatch={vi.fn()}
        hasRuler
        route={route}
        thumbnailsVisible={false}
        zoom={{ start: 0, end: route.duration }}
      />,
    );
    const ruler = screen.getByRole('slider', { name: 'Drive timeline' });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 100,
      right: 700,
      top: 0,
      width: 600,
      x: 100,
      y: 0,
      toJSON: () => {},
    });
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 170 });
    Object.defineProperty(move, 'pointerType', { value: 'mouse' });
    fireEvent(ruler, move);
    const timestamp = dayjs(7000).format('HH:mm:ss');
    const previewName = `Frame preview at 0, ${timestamp}`;
    expect(screen.getByRole('img', { name: previewName })).toBeInTheDocument();

    fireEvent.pointerLeave(ruler);

    expect(screen.queryByRole('img', { name: previewName })).not.toBeInTheDocument();
  });
});

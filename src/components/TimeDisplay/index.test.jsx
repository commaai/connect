import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { play } from '../../timeline/playback';
import { TimeDisplay } from './index';

vi.mock('../../timeline', () => ({ currentOffset: () => 0 }));
vi.mock('../../timeline/playback', () => ({
  seek: vi.fn(),
  play: vi.fn((speed) => ({ type: 'PLAY', speed })),
  pause: vi.fn(),
}));
vi.mock('../../utils', () => ({ getSegmentNumber: () => 0 }));

describe('TimeDisplay speed controls', () => {
  it('shows usable playback speed controls on a narrow iPhone-sized viewport', () => {
    const originalWidth = window.innerWidth;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.requestAnimationFrame = vi.fn();

    try {
      const { container } = render(
        <TimeDisplay
          classes={Object.fromEntries([
            'base', 'desiredPlaySpeedContainer', 'speedControlButton', 'tinyArrowIcon',
            'rightBorderBox', 'leftBorderBox', 'currentTime', 'icon', 'iconButton',
          ].map((name) => [name, name]))}
          currentRoute={{ start_time_utc_millis: 0, segment_numbers: [0] }}
          desiredPlaySpeed={1}
          dispatch={vi.fn()}
          isThin
          zoom={{ start: 0, end: 60000 }}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Increase play speed by 1 step' }));

      expect(screen.getByText('1×')).toBeInTheDocument();
      expect(play).toHaveBeenCalledWith(2);
      expect(container.querySelector('.currentTime span')).toHaveStyle({ whiteSpace: 'nowrap' });
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });
});

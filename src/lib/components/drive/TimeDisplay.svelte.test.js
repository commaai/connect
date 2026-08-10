import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { playback } from '$lib/state/playback.svelte.js';
import TimeDisplay from './TimeDisplay.svelte';

const route = {
  fullname: '1d3dc3e03047b0c7|000000dd--455f14369d',
  log_id: '000000dd--455f14369d',
  duration: 600000,
  start_time_utc_millis: new Date(2026, 5, 5, 9, 0, 0).getTime(),
};

beforeEach(() => {
  playback.reset();
  playback.zoom = { start: 0, end: route.duration, previous: null };
  playback.pause();
  playback.seek(0);
});

const mount = (props = {}) => render(TimeDisplay, { route, ...props });

describe('TimeDisplay', () => {
  describe('the clock', () => {
    it('reads out wall-clock time and the segment it is in', async () => {
      playback.seek(125000); // 2:05 into a route that started at 09:00
      mount();
      expect(await screen.findByText('09:02:05 – 2')).toBeInTheDocument();
    });

    it('falls back to an ellipsis for a route with no start time', async () => {
      mount({ route: { ...route, start_time_utc_millis: undefined } });
      expect(await screen.findByText('...')).toBeInTheDocument();
    });
  });

  describe('jumping', () => {
    it('goes back ten seconds', async () => {
      playback.seek(60000);
      mount();

      await userEvent.click(screen.getByRole('button', { name: 'Jump back 10 seconds' }));

      expect(playback.currentOffset()).toBe(50000);
    });

    it('goes forward ten seconds', async () => {
      playback.seek(60000);
      mount();

      await userEvent.click(screen.getByRole('button', { name: 'Jump forward 10 seconds' }));

      expect(playback.currentOffset()).toBe(70000);
    });
  });

  describe('play speed', () => {
    it('steps up through the ladder', async () => {
      playback.play(1);
      mount();

      await userEvent.click(screen.getByRole('button', { name: 'Increase play speed by 1 step' }));

      expect(playback.desiredPlaySpeed).toBe(2);
    });

    it('steps down through it', async () => {
      playback.play(1);
      mount();

      await userEvent.click(screen.getByRole('button', { name: 'Decrease play speed by 1 step' }));

      expect(playback.desiredPlaySpeed).toBe(0.5);
    });

    it('stops at the top of the ladder', async () => {
      playback.play(8);
      mount();

      await userEvent.click(screen.getByRole('button', { name: 'Increase play speed by 1 step' }));

      expect(playback.desiredPlaySpeed).toBe(8);
    });

    it('stops at the bottom of it', async () => {
      playback.play(0.1);
      mount();

      await userEvent.click(screen.getByRole('button', { name: 'Decrease play speed by 1 step' }));

      expect(playback.desiredPlaySpeed).toBe(0.1);
    });
  });

  describe('pausing', () => {
    it('offers Pause while playing and Unpause once paused', async () => {
      playback.play(1);
      const { rerender } = mount();
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
      await rerender({ route });

      expect(screen.getByRole('button', { name: 'Unpause' })).toBeInTheDocument();
      expect(playback.desiredPlaySpeed).toBe(0);
    });

    it('resumes at the speed that was set before the pause, not at 1x', async () => {
      playback.play(4);
      const { rerender } = mount();

      await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
      await rerender({ route });
      await userEvent.click(screen.getByRole('button', { name: 'Unpause' }));

      expect(playback.desiredPlaySpeed).toBe(4);
    });
  });
});

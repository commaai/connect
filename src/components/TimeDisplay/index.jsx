import React, { useCallback, useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { Tooltip } from '@material-ui/core';

import { Forward10, Pause, PlayArrow, Replay10, VolumeUp, VolumeOff } from '../../icons';
import { useClickOutside } from '../../hooks/useClickOutside';
import { currentOffset } from '../../timeline';
import { seek, play, pause } from '../../timeline/playback';
import { formatElapsed, getSegmentNumber } from '../../utils';

const timerSteps = [
  0.1,
  0.25,
  0.5,
  1,
  2,
  4,
  8,
];

const iconButton = 'relative before:absolute before:left-1/2 before:top-1/2 before:h-[44px] before:w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 cursor-pointer select-none transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent motion-reduce:transition-none';

function getDisplayTime(currentRoute, loop) {
  const offset = currentOffset();
  const start = loop?.startTime ?? 0;
  const total = loop?.duration ?? currentRoute.duration;
  const wallClock = new Date(offset + currentRoute.start_time_utc_millis);
  return {
    progress: `${formatElapsed(offset - start)} / ${formatElapsed(total)}`,
    clock: Number.isNaN(wallClock.getTime()) ? '' : dayjs(wallClock).format('HH:mm:ss'),
    segment: getSegmentNumber(currentRoute),
  };
}

function TimeDisplay({ dispatch, currentRoute, loop, zoom, desiredPlaySpeed: videoPlaySpeed, onMuteToggle, isMuted, hasAudio }) {
  const [display, setDisplay] = useState(() => getDisplayTime(currentRoute, loop));
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef(null);
  const closeSpeed = useCallback(() => setSpeedOpen(false), []);
  useClickOutside(speedRef, speedOpen, closeSpeed);
  // the speed to come back to after pausing
  const lastSpeed = useRef(1);
  if (videoPlaySpeed !== 0) lastSpeed.current = videoPlaySpeed;

  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      const next = getDisplayTime(currentRoute, loop);
      setDisplay((current) => (current.progress === next.progress && current.clock === next.clock ? current : next));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [currentRoute, loop]);

  const found = timerSteps.indexOf(lastSpeed.current);
  const stepIndex = found === -1 ? timerSteps.indexOf(1) : found;
  const isPaused = videoPlaySpeed === 0;

  const jump = (amount) => dispatch(seek(currentOffset() + amount));
  const chooseSpeed = (step) => {
    if (isPaused) {
      lastSpeed.current = step; // takes effect when playing resumes
    } else {
      dispatch(play(step));
    }
    setSpeedOpen(false);
  };

  return (
    <div
      className={`flex w-full items-center gap-0.5 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] transition-opacity duration-200 motion-reduce:transition-none ${zoom ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <button
        type="button"
        className={iconButton}
        onClick={() => dispatch(isPaused ? play(lastSpeed.current) : pause())}
        aria-label={isPaused ? 'Unpause' : 'Pause'}
      >
        {isPaused ? <PlayArrow className="h-8 w-8" /> : <Pause className="h-8 w-8" />}
      </button>
      <Tooltip title={!hasAudio ? 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device' : ''}>
        <span>
          <button
            type="button"
            className={iconButton}
            onClick={onMuteToggle}
            disabled={!hasAudio}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeOff className="h-6 w-6" /> : <VolumeUp className="h-6 w-6" />}
          </button>
        </span>
      </Tooltip>

      <div className="ml-1 min-w-0 truncate text-sm tabular-nums" title={display.segment !== null ? `Segment ${display.segment}` : undefined}>
        {display.progress}
        <span className="ml-2 hidden text-white/60 sm:inline">{display.clock}</span>
      </div>

      <div className="flex-1" />

      <button type="button" className={iconButton} onClick={() => jump(-10000)} aria-label="Jump back 10 seconds">
        <Replay10 className="h-6 w-6" />
      </button>
      <button type="button" className={iconButton} onClick={() => jump(10000)} aria-label="Jump forward 10 seconds">
        <Forward10 className="h-6 w-6" />
      </button>

      <div ref={speedRef} className="relative" onKeyDown={(event) => event.key === 'Escape' && setSpeedOpen(false)}>
        <button
          type="button"
          className="relative before:absolute before:left-1/2 before:top-1/2 before:h-[44px] before:w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 h-10 min-w-12 cursor-pointer rounded-full px-3 text-sm font-medium tabular-nums transition-colors duration-200 hover:bg-white/10 motion-reduce:transition-none"
          aria-label="Playback speed"
          aria-haspopup="menu"
          aria-expanded={speedOpen}
          onClick={() => setSpeedOpen((open) => !open)}
        >
          {`${timerSteps[stepIndex]}×`}
        </button>
        {speedOpen && (
          <div role="menu" className="absolute bottom-full right-0 mb-2 flex w-max origin-bottom-right gap-0.5 rounded-full bg-glass-dark p-1 transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] starting:scale-95 starting:opacity-0 motion-reduce:transition-none">
            {timerSteps.map((step, index) => (
              <button
                key={step}
                type="button"
                role="menuitemradio"
                aria-checked={index === stepIndex}
                className={`h-9 min-w-9 cursor-pointer rounded-full px-2 text-sm tabular-nums transition-colors duration-150 hover:bg-white/10 motion-reduce:transition-none ${index === stepIndex ? 'bg-white/20 font-medium text-white' : 'text-white/70'}`}
                onClick={() => chooseSpeed(step)}
              >
                {`${step}×`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  loop: state.loop,
  zoom: state.zoom,
  desiredPlaySpeed: state.desiredPlaySpeed,
});

export default connect(stateToProps)(TimeDisplay);

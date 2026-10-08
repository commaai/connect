import React, { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';

import { IconButton, Menu, MenuItem, Tooltip } from '@material-ui/core';

import { Forward10, Fullscreen, FullscreenExit, Pause, PlayArrow, Replay10, VolumeOff, VolumeUp } from '../../icons';
import { currentOffset } from '../../timeline';
import { getSegmentNumber } from '../../utils';

const NO_AUDIO = 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device';

// Runs update with the playhead every frame.
function usePlayhead(update) {
  useEffect(() => {
    let frame;
    const tick = () => {
      update(currentOffset());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [update]);
}

// The time of day at the playhead, or the time into the drive when its clock wasn't set.
function playbackTime(route, offset) {
  const clock = dayjs(route.start_time_utc_millis + offset);
  if (clock.isValid()) {
    return clock.format('HH:mm:ss');
  }
  const seconds = Math.floor(offset / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function PlaybackTime({ route }) {
  const [time, setTime] = useState('');
  const [segment, setSegment] = useState(null);
  usePlayhead(React.useCallback((offset) => {
    setTime(playbackTime(route, offset));
    setSegment(getSegmentNumber(route, offset));
  }, [route]));
  return (
    <span className="mx-1 whitespace-nowrap text-sm font-medium tabular-nums">
      {time}
      <span className="hidden text-white/60 sm:inline">{` · seg ${segment}`}</span>
    </span>
  );
}

// A seek bar for full screen, where the drive's timeline isn't visible.
function SeekBar({ loop, onSeek }) {
  const ref = useRef(null);
  usePlayhead(React.useCallback((offset) => {
    if (ref.current) ref.current.value = offset;
  }, []));
  return (
    <input
      ref={ref}
      type="range"
      aria-label="Seek"
      min={loop.startTime}
      max={loop.startTime + loop.duration}
      step="any"
      onChange={(ev) => onSeek(Number(ev.target.value))}
      className="mb-1 h-1 w-full cursor-pointer accent-white"
    />
  );
}

// container: the player, so the speed menu shows in full screen too
const Controls = ({
  container, route, loop, visible, isPlaying, playbackRate, speeds, muted, hasAudio, isFullscreen, canFullscreen,
  onTogglePlay, onSkip, onSeek, onSpeed, onToggleMute, onToggleFullscreen,
}) => {
  const [speedMenu, setSpeedMenu] = useState(null);
  const button = 'h-10 w-10 p-2 text-white';

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/75 to-transparent px-2 pt-10 pb-1 transition-opacity duration-200 ${
        visible || speedMenu ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      {isFullscreen && loop && <SeekBar loop={loop} onSeek={onSeek} />}
      <div className="flex items-center text-white">
        <IconButton className={button} onClick={onTogglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause /> : <PlayArrow />}
        </IconButton>
        <IconButton className={button} onClick={() => onSkip(-10000)} aria-label="Jump back 10 seconds">
          <Replay10 />
        </IconButton>
        <IconButton className={button} onClick={() => onSkip(10000)} aria-label="Jump forward 10 seconds">
          <Forward10 />
        </IconButton>
        <PlaybackTime route={route} />
        <div className="flex-1" />
        <button
          type="button"
          className="h-8 min-w-11 rounded-full px-2 text-sm font-semibold text-white hover:bg-white/10"
          onClick={(ev) => setSpeedMenu(ev.currentTarget)}
          aria-label="Playback speed"
          aria-haspopup="true"
        >
          {`${playbackRate}×`}
        </button>
        <Menu
          anchorEl={speedMenu}
          open={Boolean(speedMenu)}
          onClose={() => setSpeedMenu(null)}
          container={container}
          getContentAnchorEl={null}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          {speeds.map((speed) => (
            <MenuItem
              key={speed}
              selected={speed === playbackRate}
              onClick={() => { onSpeed(speed); setSpeedMenu(null); }}
            >
              {`${speed}×`}
            </MenuItem>
          ))}
        </Menu>
        <Tooltip title={hasAudio ? '' : NO_AUDIO}>
          <span>
            <IconButton className={button} onClick={onToggleMute} disabled={!hasAudio} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted || !hasAudio ? <VolumeOff className={hasAudio ? '' : 'opacity-50'} /> : <VolumeUp />}
            </IconButton>
          </span>
        </Tooltip>
        {canFullscreen && (
          <IconButton className={button} onClick={onToggleFullscreen} aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}>
            {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
          </IconButton>
        )}
      </div>
    </div>
  );
};

export default Controls;

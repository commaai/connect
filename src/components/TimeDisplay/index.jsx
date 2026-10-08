import React from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { IconButton } from '@material-ui/core';
import { Forward10, Pause, PlayArrow, Replay10 } from '../../icons';
import { seek, play, pause } from '../../timeline/playback';

function TimeDisplay({ currentRoute, offset, desiredPlaySpeed, playbackRate, dispatch, mapVisible }) {
  const position = offset ?? 0;
  const time = dayjs(currentRoute.start_time_utc_millis + position).format('HH:mm:ss');
  return (
    <div className="flex max-w-full items-center justify-center gap-1 rounded-full border border-white/10 bg-black/15 px-1 text-white">
      <IconButton style={{ width: 40, height: 44, padding: 6 }} aria-label="Jump back 10 seconds" onClick={() => dispatch(seek(position - 10000))}>
        <Replay10 />
      </IconButton>
      {mapVisible && (
        <IconButton style={{ width: 40, height: 44, padding: 6 }} aria-label={desiredPlaySpeed ? 'Pause' : 'Unpause'} onClick={() => dispatch(desiredPlaySpeed ? pause() : play(playbackRate))}>
          {desiredPlaySpeed ? <Pause /> : <PlayArrow />}
        </IconButton>
      )}
      <span className="px-1 text-center text-sm tabular-nums">{time}</span>
      <label className="flex items-center">
        <span className="sr-only">Playback speed</span>
        <select
          aria-label="Playback speed"
          className="rounded-lg bg-transparent px-1 py-2 text-sm focus-visible:outline"
          value={playbackRate}
          onChange={(event) => dispatch(play(Number(event.target.value)))}
        >
          {[...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8, playbackRate])].sort((a, b) => a - b).map((speed) => <option key={speed} value={speed} className="bg-[#1D2225]">{speed}×</option>)}
        </select>
      </label>
      <IconButton style={{ width: 40, height: 44, padding: 6 }} aria-label="Jump forward 10 seconds" onClick={() => dispatch(seek(position + 10000))}>
        <Forward10 />
      </IconButton>
    </div>
  );
}

export default connect((state) => ({
  currentRoute: state.currentRoute,
  offset: state.offset,
  desiredPlaySpeed: state.desiredPlaySpeed,
  playbackRate: state.playbackRate,
}))(TimeDisplay);

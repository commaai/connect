import {
  currentOffset,
  getCurrentRoute,
} from './common';

import playbackReducer, {
  seek,
  pause,
  play,
  selectLoop,
  setBuffering,
  resetPlayback,
} from './playback';

export {
  currentOffset,
  getCurrentRoute,

  seek,
  pause,
  play,
  selectLoop,
  setBuffering,
  resetPlayback,
};

export default playbackReducer;

import store from '../store';
import { videoOffset } from './video';

export function currentOffset(state = null) {
  if (!state) state = store.getState();

  let offset = videoOffset(state.currentRoute);
  if (offset == null) offset = state.offset;
  if (offset == null) offset = state.loop?.startTime ?? 0;

  const loopStart = state.loop?.startTime;
  const loopDuration = state.loop?.duration;
  if (loopStart == null || !loopDuration) return offset;

  const loopEnd = loopStart + loopDuration;
  if (offset < loopStart) return loopStart;
  if (offset >= loopEnd) return loopStart + ((offset - loopStart) % loopDuration);
  return offset;
}

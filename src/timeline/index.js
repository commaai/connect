// The drive's <video> element is the playback clock. Before its metadata loads, and
// after it fails or goes away, the position is parked and moves only when seeked.
import * as Types from '../actions/types';
import { mediaEvent } from './playback';
import { toRouteOffset, toVideoTime } from './video';

const MEDIA_EVENTS = ['loadedmetadata', 'play', 'playing', 'pause', 'waiting', 'seeked', 'timeupdate', 'ended'];

let store = null;
let source = null;
let parked = 0;
let autoplay = true;

function videoStartOffset() {
  return store.getState().currentRoute?.videoStartOffset || 0;
}

// The video counts once it has metadata and while its drive is open: DriveVideo
// detaches it a render after the drive changes, or never if the drive reopens in it.
function ready() {
  return source?.ready && source.route === store.getState().currentRoute?.fullname;
}

export function currentOffset() {
  return ready() ? toRouteOffset(source.segments, videoStartOffset(), source.video.currentTime) : parked;
}

function seekTo(offset) {
  const { zoom } = store.getState();
  if (zoom) {
    offset = Math.min(Math.max(offset, zoom.start), zoom.end);
  }
  if (!ready()) {
    parked = offset;
    return;
  }
  const time = toVideoTime(source.segments, videoStartOffset(), offset);
  // seeking to where the video already is would still stall it for a moment
  if (time !== source.video.currentTime) {
    source.video.currentTime = time;
  }
}

function setRate(video, rate) {
  if (video.playbackRate !== rate) {
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
  }
}

// A selection loops over the part of it that has video, and stops if none of it has.
// The whole drive stops at its end. Runs on every frame and on timeupdate and ended.
function keepInSelection() {
  const { zoom, currentRoute } = store.getState();
  if (!ready() || source.video.seeking || !zoom || zoom.end - zoom.start >= currentRoute.duration) {
    return;
  }
  const { video, segments } = source;
  if (currentOffset() < zoom.end && !video.ended) return;
  const last = segments[segments.length - 1];
  const start = toVideoTime(segments, videoStartOffset(), zoom.start);
  if (start === last.start + last.duration || toRouteOffset(segments, videoStartOffset(), start) >= zoom.end) {
    video.pause();
    return;
  }
  const { ended } = video;
  video.currentTime = start;
  if (ended && autoplay) video.play().catch(() => {});
}

// Called once the video's source is set. Returns the function that detaches it.
export function attach(video, segments) {
  const controller = new AbortController();
  const { signal } = controller;
  const attached = { video, segments, route: store.getState().currentRoute.fullname, ready: false };
  source = attached;

  video.addEventListener('loadedmetadata', () => {
    attached.ready = true;
    seekTo(parked);
    // a refused autoplay leaves the video paused, which its events report
    if (autoplay) video.play().catch(() => {});
  }, { signal });
  for (const type of MEDIA_EVENTS) {
    video.addEventListener(type, () => store.dispatch(mediaEvent(video)), { signal });
  }
  for (const type of ['timeupdate', 'ended']) {
    video.addEventListener(type, keepInSelection, { signal });
  }
  setRate(video, store.getState().playback.rate);
  const onFrame = () => {
    if (signal.aborted) return;
    keepInSelection();
    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(onFrame);
    } else {
      requestAnimationFrame(onFrame);
    }
  };
  onFrame();

  return () => {
    controller.abort();
    if (source === attached) {
      parked = currentOffset();
      source = null;
    }
  };
}

// Runs playback commands on the video and follows the drive and selection in the store.
export const playerMiddleware = (appStore) => {
  store = appStore;
  return (next) => (action) => {
    const previous = store.getState();
    const result = next(action);
    const { currentRoute, zoom } = store.getState();
    if (currentRoute?.fullname !== previous.currentRoute?.fullname) {
      // a new drive plays from the start of its selection once its video attaches
      parked = zoom?.start ?? 0;
      autoplay = true;
    }
    if (zoom && zoom !== previous.zoom && (currentOffset() < zoom.start || currentOffset() > zoom.end)) {
      seekTo(zoom.start);
    }

    switch (action.type) {
      case Types.ACTION_SEEK:
        seekTo(action.offset);
        break;
      case Types.ACTION_PLAY:
        autoplay = true;
        source?.video.play().catch(() => {});
        break;
      case Types.ACTION_PAUSE:
        autoplay = false;
        source?.video.pause();
        break;
      case Types.ACTION_SET_RATE:
        if (source) setRate(source.video, action.rate);
        break;
      default:
        break;
    }
    return result;
  };
};

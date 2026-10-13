// The <video> element is the playback clock. While a source loads, or after it failed, the
// clock stands at the intent: what the user last asked for. Once the source can play, the
// element takes over and the intent follows it, so the next source resumes where it was.
const MEDIA_EVENTS = [
  'loadedmetadata', 'canplay', 'play', 'pause', 'ratechange', 'seeking', 'seeked', 'waiting', 'timeupdate', 'emptied',
];

const defaultIntent = (routeTime = 0) => ({ playing: true, playbackRate: 1, routeTime });

export class MediaController {
  element = null;
  route = null;
  videoStart = 0;
  intent = defaultIntent();
  open = null;
  close = null;
  ready = false;
  error = null;
  renewed = false;
  hasAudio = false;
  listeners = new Set();
  snapshot = this.read();

  getSnapshot = () => this.snapshot;

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setHasAudio = (hasAudio) => {
    this.hasAudio = hasAudio;
    this.publish();
  };

  retry = () => {
    this.unload();
    this.error = null;
    this.close = this.open?.(this.videoTime(this.intent.routeTime)) || null;
    this.publish();
  };

  onMediaEvent = ({ type }) => {
    const { element } = this;
    if (type === 'emptied') {
      this.ready = false;
    } else if (this.ready) {
      this.remember();
    } else if (type === 'loadedmetadata' && this.close && element.readyState) {
      this.apply(false);
    } else if (type === 'canplay' && this.close && element.readyState >= element.HAVE_FUTURE_DATA) {
      // the first canplay hands the clock to the element
      this.ready = true;
      this.apply(true);
    }
    this.publish();
  };

  // open(startTime) attaches a source to the element and returns a function that removes it
  load(element, route, routeTime, open) {
    MEDIA_EVENTS.forEach((event) => element.addEventListener(event, this.onMediaEvent));
    this.element = element;
    if (route !== this.route) {
      this.route = route;
      this.intent = defaultIntent(Math.max(routeTime || 0, this.videoStart));
      this.hasAudio = false;
    }
    this.open = open;
    this.renewed = false;
    this.retry();
    return () => {
      this.open = null;
      this.unload();
      MEDIA_EVENTS.forEach((event) => element.removeEventListener(event, this.onMediaEvent));
      this.element = null;
      this.publish();
    };
  }

  fail(kind) {
    // one fresh source per load outlasts a transient failure
    if (kind !== 'not-found' && kind !== 'expired' && !this.renewed) {
      this.renewed = true;
      this.retry();
      return;
    }
    this.unload();
    this.error = kind;
    if (kind === 'network') window.addEventListener('online', this.retry, { once: true });
    this.publish();
  }

  unload() {
    this.remember();
    window.removeEventListener('online', this.retry);
    this.ready = false;
    this.close?.();
    this.close = null;
  }

  setVideoStart(videoStart) {
    this.videoStart = videoStart || 0;
    this.publish();
  }

  currentOffset() {
    return this.ready ? (this.element.currentTime * 1000) + this.videoStart : this.intent.routeTime;
  }

  seek(routeTime) {
    this.intent.routeTime = routeTime;
    if (this.error) this.retry();
    else if (this.close && this.element.readyState) this.element.currentTime = this.videoTime(routeTime);
    this.publish();
  }

  play(playbackRate = this.intent.playbackRate) {
    this.intent.playing = true;
    this.intent.playbackRate = playbackRate;
    if (this.error) {
      this.retry();
    } else if (this.close) {
      // also before the source is ready, so a tap still counts as a user gesture on iOS
      this.element.defaultPlaybackRate = playbackRate;
      this.element.playbackRate = playbackRate;
      this.requestPlay();
    }
    this.publish();
  }

  pause() {
    this.intent.playing = false;
    this.element?.pause();
    this.publish();
  }

  toggleMuted() {
    this.element.muted = !this.element.muted;
    this.publish();
  }

  videoTime(routeTime) {
    return Math.max(0, routeTime - this.videoStart) / 1000;
  }

  // once ready, the intent follows the element, except that reaching the end is no pause
  remember() {
    if (!this.ready) return;
    const { ended, paused, playbackRate } = this.element;
    this.intent = { playing: ended ? this.intent.playing : !paused, playbackRate, routeTime: this.currentOffset() };
  }

  apply(shouldPlay) {
    const { playbackRate, playing, routeTime } = this.intent;
    this.element.defaultPlaybackRate = playbackRate;
    this.element.playbackRate = playbackRate;
    const target = this.videoTime(routeTime);
    if (Math.abs(this.element.currentTime - target) > 0.001) this.element.currentTime = target;

    if (!shouldPlay) return;
    if (playing) this.requestPlay();
    else this.element.pause();
  }

  requestPlay() {
    this.element.play().catch((error) => {
      if (error.name === 'NotAllowedError') this.pause();
    });
  }

  read() {
    const { element, error, intent, ready } = this;
    return {
      // a paused video needs its current frame, a playing one the frames after it too
      buffering: ready
        ? element.seeking || element.readyState < (element.paused ? element.HAVE_CURRENT_DATA : element.HAVE_FUTURE_DATA)
        : Boolean(this.close),
      error,
      hasAudio: this.hasAudio,
      muted: element ? element.muted : true,
      paused: ready ? element.paused : Boolean(error) || !intent.playing,
      playbackRate: intent.playbackRate,
      routeTime: this.currentOffset(),
    };
  }

  publish() {
    const next = this.read();
    if (Object.keys(next).every((key) => next[key] === this.snapshot[key])) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

export const media = new MediaController();

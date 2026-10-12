import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button } from '@material-ui/core';

import { api } from '../../api/backend';

import { ErrorOutline, Pause, PlayArrow } from '../../icons';
import StepSpinner from '../utils/StepSpinner';
import { clampToLoop, setVideoBuffered, setVideoClock } from '../../timeline';
import { pause, play } from '../../timeline/playback';

const MAX_SKIPPED_SEGMENTS = 3;

const VideoOverlay = ({ loading, error, onRetry }) => (
  <div
    className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center text-white
      transition-opacity duration-200 ease-out motion-reduce:transition-none
      ${error ? 'bg-black/60' : 'bg-black/30'} ${error || loading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    onClick={(event) => event.stopPropagation()}
  >
    {error ? (
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-[20px] bg-glass-dark p-5 animate-fadein">
        <ErrorOutline />
        <p className="text-sm text-white/85">{error}</p>
        {onRetry && (
          <Button className="!rounded-xl !bg-white/10 hover:!bg-white/20" onClick={onRetry}>Retry</Button>
        )}
      </div>
    ) : (
      loading && <StepSpinner label="Loading video" />
    )}
  </div>
);

// only show the spinner for waits long enough to notice
function useDelayed(value, ms) {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!value) {
      setDelayed(false);
      return undefined;
    }
    const timeout = setTimeout(() => setDelayed(true), ms);
    return () => clearTimeout(timeout);
  }, [value, ms]);
  return delayed;
}

const EXPIRED = 'This share link has expired.';
const OFFLINE = "You're offline. Playback resumes when you reconnect.";

function describeError(code, route) {
  if (!navigator.onLine) return OFFLINE;
  if (route?.share_exp && Date.now() / 1000 > route.share_exp) return EXPIRED;
  if (code === 404) return 'This video segment has not uploaded yet or has been deleted.';
  if (code === 401 || code === 403) return "You don't have access to this video.";
  return 'Unable to load video';
}

/**
 * The <video> element is the playback clock: it reports its own position through
 * setVideoClock() and everything else (timeline, map, time display) follows it.
 * Redux only holds what the user asked for: speed, loop and the last seek.
 */
function DriveVideo(props) {
  const { currentRoute, isMuted, seekId, loop, desiredPlaySpeed } = props;
  const fullname = currentRoute?.fullname;

  const videoRef = useRef(null);
  const latest = useRef(props); // handlers outlive renders, read current props through this
  useLayoutEffect(() => { latest.current = props; }); // after commit, before any effect reads it
  const last = useRef(null); // last position (ms) the video reported
  const resume = useRef(null); // position to resume at after a retry
  const applied = useRef(seekId); // last seek request handed to the video

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [offline, setOffline] = useState(!navigator.onLine);
  const showSpinner = useDelayed(loading, 250);
  const [flash, setFlash] = useState(null); // icon shown briefly after a tap on the video

  const retry = useCallback(() => {
    resume.current = last.current;
    setRetryKey((key) => key + 1);
  }, []);

  const toggle = () => {
    if (error) return;
    const { desiredPlaySpeed: speed, dispatch } = latest.current;
    dispatch(speed === 0 ? play(videoRef.current.playbackRate || 1) : pause());
    setFlash({ icon: speed === 0 ? 'play' : 'pause', visible: true });
  };

  const videoStartOffset = () => latest.current.currentRoute?.videoStartOffset || 0;
  const toVideoTime = (offset) => Math.max(0, (offset - videoStartOffset()) / 1000);
  const requestedOffset = () => {
    const { offset, loop: currentLoop } = latest.current;
    return clampToLoop(offset ?? currentLoop?.startTime ?? 0, currentLoop);
  };

  const applyPlayState = () => {
    const video = videoRef.current;
    const { desiredPlaySpeed: speed, dispatch } = latest.current;
    if (!video || video.readyState < 1) return;
    if (speed === 0) {
      video.pause();
      return;
    }
    video.playbackRate = speed;
    video.play()?.catch((err) => {
      if (err.name === 'NotAllowedError') dispatch(pause()); // autoplay blocked, leave the play button
    });
  };

  // keep the video inside the loop, wrapping around at the end
  const checkLoop = () => {
    const video = videoRef.current;
    const { loop: currentLoop } = latest.current;
    if (!video || !currentLoop || video.readyState < 1 || video.seeking) return;
    const position = video.currentTime * 1000 + videoStartOffset();
    if (position >= currentLoop.startTime + currentLoop.duration || position < currentLoop.startTime - 100) {
      video.currentTime = toVideoTime(currentLoop.startTime);
      if (video.ended) applyPlayState();
    }
  };

  // the clock
  useEffect(() => {
    setVideoClock(() => {
      if (applied.current !== latest.current.seekId) return requestedOffset(); // seek not applied yet
      const video = videoRef.current;
      if (video && video.readyState >= 1) {
        last.current = video.currentTime * 1000 + videoStartOffset();
      }
      return last.current;
    });
    setVideoBuffered(() => {
      const video = videoRef.current;
      const ranges = [];
      for (let i = 0; video && video.readyState >= 1 && i < video.buffered.length; i += 1) {
        ranges.push([video.buffered.start(i) * 1000 + videoStartOffset(), video.buffered.end(i) * 1000 + videoStartOffset()]);
      }
      return ranges;
    });
    return () => {
      setVideoClock(null);
      setVideoBuffered(null);
    };
  }, []);

  useEffect(() => {
    if (!flash?.visible) return undefined;
    const timeout = setTimeout(() => setFlash((current) => ({ ...current, visible: false })), 500);
    return () => clearTimeout(timeout);
  }, [flash]);

  // video -> app: external play/pause (lock screen, headphones, backgrounded page), buffering, loop
  useEffect(() => {
    const video = videoRef.current;
    const on = {
      waiting: () => setLoading(true),
      seeking: () => setLoading(true),
      seeked: () => video.readyState >= 3 && setLoading(false),
      canplay: () => setLoading(false),
      playing: () => setLoading(false),
      timeupdate: checkLoop,
      ended: () => {
        if (latest.current.loop) {
          checkLoop();
        } else {
          latest.current.dispatch(pause());
        }
      },
      pause: () => {
        if (latest.current.desiredPlaySpeed !== 0 && !video.ended && !video.seeking) latest.current.dispatch(pause());
      },
      play: () => {
        if (latest.current.desiredPlaySpeed === 0) latest.current.dispatch(play(video.playbackRate || 1));
      },
    };
    Object.entries(on).forEach(([event, handler]) => video.addEventListener(event, handler));

    let frame = requestAnimationFrame(function tick() {
      checkLoop();
      frame = requestAnimationFrame(tick);
    });

    return () => {
      Object.entries(on).forEach(([event, handler]) => video.removeEventListener(event, handler));
      cancelAnimationFrame(frame);
    };
  }, []);

  // load the stream
  useEffect(() => {
    const video = videoRef.current;
    if (!fullname) return undefined;

    let cancelled = false;
    let hls = null;
    let recovered = false;
    let skipped = 0;
    const missing = []; // segments that 404'd, jumped over once playback reaches them
    const startAt = resume.current ?? requestedOffset();
    resume.current = null;
    last.current = null;
    setError(null);
    setLoading(true);
    latest.current.onAudioStatusChange?.(false);

    const fail = (code) => {
      setLoading(false);
      setError(describeError(code, latest.current.currentRoute));
    };
    const onLoaded = () => {
      if (!hls) video.currentTime = toVideoTime(startAt); // hls.js starts at startPosition
      applyPlayState();
    };
    const skipMissing = () => {
      const gap = missing.find((frag) => video.currentTime >= frag.start - 0.5 && video.currentTime < frag.end);
      if (!gap) return;
      skipped += 1;
      if (skipped > MAX_SKIPPED_SEGMENTS) {
        fail(404); // nothing playable
        return;
      }
      video.currentTime = gap.end + 0.01;
      hls.startLoad(video.currentTime);
    };
    const reportNativeAudio = () => latest.current.onAudioStatusChange?.(Boolean(video.audioTracks?.length));
    const onNativeError = () => fail();

    const { share_exp: exp, share_sig: sig } = latest.current.currentRoute;
    const url = api.video.getQcameraStreamUrl(fullname, exp, sig);
    video.addEventListener('loadedmetadata', onLoaded);

    import('hls.js/light').then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        // native HLS (iOS before ManagedMediaSource)
        video.addEventListener('error', onNativeError);
        video.addEventListener('loadedmetadata', reportNativeAudio);
        video.audioTracks?.addEventListener?.('addtrack', reportNativeAudio);
        video.src = url;
        return;
      }
      hls = new Hls({ maxBufferLength: 40, startPosition: toVideoTime(startAt) });
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => latest.current.onAudioStatusChange?.(Boolean(data.audio)));
      hls.on(Hls.Events.FRAG_BUFFERED, () => { skipped = 0; });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        const code = data.response?.code;
        if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && code === 404 && data.frag) {
          // segment not uploaded (or deleted): keep playing, jump over it when we get there
          missing.push(data.frag);
          skipMissing();
          return;
        }
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true;
          hls.recoverMediaError();
        } else {
          fail(code);
        }
      });
      video.addEventListener('timeupdate', skipMissing);
      video.addEventListener('waiting', skipMissing);
      hls.loadSource(url);
      hls.attachMedia(video);
    }).catch(() => !cancelled && fail()); // the player itself failed to load

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('loadedmetadata', reportNativeAudio);
      video.removeEventListener('error', onNativeError);
      video.removeEventListener('timeupdate', skipMissing);
      video.removeEventListener('waiting', skipMissing);
      video.audioTracks?.removeEventListener?.('addtrack', reportNativeAudio);
      if (hls) {
        hls.destroy();
      } else {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [fullname, retryKey]);

  // app -> video: seek requests
  useEffect(() => {
    const video = videoRef.current;
    applied.current = seekId;
    if (video.readyState >= 1) video.currentTime = toVideoTime(requestedOffset());
  }, [seekId]);

  useEffect(() => {
    applyPlayState();
  }, [desiredPlaySpeed]);

  useEffect(checkLoop, [loop]);

  // when offline, say so instead of spinning, and reload once the connection is back
  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      if (error || videoRef.current.readyState < 3) retry();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [error, retry]);

  const shownError = error || (showSpinner && offline ? OFFLINE : null);

  return (
    <div
      className="relative h-full w-full cursor-pointer"
      onClick={toggle}
    >
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted={isMuted} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full bg-glass-dark text-white transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none
            ${flash?.visible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
        >
          {flash?.icon === 'pause' ? <Pause className="h-8 w-8" /> : <PlayArrow className="h-8 w-8" />}
        </div>
      </div>
      <VideoOverlay loading={showSpinner} error={shownError} onRetry={shownError === EXPIRED ? null : retry} />
    </div>
  );
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekId: state.seekId,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);

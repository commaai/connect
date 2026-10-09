import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { bufferVideo, pause, play, seekDone, videoTime } from '../../timeline/playback';
import { mediaBounds, seekTarget } from './position';

export function DriveVideo(props) {
  const videoRef = useRef(null);
  const controls = useRef(null);
  const latest = useRef(props);
  latest.current = props;
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const route = props.currentRoute;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !route) return undefined;
    const fullname = route.fullname;
    let active = true;
    let hls;
    let frame;
    let timeout;
    let failed = false;
    let failedRange = null;
    let initialSeek = true;
    let handledSeek;
    let playRequest = 0;
    let pendingPlay = false;
    let hlsAudio = false;
    let lastMediaTime;
    const current = () => active && latest.current.currentRoute?.fullname === fullname;
    const origin = () => latest.current.currentRoute?.videoStartOffset || 0;
    const bounds = () => mediaBounds(latest.current.currentRoute, latest.current.loop, video.duration);
    const clearLoading = () => {
      clearTimeout(timeout);
      timeout = undefined;
      if (current() && latest.current.isBufferingVideo) latest.current.dispatch(bufferVideo(false));
    };
    const fail = (text, unavailableRange = false) => {
      if (!current()) return;
      failed = true;
      failedRange = unavailableRange ? bounds() : null;
      playRequest += 1;
      pendingPlay = false;
      video.pause();
      hls?.stopLoad();
      clearLoading();
      setMessage(text);
    };
    const loading = () => {
      if (!current() || failed || (!latest.current.desiredPlaySpeed && video.paused
        && video.readyState >= 2 && !video.seeking)) return;
      latest.current.dispatch(bufferVideo(true));
      if (!timeout) timeout = setTimeout(() => fail('Video is taking too long to load. Please retry.'), 20000);
    };
    const attemptPlay = () => {
      if (!current() || failed || pendingPlay) return;
      pendingPlay = true;
      playRequest += 1;
      const request = playRequest;
      Promise.resolve(video.play()).catch((error) => {
        if (!current() || request !== playRequest || !latest.current.desiredPlaySpeed) return;
        if (error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') {
          setBlocked(true);
          latest.current.dispatch(pause());
          clearLoading();
        } else fail('Unable to play this video. Please retry.');
      }).finally(() => { if (request === playRequest) pendingPlay = false; });
    };
    const report = () => {
      if (!current() || failed || video.seeking || !Number.isFinite(video.currentTime)) return;
      const time = video.currentTime;
      const range = bounds();
      if (!video.paused && video.readyState >= 2 && time !== lastMediaTime) clearLoading();
      lastMediaTime = time;
      if (latest.current.desiredPlaySpeed && (!video.paused || video.ended)
        && time >= range.end && range.end > range.start) {
        const ended = video.ended;
        const target = seekTarget(video.seekable, range.start, range, hls?.latestLevelDetails?.fragments);
        if (target === null) { fail('No video is available in this selected range.', true); return; }
        video.currentTime = target;
        lastMediaTime = target;
        if (ended) attemptPlay();
        return;
      }
      latest.current.dispatch(videoTime(fullname, time * 1000 + origin()));
    };
    const audio = () => {
      if (current()) latest.current.onAudioStatusChange?.(Boolean(hlsAudio || video.audioTracks?.length || video.mozHasAudio || video.webkitAudioDecodedByteCount));
    };
    const apply = () => {
      if (!current() || (failed && !failedRange)) return;
      const state = latest.current;
      video.muted = state.isMuted;
      try { video.playbackRate = Math.max(0.1, Math.min(16, state.desiredPlaySpeed || 1)); }
      catch { fail('This browser does not support the selected playback speed.'); return; }
      if (video.readyState < 1) return;
      if (video.readyState >= 1) {
        const range = bounds();
        if (failedRange && range.start === failedRange.start && range.end === failedRange.end) return;
        if (!(range.end > range.start)) { fail('No video is available in this selected range.', true); return; }
        const request = state.seekRequest;
        const requested = request && request.fullname === fullname && handledSeek !== request;
        if (initialSeek || requested || failedRange || video.currentTime < range.start || (video.currentTime >= range.end && state.desiredPlaySpeed)) {
          const offset = requested ? request.offset : initialSeek ? state.offset ?? state.loop?.startTime ?? 0 : state.loop?.startTime ?? 0;
          const target = seekTarget(video.seekable, (offset - origin()) / 1000, range, hls?.latestLevelDetails?.fragments);
          if (target === null) { fail('No video is available in this selected range.', true); return; }
          if (failedRange) {
            failed = false;
            failedRange = null;
            setMessage(null);
            hls?.startLoad();
          }
          try {
            video.currentTime = target;
            lastMediaTime = target;
            initialSeek = false;
            if (requested) handledSeek = request;
          } catch { return; } // Metadata can precede a seekable native HLS timeline.
        }
      }
      if (!state.desiredPlaySpeed) {
        playRequest += 1;
        pendingPlay = false;
        video.pause();
      } else if (video.paused) attemptPlay();
    };
    const ready = () => {
      if (!current()) return;
      apply();
      if (video.readyState >= 2 && !video.seeking && !failed) clearLoading();
      report();
      audio();
    };
    const onPlaying = () => {
      if (!current() || failed || video.paused) return;
      setBlocked(false);
      if (!latest.current.desiredPlaySpeed) latest.current.dispatch(play(video.playbackRate));
      clearLoading();
      report();
    };
    const onPause = () => {
      report();
      if (current() && !failed && video.paused && !video.ended && latest.current.desiredPlaySpeed) latest.current.dispatch(pause());
    };
    const onError = () => {
      if (video.error?.code === 1) return;
      fail(video.error?.code === 2 ? 'Unable to load video. Check your network connection.' : 'Unable to load this video. It may be unavailable or unsupported.');
    };
    const listeners = { loadedmetadata: ready, durationchange: ready, loadeddata: ready, canplay: ready,
      seeked: () => {
        ready();
        if (current() && !video.seeking && handledSeek && latest.current.seekRequest === handledSeek) {
          latest.current.dispatch(seekDone(handledSeek));
        }
      }, timeupdate: report, playing: onPlaying, pause: onPause, ended: report,
      waiting: loading, stalled: loading, seeking: loading, error: onError };
    Object.entries(listeners).forEach(([event, handler]) => video.addEventListener(event, handler));
    video.audioTracks?.addEventListener?.('addtrack', audio);
    const nextFrame = () => {
      if (!current()) return;
      report();
      frame = video.requestVideoFrameCallback(nextFrame);
    };
    if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(nextFrame);
    controls.current = { apply, play: () => { setBlocked(false); latest.current.dispatch(play(latest.current.desiredPlaySpeed || 1)); attemptPlay(); } };
    setMessage(null);
    setBlocked(false);
    latest.current.onAudioStatusChange?.(false);
    loading();
    apply();
    const src = api.video.getQcameraStreamUrl(fullname, route.share_exp, route.share_sig);
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.load();
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (!current()) return;
        if (!Hls.isSupported()) { fail('This browser does not support HLS video.'); return; }
        hls = new Hls({ maxBufferLength: 40 });
        hls.on(Hls.Events.ERROR, (_event, error) => {
          if (!current()) return;
          // HLS can skip a hole beyond a selected loop before reporting it.
          // Rewinding into that hole repeatedly turns recovery into a fatal error.
          if (!error.fatal && error.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE
            && latest.current.loop && video.currentTime >= bounds().end) {
            const range = bounds();
            const target = seekTarget(video.seekable, range.start, range, hls.latestLevelDetails?.fragments);
            if (target !== null && lastMediaTime > range.start && lastMediaTime < range.end) {
              video.currentTime = target;
              lastMediaTime = target;
            } else fail('Video cannot play within this selected range.', true);
            return;
          }
          if (!error.fatal) return;
          fail(error.response?.code === 404
            ? 'This video segment has not uploaded yet or has been deleted.'
            : 'Unable to load this video. Please retry.');
        });
        hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => {
          hlsAudio = Boolean(data.audio);
          audio();
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      }).catch(() => fail('Unable to load the video player. Please retry.'));
    }
    return () => {
      active = false;
      playRequest += 1;
      clearTimeout(timeout);
      if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
      Object.entries(listeners).forEach(([event, handler]) => video.removeEventListener(event, handler));
      video.audioTracks?.removeEventListener?.('addtrack', audio);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
      controls.current = null;
    };
  }, [route?.fullname, route?.share_exp, route?.share_sig, retry]);

  useEffect(() => { controls.current?.apply(); }, [props.desiredPlaySpeed, props.isMuted, props.seekRequest,
    props.loop?.startTime, props.loop?.duration, route?.videoStartOffset]);

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      {(message || blocked || props.isBufferingVideo) && <div className="z-50 absolute h-full w-full bg-[#16181AAA] flex flex-col items-center justify-center" role={message ? 'alert' : 'status'}>
        {message ? <><ErrorOutline className="mb-2" /><Typography>{message}</Typography><Button onClick={() => setRetry(value => value + 1)}>Retry video</Button></>
          : blocked ? <Button onClick={() => controls.current?.play()}>Play video</Button>
          : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
      </div>}
      <video ref={videoRef} playsInline muted={props.isMuted} preload="auto" className="w-full h-full" aria-label="Drive video" />
    </div>
  );
}

export default connect(state => ({ currentRoute: state.currentRoute, desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset, seekRequest: state.seekRequest, loop: state.loop, isBufferingVideo: state.isBufferingVideo }))(DriveVideo);

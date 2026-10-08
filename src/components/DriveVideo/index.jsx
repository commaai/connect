import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, Typography } from '@material-ui/core';

import { api } from '../../api/backend';
import { ErrorOutline } from '../../icons';
import { attachPlaybackClock, subscribePlaybackFrames } from '../../timeline';
import { bufferVideo, pause, play, playbackBounds, videoTime } from '../../timeline/playback';
import './style.css';

const missingVideo = 'This video segment has not uploaded yet or has been deleted.';

// A route owns one media element. Redux sends commands; media events report results.
export function RouteVideo(props) {
  const { src, currentRoute, desiredPlaySpeed, seekRequest, isMuted, isBufferingVideo, onPlaybackStatusChange } = props;
  const bounds = playbackBounds(props);
  const emptyRange = bounds.start === bounds.end;
  const videoRef = useRef(null);
  const controller = useRef(null);
  const latest = useRef(props);
  const unfinishedSeek = useRef(null);
  const lastSeekId = useRef(seekRequest?.id);
  latest.current = props;
  const [error, setError] = useState(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [reload, setReload] = useState(0);
  const [forceMse, setForceMse] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const { dispatch, onAudioStatusChange } = latest.current;
    let active = true;
    let hls;
    let playAttempt = 0;
    let playPending = false;
    let recoveredMedia = false;
    // load() and transport resets can queue pause events before the source is ready.
    let recoveringMedia = true;
    let hasAudio = false;
    let failed = false;
    let switchingToMse = false;
    let pendingSeek = unfinishedSeek.current ?? latest.current.offset ?? latest.current.seekRequest?.offset ?? 0;
    const nativeHls = !forceMse && Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
    const origin = () => latest.current.currentRoute.videoStartOffset || 0;
    const observed = () => latest.current.offset ?? latest.current.seekRequest?.offset ?? origin();
    const readOffset = () => pendingSeek !== null || unfinishedSeek.current !== null || video.seeking ? observed() : origin() + video.currentTime * 1000;
    const detachClock = attachPlaybackClock(currentRoute.fullname, readOffset);
    const buffering = (value) => {
      if (active && latest.current.isBufferingVideo !== value) dispatch(bufferVideo(value));
    };
    const report = () => {
      if (active && pendingSeek === null && unfinishedSeek.current === null && !video.seeking) dispatch(videoTime(currentRoute.fullname, readOffset()));
    };
    const detectAudio = () => {
      if (!nativeHls) return;
      const audio = Boolean(video.audioTracks?.length || video.webkitAudioDecodedByteCount > 0 || video.mozHasAudio);
      if (audio !== hasAudio) { hasAudio = audio; onAudioStatusChange?.(audio); }
    };
    const fail = (message) => {
      failed = true;
      setError(message);
      buffering(false);
      video.pause();
      dispatch(pause());
    };
    const fallbackToMse = () => {
      if (!nativeHls || switchingToMse) return;
      switchingToMse = true;
      unfinishedSeek.current = unfinishedSeek.current ?? pendingSeek ?? readOffset();
      recoveringMedia = true;
      buffering(true);
      import('hls.js').then(({ default: Hls }) => {
        if (!active) return;
        if (Hls.isSupported()) setForceMse(true);
        else fail('This browser cannot play this video.');
      }).catch(() => { if (active) fail('Unable to load the video player. Try loading it again.'); });
    };
    const requestPlay = (force = false) => {
      if (!active || failed || playPending || (!video.paused && !video.ended) || (!force && !latest.current.desiredPlaySpeed)
        || (!video.src && video.readyState < 1)) return;
      playAttempt += 1;
      const attempt = playAttempt;
      playPending = true;
      Promise.resolve(video.play()).catch((reason) => {
        if (!active || attempt !== playAttempt || reason?.name === 'AbortError') return;
        if (nativeHls && reason?.name === 'NotSupportedError') {
          fallbackToMse();
        } else if (reason?.name === 'NotAllowedError') {
          setNeedsPlay(true);
          buffering(false);
          dispatch(pause());
        } else {
          fail('Unable to play video. Try loading it again.');
        }
      }).finally(() => {
        if (attempt === playAttempt) playPending = false;
      });
    };
    const applySeek = () => {
      if (pendingSeek === null || video.readyState < 1) return;
      unfinishedSeek.current = pendingSeek;
      let time = Math.max(0, (pendingSeek - origin()) / 1000);
      if (Number.isFinite(video.duration)) time = Math.min(time, video.duration);
      try {
        const changed = Math.abs(video.currentTime - time) > 0.001;
        if (changed) {
          video.currentTime = time;
          buffering(true);
        }
        pendingSeek = null;
        if (!changed && !video.seeking && video.readyState >= 2) {
          unfinishedSeek.current = null;
          buffering(false);
          report();
        }
      } catch {
        // Native HLS can expose metadata before the seekable timeline is ready.
      }
    };
    const seekTo = (offset) => {
      unfinishedSeek.current = offset;
      pendingSeek = offset;
      applySeek();
    };
    const checkLoop = () => {
      const { loop, desiredPlaySpeed: speed } = latest.current;
      const { start, end } = playbackBounds(latest.current);
      if (speed && loop && end > start && !video.seeking && pendingSeek === null && readOffset() >= end) {
        seekTo(start);
      }
    };
    const unsubscribeFrames = subscribePlaybackFrames(() => { if (active && !failed && !video.paused && !video.ended && !video.seeking) checkLoop(); });
    const ready = () => {
      if (failed) return;
      applySeek();
      if (pendingSeek === null && !video.seeking && video.readyState >= 2) {
        unfinishedSeek.current = null;
        recoveringMedia = false;
        setError(null);
        buffering(false);
        report();
      }
      detectAudio();
      requestPlay();
    };
    const events = {
      loadedmetadata: ready,
      loadeddata: ready,
      canplay: ready,
      durationchange: applySeek,
      timeupdate: () => { checkLoop(); report(); detectAudio(); },
      seeking: () => buffering(true),
      seeked: ready,
      waiting: () => buffering(true),
      stalled: () => { if (video.readyState < 3) buffering(true); },
      playing: () => {
        if (failed) return;
        setError(null);
        setNeedsPlay(false);
        buffering(false);
      },
      pause: () => {
        if (!video.paused) return;
        report();
        if (!video.ended && !recoveringMedia && latest.current.desiredPlaySpeed) dispatch(pause());
      },
      ended: () => {
        report();
        const { loop, desiredPlaySpeed: speed } = latest.current;
        const { start, end } = playbackBounds(latest.current);
        if (speed && loop && end > start && (start - origin()) / 1000 < video.duration) {
          seekTo(start);
          requestPlay();
        } else dispatch(pause());
      },
      error: () => {
        // HLS owns MSE decoding recovery; competing DOM errors must not stop it.
        if (!video.error) return;
        if (nativeHls && video.error?.code === 4) fallbackToMse();
        else if (nativeHls) fail(video.error?.code === 2 ? 'Unable to load video. Check your network connection.' : 'Unable to load video. Try loading it again.');
      },
    };
    Object.entries(events).forEach(([name, handler]) => video.addEventListener(name, handler));
    if (nativeHls) video.audioTracks?.addEventListener?.('addtrack', detectAudio);
    controller.current = {
      seekTo,
      refreshOrigin: () => {
        const target = unfinishedSeek.current ?? pendingSeek;
        if (target !== null) seekTo(target);
        else report();
      },
      setPlayback: () => {
        const speed = latest.current.desiredPlaySpeed;
        if (speed) {
          // Never vary the rate to correct clock drift, especially with audio on iOS.
          if (video.playbackRate !== speed) video.playbackRate = speed;
          requestPlay();
        } else {
          playAttempt += 1;
          playPending = false;
          video.pause();
        }
      },
      start: () => { dispatch(play(latest.current.desiredPlaySpeed || 1)); requestPlay(true); },
    };
    setError(null);
    setNeedsPlay(false);
    buffering(true);
    onAudioStatusChange?.(false);
    if (nativeHls) {
      video.src = src;
      video.load();
    } else {
      // Supported native HLS needs no MSE download.
      import('hls.js').then(({ default: Hls }) => {
        if (!active) return;
        if (!Hls.isSupported()) { fail('This browser does not support video playback.'); return; }
        const target = unfinishedSeek.current ?? pendingSeek ?? latest.current.offset ?? origin();
        hls = new Hls({ maxBufferLength: 40, backBufferLength: 30, startPosition: Math.max(0, (target - origin()) / 1000) });
        hls.on(Hls.Events.MEDIA_DETACHING, () => {
          if (!active || failed) return;
          unfinishedSeek.current = unfinishedSeek.current ?? pendingSeek ?? readOffset();
          pendingSeek = unfinishedSeek.current;
          recoveringMedia = true;
          buffering(true);
        });
        hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => { if (active) onAudioStatusChange?.(Boolean(data.audio)); });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!active) return;
          // Retrying an absent fragment forever leaves the player in a spinner.
          const missing = data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response?.code === 404;
          if (!data.fatal && !missing) return; // hls.js handles transient errors and declared gaps.
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
            recoveredMedia = true;
            unfinishedSeek.current = unfinishedSeek.current ?? pendingSeek ?? readOffset();
            pendingSeek = unfinishedSeek.current;
            recoveringMedia = true;
            hls.recoverMediaError();
          } else {
            hls.stopLoad();
            fail(missing ? missingVideo : 'Unable to load video. Try loading it again.');
          }
        });
        hls.attachMedia(video);
        hls.loadSource(src);
      }).catch(() => { if (active) fail('Unable to load the video player. Try loading it again.'); });
    }
    controller.current.setPlayback();
    return () => {
      active = false;
      controller.current = null;
      detachClock();
      unsubscribeFrames();
      Object.entries(events).forEach(([name, handler]) => video.removeEventListener(name, handler));
      if (nativeHls) video.audioTracks?.removeEventListener?.('addtrack', detectAudio);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, reload, forceMse]);

  useEffect(() => {
    if (lastSeekId.current !== seekRequest?.id) {
      lastSeekId.current = seekRequest?.id;
      controller.current?.seekTo(seekRequest?.offset ?? 0);
    }
  }, [seekRequest?.id]);
  useEffect(() => { controller.current?.setPlayback(); }, [desiredPlaySpeed]);
  useEffect(() => { controller.current?.refreshOrigin(); }, [currentRoute.videoStartOffset]);
  useEffect(() => {
    onPlaybackStatusChange?.(emptyRange ? { message: 'No video is available in this selected range.' } : error
      ? { message: error, label: 'Retry', recover: () => setReload(value => value + 1), error: true }
      : needsPlay ? { message: 'Play the video to continue this route.', label: 'Play video', recover: () => controller.current?.start() } : null);
  }, [emptyRange, error, needsPlay, onPlaybackStatusChange]);

  return (
    <div className="min-h-[200px] min-w-0 w-full relative max-w-[964px] m-[0_auto] aspect-[1.593] bg-black">
      <video ref={videoRef} playsInline muted={isMuted} preload="auto" aria-label="Drive video" className="h-full w-full object-contain" />
      {(emptyRange || error || needsPlay) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#16181AAA] p-4 text-center">
          {emptyRange ? <Typography role="status">No video is available in this selected range.</Typography>
            : error ? <><ErrorOutline /><Typography role="alert">{error}</Typography><Button variant="contained" onClick={() => setReload(value => value + 1)}>Retry</Button></>
            : <Button variant="contained" onClick={() => controller.current?.start()}>Play video</Button>}
        </div>
      )}
      {isBufferingVideo && !emptyRange && !error && !needsPlay && (
        <div role="status" aria-label="Loading video" className="drive-video-loading pointer-events-none absolute inset-0 flex items-center justify-center">
          <img src="/images/comma-white.png" alt="" aria-hidden="true" className="drive-video-loading-comma" />
        </div>
      )}
    </div>
  );
}

export function DriveVideo(props) {
  const { currentRoute } = props;
  if (!currentRoute) return null;
  const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
  return <RouteVideo key={currentRoute.fullname} {...props} src={src} />;
}

export default connect(state => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRequest: state.seekRequest,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
}))(DriveVideo);

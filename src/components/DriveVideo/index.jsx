import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachPlaybackClock } from '../../timeline';
import { bufferVideo, pause, play, videoTime } from '../../timeline/playback';

const missingVideo = 'This video segment has not uploaded yet or has been deleted.';

// A route owns one media element. Redux sends commands; media events report results.
export function RouteVideo(props) {
  const { src, currentRoute, desiredPlaySpeed, seekRequest, isMuted, isBufferingVideo, loop: selectedLoop } = props;
  const emptyRange = selectedLoop?.duration === 0;
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
    let frame;
    let playAttempt = 0;
    let playPending = false;
    let recoveredMedia = false;
    // load() and transport resets can queue pause events before the source is ready.
    let recoveringMedia = true;
    let hasAudio = false;
    let failed = false;
    let waitingForData = true;
    let switchingToMse = false;
    let pendingSeek = unfinishedSeek.current ?? latest.current.offset ?? latest.current.seekRequest?.offset ?? 0;
    const nativeHls = !forceMse && Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
    const origin = () => latest.current.currentRoute.videoStartOffset || 0;
    const observed = () => latest.current.offset ?? origin();
    const readOffset = () => pendingSeek !== null || unfinishedSeek.current !== null || video.seeking ? observed() : origin() + video.currentTime * 1000;
    const detachClock = attachPlaybackClock(currentRoute.fullname, readOffset);
    const buffering = (value) => {
      waitingForData = value;
      if (value) stopFrames();
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
    const stopFrames = () => {
      if (frame === undefined) return;
      if (video.requestVideoFrameCallback) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      frame = undefined;
    };
    const checkLoop = () => {
      const { loop, desiredPlaySpeed: speed } = latest.current;
      if (speed && loop?.duration > 0 && !video.seeking && pendingSeek === null
        && readOffset() >= loop.startTime + loop.duration) {
        seekTo(Math.max(origin(), loop.startTime));
      }
    };
    const nextFrame = () => {
      frame = undefined;
      if (!active || waitingForData || video.seeking || video.paused || video.ended) return;
      checkLoop();
      frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(nextFrame) : requestAnimationFrame(nextFrame);
    };
    const ready = () => {
      if (failed) return;
      applySeek();
      if (pendingSeek === null && !video.seeking && video.readyState >= 2) {
        unfinishedSeek.current = null;
        recoveringMedia = false;
        setError(null);
        buffering(false);
        report();
        if (frame === undefined) nextFrame();
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
        if (frame === undefined) nextFrame();
      },
      pause: () => {
        if (!video.paused) return;
        stopFrames();
        report();
        if (!video.ended && !recoveringMedia && latest.current.desiredPlaySpeed) dispatch(pause());
      },
      ended: () => {
        stopFrames();
        report();
        const { loop, desiredPlaySpeed: speed } = latest.current;
        if (speed && loop?.duration > 0 && (loop.startTime - origin()) / 1000 < video.duration) {
          seekTo(Math.max(origin(), loop.startTime));
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
      stopFrames();
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

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] bg-black">
      <video ref={videoRef} playsInline muted={isMuted} preload="auto" aria-label="Drive video" className="h-full w-full" />
      {(emptyRange || error || needsPlay || isBufferingVideo) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#16181AAA] p-4 text-center">
          {emptyRange ? <Typography role="status">No video is available in this selected range.</Typography>
            : error ? <><ErrorOutline /><Typography role="alert">{error}</Typography><Button variant="contained" onClick={() => setReload(value => value + 1)}>Retry</Button></>
            : needsPlay ? <Button variant="contained" onClick={() => controller.current?.start()}>Play video</Button>
              : <CircularProgress aria-label="Loading video" style={{ color: Colors.white }} thickness={4} size={50} />}
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

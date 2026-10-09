import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import Hls from 'hls.js';
import { api } from '../../api/backend';
import Colors from '../../colors';
import { mediaTimeline, playlistTimeline } from './mediaTimeline';
import { attachMediaClock, currentOffset } from '../../timeline';
import { bufferVideo, observePosition, pause, play } from '../../timeline/playback';
import { isFirefox, isIos } from '../../utils/browser';

export function DriveVideo(props) {
  const { currentRoute, isMuted, visible = true, dispatch } = props;
  const videoRef = useRef(null);
  const latest = useRef(props);
  latest.current = props;
  const controller = useRef(null);
  const resume = useRef(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const src = currentRoute ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig) : null;
  const route = currentRoute?.fullname;

  useEffect(() => {
    if (!src) return undefined;
    const video = videoRef.current;
    const initialOrigin = latest.current.currentRoute.videoStartOffset ?? 0;
    // Events can arrive after the stream. Read the active route's latest camera
    // origin without recreating the decoder or borrowing the next route's data.
    const origin = () => latest.current.currentRoute?.fullname === route
      ? latest.current.currentRoute.videoStartOffset ?? 0 : initialOrigin;
    let active = true;
    let hls;
    let frameId;
    let timeline = null;
    let nativeHls = false;
    let decodingSeek = false;
    let internalPlay = false;
    let audioReported = false;
    const detectAudio = () => {
      if (!audioReported && video.audioTracks?.length) {
        audioReported = true;
        latest.current.onAudioStatusChange?.(true);
      }
    };
    const manifestRequest = new AbortController();
    let recoveredMedia = false;
    let playingPromise = false;
    let commandGeneration = 0;
    let failed = false;
    let internalPause = false;
    const pauseVideo = () => {
      if (!video.paused) { internalPause = true; video.pause(); }
    };
    let pending = resume.current?.route === route ? resume.current.offset : latest.current.offset ?? latest.current.loop?.startTime ?? latest.current.zoom?.start ?? origin();
    let observedTime = Math.max(0, (pending - origin()) / 1000);
    const toRoute = time => timeline?.toRoute(time, origin()) ?? time * 1000 + origin();
    const position = () => toRoute(observedTime);
    const readPosition = () => {
      // Hidden video does not reliably receive frame callbacks. Its media clock
      // still follows native playback and freezes naturally on pause or stalls.
      const nativeClock = !video.requestVideoFrameCallback || latest.current.visible === false || document.hidden;
      return nativeClock && !failed && pending === null && !video.seeking && video.readyState >= 2
        ? toRoute(video.currentTime) : position();
    };
    let appliedTarget = null;
    let frameTarget = pending;
    let requested = pending;
    let revision = latest.current.seekRevision ?? 0;
    setError(null);
    setNeedsGesture(false);
    let buffering;
    const setBuffering = value => {
      if (buffering === value) return;
      buffering = value;
      dispatch(bufferVideo(value));
    };
    setBuffering(true);
    latest.current.onAudioStatusChange?.(false);
    const detach = attachMediaClock(route, readPosition);
    const fail = message => {
      if (!active) return;
      failed = true;
      resume.current = { route, offset: pending ?? readPosition() };
      hls?.stopLoad();
      pauseVideo();
      setBuffering(true);
      setError(message);
    };
    const playVideo = (speed = latest.current.desiredPlaySpeed) => {
      if (!active || failed || pending !== null) return;
      // Native HLS and timestamp gaps can finish a paused seek before repainting.
      // Decode one muted frame, then restore the user's paused/audio intent.
      decodingSeek = !speed && frameTarget !== null && (nativeHls || (timeline && toRoute(video.currentTime) > requested + 200));
      video.muted = decodingSeek || latest.current.isMuted;
      if (!speed && !decodingSeek) { pauseVideo(); return; }
      video.playbackRate = Math.min(decodingSeek ? .25 : speed, isFirefox() && !video.muted ? 8 : 16);
      if (!video.paused || playingPromise) return;
      playingPromise = true;
      const generation = commandGeneration;
      internalPlay = decodingSeek;
      video.play().then(() => {
        if (!active) return;
        setNeedsGesture(false);
        if (pending !== null || (!latest.current.desiredPlaySpeed && !decodingSeek)) pauseVideo();
      }).catch(e => {
        if (!active || pending !== null || (!latest.current.desiredPlaySpeed && !decodingSeek) || e.name === 'AbortError') return;
        if (e.name === 'NotAllowedError') setNeedsGesture(true);
        else fail('Unable to load video. Check network connection.');
      }).finally(() => {
        playingPromise = false;
        // A seek can complete while the preceding play promise is unresolved.
        // Resume the newer command once that promise releases the element.
        if (active && generation !== commandGeneration) sync();
      });
    };
    const sync = () => {
      if (!active || failed) return;
      if (pending !== null && video.readyState >= 1) {
        const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
        let target = Math.max(0, Math.min(duration, timeline?.toMedia(pending, origin()) ?? (pending - origin()) / 1000));
        // Seeking exactly on an uploaded chunk's first timestamp can display
        // the preceding chunk's final frame on WebKit. Step inside the chunk.
        if (timeline && toRoute(target) > pending + 200) target = Math.min(duration, target + .001);
        const loop = latest.current.loop;
        if (timeline && loop && toRoute(target) > pending + .5 && toRoute(target) >= loop.startTime + loop.duration) {
          fail('No video is available in this selected range.');
          return;
        }
        if (video.seeking) return;
        if (appliedTarget !== target && Math.abs(video.currentTime - target) > .02) {
          appliedTarget = target;
          frameTarget = toRoute(target);
          video.currentTime = target;
          return;
        }
        if (video.readyState < 2) return;
        frameTarget = toRoute(video.currentTime);
        pending = null;
        resume.current = null;
      }
      playVideo();
    };
    const command = offset => {
      commandGeneration += 1;
      requested = offset;
      pending = offset;
      appliedTarget = null;
      frameTarget = offset;
      if (failed) resume.current = { route, offset };
      revision = latest.current.seekRevision ?? 0;
      pauseVideo();
      setBuffering(true);
      sync();
    };
    const publish = (time, commit = false) => {
      if (!active || failed || video.seeking || pending !== null || video.readyState < 2) return;
      detectAudio();
      const observed = toRoute(time);
      if (video.paused && Math.abs(observed - toRoute(video.currentTime)) > 200) return;
      // A callback queued before a seek may arrive after seeked. In particular,
      // adjacent media frames can be a minute apart on the route timeline.
      if (frameTarget !== null && Math.abs(observed - frameTarget) > Math.max(200, video.playbackRate * 100)) return;
      frameTarget = null;
      observedTime = time;
      if (decodingSeek) {
        decodingSeek = false;
        pauseVideo();
        video.muted = latest.current.isMuted;
      }
      // Frame callbacks keep the shared clock exact. Redux snapshots follow media
      // events so connected controls do not rerender for every decoded frame.
      if (commit || video.paused) dispatch(observePosition(route, revision, observed));
      setBuffering(false);
      const loop = latest.current.loop;
      if (loop && loop.duration > 0 && latest.current.desiredPlaySpeed && observed >= loop.startTime + loop.duration) command(loop.startTime);
    };
    const timeUpdate = () => {
      if (!video.requestVideoFrameCallback || latest.current.visible === false) publish(video.currentTime, true);
      else publish(observedTime, true);
    };
    const frame = (_, metadata) => {
      publish(metadata.mediaTime);
      if (active) frameId = video.requestVideoFrameCallback(frame);
    };
    const ready = () => {
      if (!active) return;
      detectAudio();
      sync();
      if (!video.requestVideoFrameCallback || latest.current.visible === false || (video.paused && !decodingSeek)) publish(video.currentTime);
    };
    const ended = () => {
      const loop = latest.current.loop;
      if (loop && loop.duration > 0 && latest.current.desiredPlaySpeed) command(loop.startTime);
      else { observedTime = video.currentTime; dispatch(observePosition(route, revision, position())); dispatch(pause()); }
    };
    const listeners = {
      loadedmetadata: ready, canplay: ready, seeked: ready, playing: ready,
      timeupdate: timeUpdate, ended,
      pause: () => {
        publish(observedTime, true);
        if (internalPause) { internalPause = false; return; }
        if (active && !failed && pending === null && !video.ended && latest.current.desiredPlaySpeed) dispatch(pause());
      },
      play: () => {
        if (internalPlay) { internalPlay = false; return; }
        if (active && !failed && !latest.current.desiredPlaySpeed) dispatch(play(video.playbackRate));
      },
      waiting: () => setBuffering(true),
      error: () => fail('Unable to load video. Check network connection.'),
    };
    Object.entries(listeners).forEach(([name, handler]) => video.addEventListener(name, handler));
    if (video.requestVideoFrameCallback) frameId = video.requestVideoFrameCallback(frame);
    controller.current = { sync, command, playVideo, gesturePlay: () => {
      const speed = latest.current.desiredPlaySpeed || 1;
      dispatch(play(speed));
      playVideo(speed);
    } };
    // Use native HLS on iOS (including desktop-mode iPad); MSE elsewhere.
    const nativeIos = isIos() || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if ((!nativeIos && Hls.isSupported()) || !video.canPlayType('application/vnd.apple.mpegurl')) {
      if (!Hls.isSupported()) fail('Unable to load video in this browser.');
      else {
        hls = new Hls({ maxBufferLength: 40, startPosition: Math.max(0, (pending - origin()) / 1000) });
        hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
          if (!active) return;
          timeline = mediaTimeline(data.details.fragments);
          if (pending !== null) { appliedTarget = null; sync(); }
        });
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          // Demuxing can reveal a timestamp hole after the playlist was parsed.
          if (active && !failed && frameTarget !== null) command(requested);
        });
        hls.on(Hls.Events.BUFFER_CODECS, (_, data) => { if (active) latest.current.onAudioStatusChange?.(Boolean(data.audio)); });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!active) return;
          if (data.response?.code === 404) fail('This video segment has not uploaded yet or has been deleted.');
          else if (data.fatal) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) { recoveredMedia = true; hls.recoverMediaError(); }
            else fail('Unable to load video. Check network connection.');
          }
        });
        hls.attachMedia(video);
        hls.loadSource(src);
      }
    } else {
      nativeHls = true;
      video.src = src;
      video.load();
      // Native HLS does not expose playlist fragments. Read the same small
      // manifest for route mapping; the browser still owns decoding and audio.
      fetch(src, { signal: manifestRequest.signal }).then(async response => {
        if (!response.ok) throw new Error('Manifest unavailable');
        const mapped = playlistTimeline(await response.text());
        if (!active || !mapped) return;
        const resumeOffset = pending ?? readPosition();
        timeline = mapped;
        command(resumeOffset);
      }).catch(e => { if (active && e.name !== 'AbortError') fail('Unable to load video. Check network connection.'); });
    }
    return () => {
      resume.current = { route, offset: pending ?? readPosition() };
      active = false;
      manifestRequest.abort();
      controller.current = null;
      detach();
      Object.entries(listeners).forEach(([name, handler]) => video.removeEventListener(name, handler));
      if (frameId !== undefined) video.cancelVideoFrameCallback(frameId);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, route, retry, dispatch]);

  useEffect(() => { controller.current?.command(latest.current.offset ?? 0); }, [props.seekRevision]);
  useEffect(() => { controller.current?.sync(); }, [props.desiredPlaySpeed, isMuted, props.currentRoute?.videoStartOffset]);

  const retryVideo = () => {
    resume.current ??= { route, offset: currentOffset() };
    setRetry(value => value + 1);
  };
  return (
    <>
      {(error || needsGesture) && (
        <div role="alert" className="p-3 text-center">
          <Typography>{error || 'Press Play to start video.'}</Typography>
          <Button onClick={error ? retryVideo : () => controller.current?.gesturePlay()}>{error ? 'Retry' : 'Play'}</Button>
        </div>
      )}
      <div style={{ display: visible ? undefined : 'none' }} className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        {props.isBufferingVideo && !error && !needsGesture && <div className="z-50 absolute h-full w-full bg-[#16181AAA] flex items-center justify-center"><CircularProgress style={{ color: Colors.white }} thickness={4} size={50} /></div>}
        <video ref={videoRef} playsInline muted={isMuted} className="h-full w-full" />
      </div>
    </>
  );
}

export default connect(state => ({
  currentRoute: state.currentRoute, zoom: state.zoom, loop: state.loop,
  desiredPlaySpeed: state.desiredPlaySpeed, offset: state.offset,
  seekRevision: state.seekRevision, isBufferingVideo: state.isBufferingVideo,
}))(DriveVideo);

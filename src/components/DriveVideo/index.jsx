import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { activeVideo, attachVideo, currentOffset, detachVideo, endVideo, pastVideoEnd, routeToVideo, seekTo } from '../../timeline';
import { resumePlayback, syncPlayback } from '../../timeline/playback';
import { hasMediaSource } from '../../utils/browser.js';

const BUFFERING_DELAY = 250;
const MEDIA_ERR_NETWORK = 2;

function errorMessage(network, httpCode) {
  if (httpCode === 404) return 'This video segment has not uploaded yet or has been deleted.';
  return network && !httpCode ? 'Unable to load video. Check network connection.' : 'Unable to load video';
}

const VideoOverlay = ({ loading, error, onRetry }) => (error || loading) && (
  <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
    <div className="relative text-center top-[calc(50%_-_25px)]">
      {error ? (
        <>
          <ErrorOutline className="mb-2" />
          <Typography>{error}</Typography>
          <Button className="mt-2" style={{ color: Colors.white }} onClick={onRetry}>Retry</Button>
        </>
      ) : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
    </div>
  </div>
);

const RouteVideo = ({ dispatch, route, loop, desiredPlaySpeed, seekCount, isMuted, onAudioStatusChange }) => {
  const videoRef = useRef(null);
  const bufferingTimer = useRef(null);
  const restartTimer = useRef(null);
  const lastTime = useRef(0);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const native = !hasMediaSource();

  const fail = (message) => {
    detachVideo(videoRef.current);
    videoRef.current.pause();
    setError(message);
  };

  const sync = (speed) => {
    if (activeVideo() === videoRef.current) dispatch(syncPlayback(speed));
  };

  const showBuffering = () => {
    clearTimeout(bufferingTimer.current);
    bufferingTimer.current = setTimeout(() => setBuffering(true), BUFFERING_DELAY);
  };
  const hideBuffering = () => {
    clearTimeout(bufferingTimer.current);
    setBuffering(false);
  };

  useEffect(() => () => onAudioStatusChange?.(false), []);

  useEffect(() => {
    const video = videoRef.current;
    const src = api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig);
    // attach before hls.js loads so the clock holds meanwhile
    attachVideo(video, route.fullname);
    showBuffering();

    let hls = null;
    let unmounted = false;
    if (native) {
      video.src = src;
      dispatch(resumePlayback());
    } else {
      import('hls.js/light').then(({ default: Hls }) => {
        if (unmounted) return;
        hls = new Hls({ startPosition: routeToVideo(currentOffset()), maxBufferLength: 40 });
        const { MEDIA_ERROR, NETWORK_ERROR } = Hls.ErrorTypes;
        let triedRecovery = false;
        // also fires when hls.js re-attaches by itself
        hls.on(Hls.Events.MEDIA_ATTACHED, () => dispatch(resumePlayback()));
        hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => data.audio && onAudioStatusChange?.(true));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return; // hls.js already retries these
          if (data.type !== MEDIA_ERROR || triedRecovery) {
            fail(errorMessage(data.type === NETWORK_ERROR, data.response?.code));
            return;
          }
          triedRecovery = true;
          // the next loadedmetadata restores the position
          attachVideo(video, route.fullname);
          hls.recoverMediaError();
        });
        hls.attachMedia(video);
        hls.loadSource(src);
      }).catch(() => {
        if (!unmounted) fail(errorMessage(true));
      });
    }

    return () => {
      unmounted = true;
      detachVideo(video);
      clearTimeout(bufferingTimer.current);
      clearTimeout(restartTimer.current);
      if (hls) {
        hls.destroy();
      } else {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [attempt]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    // native hls can send waiting without playing
    const advancing = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.seeking && video.currentTime !== lastTime.current;
    if (advancing) hideBuffering();
    lastTime.current = video.currentTime;
    if (loop != null && !video.paused && currentOffset() > loop.startTime + loop.duration) seekTo(loop.startTime);
  };

  // the clock plays on past the end of a short video until the loop restarts
  const scheduleRestart = () => {
    clearTimeout(restartTimer.current);
    if (!pastVideoEnd() || !desiredPlaySpeed) return;
    const loopEnd = loop ? loop.startTime + loop.duration : route.duration;
    restartTimer.current = setTimeout(() => {
      seekTo(loop?.startTime ?? 0);
      dispatch(resumePlayback());
    }, (loopEnd - currentOffset()) / desiredPlaySpeed);
  };
  useEffect(scheduleRestart, [desiredPlaySpeed, seekCount, loop]);

  const onEnded = () => {
    endVideo(desiredPlaySpeed);
    hideBuffering();
    scheduleRestart();
  };

  const onRetry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  return (
    <>
      <VideoOverlay loading={buffering && desiredPlaySpeed > 0} error={error} onRetry={onRetry} />
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        muted={isMuted}
        preload="auto"
        onPlay={() => {
          // media keys can play an ended element, which restarts it from 0
          if (pastVideoEnd()) seekTo(currentOffset());
          sync(videoRef.current.playbackRate);
        }}
        onPause={() => {
          if (!videoRef.current.ended) sync(0);
        }}
        onEnded={onEnded}
        onTimeUpdate={onTimeUpdate}
        onWaiting={showBuffering}
        onSeeking={showBuffering}
        onPlaying={hideBuffering}
        onSeeked={hideBuffering}
        onCanPlay={hideBuffering}
        onLoadedData={native ? () => onAudioStatusChange?.(videoRef.current.audioTracks?.length > 0) : undefined}
        onError={native ? () => fail(errorMessage(videoRef.current.error.code === MEDIA_ERR_NETWORK)) : undefined}
      />
    </>
  );
};

// remount per route so events from the previous source cannot leak into the next one
const DriveVideo = ({ currentRoute, ...props }) => (
  <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
    {currentRoute && <RouteVideo key={currentRoute.fullname} route={currentRoute} {...props} />}
  </div>
);

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  loop: state.loop,
  desiredPlaySpeed: state.desiredPlaySpeed,
  seekCount: state.seekCount,
});

export default connect(stateToProps)(DriveVideo);

/* eslint-disable camelcase */
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { renewVideoLink } from '../../actions';
import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline, RefreshIcon } from '../../icons';
import { isIos } from '../../utils/browser.js';
import { media } from '../../timeline/media';
import { attachHlsSource, attachNativeSource } from './hls';

const ERROR_MESSAGES = {
  expired: 'This video link has expired. Retry or reload the page.',
  media: 'Unable to play video.',
  network: 'Unable to load video. Check network connection.',
  'not-found': 'This video segment has not uploaded yet or has been deleted.',
};

export const VideoOverlay = ({ errorOnly }) => {
  const error = useSyncExternalStore(media.subscribe, () => media.getSnapshot().error);
  const buffering = useSyncExternalStore(media.subscribe, () => media.getSnapshot().buffering);
  if (!error && (errorOnly || !buffering)) return null;
  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center bg-[#16181ACC] ${error ? '' : 'animate-[fadein_0.2s_0.3s_both]'}`}
      role="status"
    >
      <div className="flex flex-col items-center px-4 text-center">
        {error ? (
          <>
            <ErrorOutline className="mb-2" />
            <Typography>{ERROR_MESSAGES[error]}</Typography>
            <Button
              className="mt-3 rounded-3xl px-5 normal-case text-white bg-white/10 hover:bg-white/20"
              onClick={media.retry}
            >
              <RefreshIcon className="mr-2" style={{ fontSize: 20 }} />
              Retry
            </Button>
          </>
        ) : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
      </div>
    </div>
  );
};

function DriveVideo({ currentRoute, dispatch, loop }) {
  const videoRef = useRef(null);

  const src = currentRoute
    ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
    : '';

  useEffect(() => {
    media.setVideoStart(currentRoute?.videoStartOffset);
  }, [currentRoute?.videoStartOffset]);

  useEffect(() => {
    if (!src) return undefined;
    const video = videoRef.current;
    const native = isIos() && video.canPlayType('application/vnd.apple.mpegurl');
    const attach = native ? attachNativeSource : attachHlsSource;
    const onError = (kind) => {
      // signed links lapse after a day, and only fresh ones from the api load again
      const lapsed = currentRoute.share_exp * 1000 < Date.now();
      media.fail(lapsed ? 'expired' : kind);
      if (lapsed) dispatch(renewVideoLink(currentRoute.fullname));
    };
    const open = (startTime) => attach(video, src, { startTime, onAudio: media.setHasAudio, onError });
    return media.load(video, currentRoute.fullname, loop?.startTime, open);
  }, [src]);

  useEffect(() => {
    if (!loop?.duration) return undefined;
    const video = videoRef.current;
    const loopEnd = loop.startTime + loop.duration;
    const checkLoop = () => {
      if (!video.readyState || video.seeking) return;
      const routeTime = media.currentOffset();
      if (!video.ended && routeTime >= loop.startTime - 1 && routeTime < loopEnd) return;

      const { videoStart } = media;
      if (loopEnd <= videoStart || loop.startTime >= videoStart + (video.duration * 1000)) {
        media.fail('not-found');
        return;
      }
      media.seek(Math.max(loop.startTime, videoStart));
      if (media.intent.playing) media.play();
    };

    // frame callbacks end loops precisely, timeupdate also fires without frames and once playback ends
    let frame;
    const onFrame = () => {
      checkLoop();
      frame = video.requestVideoFrameCallback?.(onFrame);
    };
    onFrame();
    video.addEventListener('timeupdate', checkLoop);
    return () => {
      video.cancelVideoFrameCallback?.(frame);
      video.removeEventListener('timeupdate', checkLoop);
    };
  }, [loop]);

  return (
    <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593] bg-black">
      <VideoOverlay />
      <video ref={videoRef} className="w-full h-full" preload="auto" playsInline muted />
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);

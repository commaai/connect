import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import hlsWorkerPath from 'hls.js/dist/hls.worker.js?url';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attach, currentOffset } from '../../timeline';
import { togglePlay, videoFailed, videoLoading } from '../../timeline/playback';
import { parsePlaylist, toVideoTime } from '../../timeline/video';
import { isIos } from '../../utils/browser.js';

const NOT_UPLOADED = 'This drive\'s video hasn\'t been uploaded yet or was deleted.';
const OFFLINE = 'Unable to load video. Check your connection.';
const UNPLAYABLE = 'Unable to play this video.';

function playlistError(status, route) {
  if (status === 404) {
    return NOT_UPLOADED;
  }
  if (status === 403 && route.share_exp && Number(route.share_exp) * 1000 < Date.now()) {
    return 'This video link has expired. Reload the page to watch it.';
  }
  if (status === 401 || status === 403) {
    return 'You don\'t have access to this drive\'s video.';
  }
  return 'Unable to load video.';
}

const VideoOverlay = ({ status, error, onRetry }) => {
  let content;
  if (status === 'error') {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button className="mt-3 rounded-full bg-white/10 px-4 normal-case text-white" onClick={onRetry}>Retry</Button>
      </>
    );
  } else if (status === 'loading' || status === 'buffering') {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

const DriveVideo = ({ dispatch, currentRoute, playback, isMuted, onAudioStatusChange }) => {
  const videoRef = useRef(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const controller = new AbortController();
    const { signal } = controller;
    let hls = null;
    let detach = null;
    const fail = (message) => {
      video.pause();
      hls?.stopLoad();
      detach?.();
      dispatch(videoFailed(message));
    };

    async function load() {
      dispatch(videoLoading());
      onAudioStatusChange(false);
      // iOS plays HLS natively; everywhere else hls.js plays it through MSE,
      // falling back to native playback if hls.js does not load
      const hlsModule = isIos() ? null : import('hls.js').catch(() => null);
      const url = await api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      const response = await fetch(url, { signal });
      if (!response.ok) {
        fail(playlistError(response.status, currentRoute));
        return;
      }
      const segments = parsePlaylist(await response.text());
      if (!segments.length) {
        fail(NOT_UPLOADED);
        return;
      }

      const Hls = (await hlsModule)?.default;
      if (signal.aborted) return;
      if (Hls?.isSupported()) {
        hls = new Hls({
          maxBufferLength: 40,
          startPosition: toVideoTime(segments, currentRoute.videoStartOffset || 0, currentOffset()),
          workerPath: hlsWorkerPath,
        });
        hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange(Boolean(data.audio)));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            fail(data.type === Hls.ErrorTypes.NETWORK_ERROR ? OFFLINE : UNPLAYABLE);
          }
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        video.src = url;
        video.addEventListener('loadedmetadata', () => onAudioStatusChange(video.audioTracks?.length > 0), { signal });
      }
      video.addEventListener('error', () => fail(video.error.code === video.error.MEDIA_ERR_NETWORK ? OFFLINE : UNPLAYABLE), { signal });
      detach = attach(video, segments);
    }

    load().catch(() => {
      if (!signal.aborted) {
        fail(OFFLINE);
      }
    });
    return () => {
      controller.abort();
      detach?.();
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [currentRoute.fullname, attempt]);

  return (
    <div className="min-h-[200px] relative w-full max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay status={playback.status} error={playback.error} onRetry={() => setAttempt(attempt + 1)} />
      <video
        ref={videoRef}
        className="h-full w-full"
        muted={isMuted}
        playsInline
        onClick={() => dispatch(togglePlay(playback.status))}
      />
    </div>
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  playback: state.playback,
});

export default connect(stateToProps)(DriveVideo);

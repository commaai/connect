import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import * as player from '../../timeline/player';
import { pause, play, updateVideoState } from '../../timeline/playback';
import { parseQcameraPlaylist } from '../../timeline/videoTime';
import { isIos } from '../../utils/browser.js';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const UNKNOWN_ERROR = 'Unable to load video';

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <button
          type="button"
          className="mt-3 rounded-full border border-white/30 px-4 py-1 text-sm text-white hover:bg-white/10"
          onClick={onRetry}
        >
          Retry
        </button>
      </>
    );
  } else if (loading) {
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

// Load an HLS stream into the video element: natively on iOS, with hls.js
// (loaded on demand) everywhere else. Returns a cleanup function.
export function loadStream(video, src, { onError, onAudio }) {
  let hls = null;
  let cancelled = false;
  const onAddAudioTrack = () => onAudio(true);

  // which segments the video has, to keep route time across ones never uploaded
  player.setSegments(null);
  const segments = fetch(src)
    .then((resp) => (resp.ok ? resp.text() : null))
    .then((playlist) => playlist && parseQcameraPlaylist(playlist))
    .catch(() => null);

  const loadNative = () => {
    video.onerror = () => {
      onError(video.error?.code === video.error?.MEDIA_ERR_NETWORK ? NETWORK_ERROR : UNKNOWN_ERROR);
    };
    video.onloadedmetadata = () => {
      if (video.audioTracks) {
        onAudio(video.audioTracks.length > 0);
      }
    };
    // Safari adds the audio track of a native HLS stream after loadedmetadata
    video.audioTracks?.addEventListener?.('addtrack', onAddAudioTrack);
    video.src = src;
    segments.then((value) => {
      if (!cancelled) {
        player.setSegments(value);
      }
    });
  };

  if (isIos()) {
    loadNative();
  } else {
    Promise.all([import('hls.js/light'), segments]).then(([{ default: Hls }, value]) => {
      if (cancelled) {
        return;
      }
      player.setSegments(value);
      if (!Hls.isSupported()) {
        loadNative();
        return;
      }
      hls = new Hls({ maxBufferLength: 40, startPosition: player.getVideoTime() });
      let recoveredMediaError = false;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        // a segment that isn't uploaded won't appear by retrying
        if (data.response?.code === 404) {
          onError(NOT_UPLOADED);
        } else if (!data.fatal) {
          return;
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError) {
          recoveredMediaError = true;
          hls.recoverMediaError();
        } else {
          onError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? NETWORK_ERROR : UNKNOWN_ERROR);
        }
      });
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudio(Boolean(data.audio)));
      hls.loadSource(src);
      hls.attachMedia(video);
    }).catch((err) => {
      console.error('Failed to load hls.js', err);
      if (!cancelled) {
        onError(NETWORK_ERROR);
      }
    });
  }

  return () => {
    cancelled = true;
    player.releaseSource();
    video.onerror = null;
    video.onloadedmetadata = null;
    video.audioTracks?.removeEventListener?.('addtrack', onAddAudioTrack);
    if (hls) {
      hls.destroy();
    } else {
      video.removeAttribute('src');
      video.load();
    }
  };
}

const DriveVideo = ({ dispatch, currentRoute, isBufferingVideo, isPaused, isMuted, onAudioStatusChange }) => {
  const videoRef = useRef(null);
  const onAudioRef = useRef(onAudioStatusChange);
  onAudioRef.current = onAudioStatusChange;
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const src = currentRoute
    ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
    : null;

  // the video reports its state for everything that displays it
  const reportState = (video) => {
    const playing = player.isPlaying();
    dispatch(updateVideoState({
      isPaused: !playing,
      playSpeed: video.playbackRate,
      isBufferingVideo: playing && video.readyState < video.HAVE_FUTURE_DATA,
    }));
  };

  const onMediaEvent = (ev) => reportState(ev.currentTarget);
  const onPlaying = (ev) => {
    setError(null);
    reportState(ev.currentTarget);
  };

  useEffect(() => {
    const video = videoRef.current;
    reportState(video);
    return player.attachVideo(video, () => reportState(video));
  }, []);

  useEffect(() => {
    player.setVideoStartOffset(currentRoute?.videoStartOffset || 0);
  }, [currentRoute?.videoStartOffset]);

  useEffect(() => {
    setError(null);
    if (!src) {
      return undefined;
    }
    return loadStream(videoRef.current, src, {
      onError: setError,
      onAudio: (hasAudio) => onAudioRef.current?.(hasAudio),
    });
  }, [src, attempt]);

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={isBufferingVideo} error={error} onRetry={() => setAttempt((n) => n + 1)} />
      <video
        ref={videoRef}
        className="h-full w-full cursor-pointer"
        playsInline
        muted={isMuted}
        onClick={() => dispatch(isPaused ? play() : pause())}
        onEmptied={onMediaEvent}
        onWaiting={onMediaEvent}
        onCanPlay={onMediaEvent}
        onPlaying={onPlaying}
        onSeeked={onMediaEvent}
        onRateChange={onMediaEvent}
      />
    </div>
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  isBufferingVideo: state.isBufferingVideo,
  isPaused: state.isPaused,
});

export default connect(stateToProps)(DriveVideo);

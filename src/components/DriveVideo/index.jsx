/* eslint-disable camelcase */

import { video as Video } from '@commaai/api';
import { CircularProgress, Typography } from '@mui/material';
import debounce from 'debounce';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player/file';
import { useDispatch, useSelector } from 'react-redux';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { selectCurrentRoute } from '../../selectors/route';
import { currentOffset } from '../../timeline';
import { bufferVideo, seek } from '../../timeline/playback';
import { isFirefox, isIos } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">{content}</div>
    </div>
  );
};

const getVideoState = (videoPlayer) => {
  const currentTime = videoPlayer.getCurrentTime();
  const { buffered } = videoPlayer.getInternalPlayer();

  let bufferRemaining = -1;
  for (let i = 0; i < buffered.length; i++) {
    const end = buffered.end(i);
    if (currentTime >= buffered.start(i) && currentTime <= end) {
      bufferRemaining = end - currentTime;
      break;
    }
  }

  return {
    bufferRemaining,
    hasLoaded: bufferRemaining > 0,
  };
};

const DriveVideo = ({ playSpeed, onAudioStatusChange, isMuted }) => {
  const dispatch = useDispatch();
  const desiredPlaySpeed = useSelector((state) => state.desiredPlaySpeed);
  const isBufferingVideo = useSelector((state) => state.isBufferingVideo);
  const currentRoute = useSelector(selectCurrentRoute);

  const [src, setSrc] = useState(null);
  const [videoError, setVideoError] = useState(null);

  const videoPlayer = useRef(null);
  const firstSeek = useRef(true);
  const videoSyncIntv = useRef(null);
  const prevRouteFullname = useRef(null);

  const currentVideoTime = useCallback(
    (offset = currentOffset()) => {
      if (!currentRoute) {
        return 0;
      }

      if (currentRoute.videoStartOffset) {
        offset -= currentRoute.videoStartOffset;
      }

      offset /= 1000;

      return Math.max(0, offset);
    },
    [currentRoute],
  );

  const onVideoBuffering = useCallback(() => {
    const player = videoPlayer.current;
    if (!player || !currentRoute || !player.getDuration()) {
      dispatch(bufferVideo(true));
    }

    if (firstSeek.current) {
      firstSeek.current = false;
      player.seekTo(currentVideoTime(), 'seconds');
    }

    const { hasLoaded } = getVideoState(player);
    const { readyState } = player.getInternalPlayer();
    if (!hasLoaded || readyState < 2) {
      dispatch(bufferVideo(true));
    }
  }, [dispatch, currentRoute, currentVideoTime]);

  /**
   * @param {Error} e
   */
  const onHlsError = useCallback(
    (e) => {
      dispatch(bufferVideo(true));

      if (e.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
        // buffer but no error
        return;
      }

      if (e.type === 'networkError' && e.response?.code === 404) {
        setVideoError('This video segment has not uploaded yet or has been deleted.');
      } else {
        setVideoError('Unable to load video');
      }
    },
    [dispatch],
  );

  /**
   * @param {Error} e
   * @param {any} [data]
   */
  const onVideoError = useCallback(
    (e, data) => {
      if (!e) {
        console.warn('Unknown video error', { e, data });
        return;
      }

      if (e === 'hlsError') {
        onHlsError(data);
        return;
      }

      if (e.name === 'AbortError') {
        // ignore
        return;
      }

      if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
        // TODO: figure out why the src isn't set properly
        // Sometimes an error will be thrown because we try to play
        // src: "https://connect.comma.ai/.../undefined"
        console.warn('Video error with undefined src, ignoring', { e, data });
        return;
      }

      dispatch(bufferVideo(true));

      if (e.type === 'networkError') {
        console.error('Network error', { e, data });
        setVideoError('Unable to load video. Check network connection.');
        return;
      }

      const error = e.response?.code === 404 ? 'This video segment has not uploaded yet or has been deleted.' : e.response?.text || 'Unable to load video';
      setVideoError(error);
    },
    [dispatch, onHlsError],
  );

  const onVideoResume = useCallback(() => {
    if (videoError) setVideoError(null);
  }, [videoError]);

  const syncVideo = useCallback(() => {
    const player = videoPlayer.current;
    if (!player || !player.getInternalPlayer() || !player.getDuration()) {
      return;
    }

    let newPlaybackRate = desiredPlaySpeed;
    const desiredVideoTime = currentVideoTime();
    const curVideoTime = player.getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;

    if (Math.abs(timeDiff) <= Math.max(0.1, 0.5 * newPlaybackRate)) {
      // newPlaybackRate = 0 when paused, set minimum 0.1 to prevent seeking when paused
      if (!isIos()) {
        newPlaybackRate = Math.max(0, newPlaybackRate + Math.round(timeDiff * 10) / 10);
      }
    } else if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== player.getDuration()) {
      // logs start earlier than video, so skip to video ts 0
      dispatch(seek(currentOffset() - timeDiff * 1000));
    } else {
      player.seekTo(desiredVideoTime, 'seconds');
    }
    // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x causing audio to cut in and out with timeDiff rate shifts
    newPlaybackRate = Math.max(0, Math.min(isFirefox() && !isMuted ? 8 : 16, newPlaybackRate));

    const internalPlayer = player.getInternalPlayer();

    const { hasLoaded } = getVideoState(player);
    if (isBufferingVideo && internalPlayer.readyState >= 4) {
      dispatch(bufferVideo(false));
    } else if (isBufferingVideo || !hasLoaded || internalPlayer.readyState < 2) {
      if (!isBufferingVideo) {
        dispatch(bufferVideo(true));
      }
      newPlaybackRate = 0; // in some circumstances, iOS won't update readyState unless temporarily paused
    }

    if (player.getInternalPlayer('hls')) {
      if (!internalPlayer.paused && newPlaybackRate === 0) {
        internalPlayer.pause();
      } else if (internalPlayer.playbackRate !== newPlaybackRate && newPlaybackRate !== 0) {
        internalPlayer.playbackRate = newPlaybackRate;
      }
      if (internalPlayer.paused && newPlaybackRate !== 0) {
        const playRes = internalPlayer.play();
        if (playRes) {
          playRes.catch(() => console.debug('[DriveVideo] play interrupted by pause'));
        }
      }
    } else {
      // TODO: fix iOS bug where video doesn't stop buffering while paused
      internalPlayer.playbackRate = newPlaybackRate;
    }
  }, [dispatch, desiredPlaySpeed, isBufferingVideo, isMuted, currentVideoTime]);

  const syncVideoDebounced = useRef(debounce(syncVideo, 200, true));

  // Update video source when route changes
  useEffect(() => {
    if (!currentRoute) {
      if (src !== '') {
        setSrc('');
        setVideoError(null);
      }
      return;
    }

    if (src === '' || prevRouteFullname.current !== currentRoute.fullname) {
      const newSrc = Video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      setSrc(newSrc);
      setVideoError(null);
      prevRouteFullname.current = currentRoute.fullname;
      syncVideoDebounced.current();
    }
  }, [currentRoute, src]);

  // Setup video sync interval and initial playback rate
  useEffect(() => {
    if (videoPlayer.current) {
      videoPlayer.current.playbackRate = playSpeed || 1;
    }
    syncVideoDebounced.current();
    videoSyncIntv.current = setInterval(() => syncVideoDebounced.current(), 500);

    return () => {
      if (videoSyncIntv.current) {
        clearInterval(videoSyncIntv.current);
        videoSyncIntv.current = null;
      }
    };
  }, [playSpeed]);

  // Sync video on updates
  useEffect(() => {
    syncVideoDebounced.current();
  });

  const onPlayerReady = (player) => {
    if (isIos()) {
      // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
      const videoElement = player.getInternalPlayer();
      if (videoElement && videoElement.audioTracks && videoElement.audioTracks.length > 0) {
        if (onAudioStatusChange) {
          onAudioStatusChange(true);
        }
      }
    } else {
      // on other platforms, inspect audio tracks before hls.js changes things
      const hlsPlayer = player.getInternalPlayer('hls');
      if (hlsPlayer) {
        hlsPlayer.on('hlsBufferCodecs', (event, data) => {
          if (onAudioStatusChange) {
            onAudioStatusChange(!!data.audio);
          }
        });
      }
    }
  };

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={isBufferingVideo} error={videoError} />
      <ReactPlayer
        ref={videoPlayer}
        url={src}
        playsinline
        muted={isMuted}
        width="100%"
        height="100%"
        playing={Boolean(currentRoute && desiredPlaySpeed)}
        onReady={onPlayerReady}
        config={{
          hlsVersion: '1.4.8',
          hlsOptions: {
            maxBufferLength: 40,
          },
        }}
        playbackRate={desiredPlaySpeed}
        onBuffer={onVideoBuffering}
        onBufferEnd={onVideoResume}
        onPlay={onVideoResume}
        onError={onVideoError}
      />
    </div>
  );
};

export default DriveVideo;

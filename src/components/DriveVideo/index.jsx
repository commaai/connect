import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import Hls from 'hls.js';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachVideo, detachVideo, markUnplayable } from '../../timeline/playback';

const NATIVE_HLS_TYPE = 'application/vnd.apple.mpegurl';

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
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

function DriveVideo({ currentRoute, playback, isMuted, onAudioStatusChange }) {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(null);

  const failWith = (message) => {
    setVideoError(message);
    markUnplayable();
  };

  // the playback controller owns the element once it exists
  useEffect(() => {
    attachVideo(videoRef.current);
    return () => detachVideo();
  }, []);

  // React does not reliably update the muted property after mount
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    setVideoError(null);

    if (!currentRoute) {
      video.removeAttribute('src');
      return undefined;
    }

    let hls;
    let recoveredMediaError = false;
    let retriedNetworkError = false;
    const handleHlsError = (_, data) => {
      if (!data.fatal) {
        return;
      }
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        if (data.response?.code === 404) {
          failWith('This video segment has not uploaded yet or has been deleted.');
        } else if (!retriedNetworkError) {
          // transient network failures recover by retrying the load once
          retriedNetworkError = true;
          hls.startLoad();
        } else {
          failWith('Unable to load video');
        }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        if (recoveredMediaError) {
          failWith('Unable to load video');
        } else {
          recoveredMediaError = true;
          hls.recoverMediaError();
        }
      } else {
        failWith('Unable to load video');
      }
    };

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 40 });
      hls.on(Hls.Events.ERROR, handleHlsError);
      hls.on(Hls.Events.BUFFER_CODECS, (_, data) => onAudioStatusChange?.(Boolean(data.audio)));
      hls.loadSource(src);
      hls.attachMedia(video);
    } else if (video.canPlayType(NATIVE_HLS_TYPE)) {
      // iOS plays HLS natively; audio tracks appear once the manifest loads
      video.src = src;
      const onLoadedMetadata = () => onAudioStatusChange?.(Boolean(video.audioTracks?.length));
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      const onElementError = () => {
        if (video.error?.code === window.MediaError?.MEDIA_ERR_NETWORK) {
          failWith('Unable to load video. Check network connection.');
        } else {
          failWith('Unable to load video');
        }
      };
      video.addEventListener('error', onElementError);
      return () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onElementError);
      };
    } else {
      failWith('Unable to load video');
    }

    return () => {
      hls?.destroy();
    };
  }, [currentRoute?.fullname]);

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={playback.buffering && !videoError} error={videoError} />
      <video
        ref={videoRef}
        playsInline
        muted={isMuted}
        className="h-full w-full"
      />
    </div>
  );
}

const stateToProps = (state) => ({
  playback: state.playback,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);

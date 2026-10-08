import React, { useLayoutEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress } from '@material-ui/core';

import { api } from '../../api/backend';
import { attachPlayer } from '../../timeline/playback';
import VideoSession from './VideoSession';

export function DriveVideo({ currentRoute, isBufferingVideo, dispatch, hidden }) {
  const video = useRef(null);
  const audio = useRef({ muted: true, volume: 1 });
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);

  useLayoutEffect(() => {
    const element = video.current;
    element.muted = audio.current.muted;
    element.volume = audio.current.volume;
    const session = new VideoSession(element, dispatch, setError);
    const detach = dispatch(attachPlayer((action, state) => session.update(action, state)));
    session.load(src);
    return () => {
      audio.current = { muted: element.muted, volume: element.volume };
      detach();
      session.destroy();
    };
  }, [src, retry, dispatch]);

  return (
    <div hidden={hidden} className="relative mx-auto aspect-[1.593] max-w-[964px] overflow-hidden rounded-xl bg-black shadow-lg">
      <video
        key={`${src}:${retry}`}
        ref={video}
        aria-label="Drive video"
        className="h-full w-full"
        controls
        playsInline
        muted
        preload="auto"
      />
      {isBufferingVideo && !error && (
        <div role="status" aria-label="Loading video" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <CircularProgress size={36} style={{ color: 'white' }} />
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 top-0 bottom-16 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center">
          <p role="alert" className="text-sm text-white/90">{error}</p>
          <button className="rounded-full bg-white/15 px-5 py-2 text-sm text-white hover:bg-white/25 focus-visible:outline" onClick={() => setRetry((value) => value + 1)}>
            Retry video
          </button>
        </div>
      )}
    </div>
  );
}

export default connect((state) => ({
  currentRoute: state.currentRoute,
  isBufferingVideo: state.isBufferingVideo,
}))(DriveVideo);

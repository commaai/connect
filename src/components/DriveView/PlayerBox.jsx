import React, { useCallback, useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';

import { useIsLandscape } from '../../hooks/window';

const IDLE_MS = 2500;

const isTouch = () => Boolean(window.matchMedia?.('(pointer: coarse)').matches);

// A phone on its side: too short to show the header and the player together.
const SHORT_LANDSCAPE = '(orientation: landscape) and (max-height: 500px)';

// The player frame: layers (video, map) fill it, controls sit on top and fade out
// while playing once the pointer has been idle. Sized to always fit the window,
// in svh units so Safari's collapsing toolbars don't resize it while it is used.
function PlayerBox({ paused, children, controls }) {
  const [awake, setAwake] = useState(true);
  const timer = useRef(null);
  const frame = useRef(null);
  const landscape = useIsLandscape();
  const wake = useCallback(() => {
    setAwake(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAwake(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(timer.current);
  }, [wake]);

  // turned sideways: fill the screen and bring the player (and its controls) into view
  useEffect(() => {
    if (landscape && window.matchMedia(SHORT_LANDSCAPE).matches) {
      frame.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [landscape]);

  const visible = awake || paused;
  const visibleOnPress = useRef(true);

  return (
    <div
      ref={frame}
      className="relative aspect-[1.593] max-h-[calc(100svh-13rem)] min-h-48 w-full min-w-0 overflow-hidden rounded-xl bg-black [@media(orientation:landscape)_and_(max-height:500px)]:aspect-auto scroll-mt-[4.5rem] [@media(orientation:landscape)_and_(max-height:500px)]:h-[calc(100svh-5rem)] [@media(orientation:landscape)_and_(max-height:500px)]:max-h-none"
      onPointerMove={wake}
      onPointerDownCapture={() => { visibleOnPress.current = visible; }}
      onPointerDown={wake}
      onFocus={wake}
      // on touch, the tap that reveals hidden controls must not also play/pause
      onClickCapture={(event) => { if (isTouch() && !visibleOnPress.current) event.stopPropagation(); }}
    >
      {children}
      <div className={`absolute inset-x-0 bottom-0 z-30 transition-opacity ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${visible ? 'opacity-100 duration-[120ms]' : 'pointer-events-none opacity-0 duration-[250ms]'}`}>
        {controls}
      </div>
    </div>
  );
}

export default connect((state) => ({ paused: state.desiredPlaySpeed === 0 }))(PlayerBox);

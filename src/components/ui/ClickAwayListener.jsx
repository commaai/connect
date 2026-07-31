import React, { useEffect, useRef } from 'react';

const ClickAwayListener = ({ children, onClickAway }) => {
  const rootRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) onClickAway?.(event);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [onClickAway]);

  return <span ref={rootRef} className="inline-flex">{children}</span>;
};

export default ClickAwayListener;

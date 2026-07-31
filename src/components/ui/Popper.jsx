import React, { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const Popper = forwardRef(({
  anchorEl, children, className = '', open = false, placement = 'bottom', style, ...props
}, ref) => {
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = anchorEl?.getBoundingClientRect?.();
      if (!rect) return;
      const vertical = placement.startsWith('top') ? rect.top : rect.bottom;
      setPosition({ left: rect.left + (rect.width / 2), top: vertical });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorEl, open, placement]);

  if (!open) return null;

  const translateY = placement.startsWith('top') ? '-100%' : '0';
  return createPortal(
    <div
      ref={ref}
      className={`fixed z-[1500] -translate-x-1/2 ${className}`}
      style={{ left: position.left, top: position.top, transform: `translate(-50%, ${translateY})`, ...style }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
});

Popper.displayName = 'Popper';

export default Popper;

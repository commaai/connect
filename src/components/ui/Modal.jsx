import React, { forwardRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const Modal = forwardRef(({
  children, className = '', onClose, open = false, ...props
}, ref) => {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.(event);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={ref}
      className={`fixed inset-0 z-[1300] bg-black/50 ${className}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.(event);
      }}
      role="presentation"
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
});

Modal.displayName = 'Modal';

export default Modal;

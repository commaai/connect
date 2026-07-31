import React, { forwardRef, useEffect } from 'react';

const Drawer = forwardRef(({
  children, className = '', onClose, open = false, PaperProps = {}, variant = 'temporary', ...props
}, ref) => {
  const permanent = variant === 'permanent';

  useEffect(() => {
    if (!open || permanent) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.(event);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open, permanent]);

  if (!open) return null;

  return (
    <div ref={ref} className={`fixed inset-0 z-[1200] ${permanent ? 'pointer-events-none' : ''} ${className}`} {...props}>
      {!permanent && (
        <button
          aria-label="Close navigation"
          className="absolute inset-0 cursor-default bg-black/50"
          onClick={onClose}
          type="button"
        />
      )}
      <aside
        className="pointer-events-auto absolute inset-y-0 left-0 overflow-y-auto bg-[#30373b] shadow-xl"
        {...PaperProps}
      >
        {children}
      </aside>
    </div>
  );
});

Drawer.displayName = 'Drawer';

export default Drawer;

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createPortal } from 'react-dom';

const Menu = forwardRef(({
  anchorEl,
  anchorOrigin = { vertical: 'bottom', horizontal: 'left' },
  children,
  className = '',
  onClose,
  open = false,
  transformOrigin = { vertical: 'top', horizontal: 'left' },
  ...props
}, forwardedRef) => {
  const menuRef = useRef(null);
  useImperativeHandle(forwardedRef, () => menuRef.current);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'mousedown' && !menuRef.current?.contains(event.target))) {
        onClose?.(event);
      }
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [onClose, open]);

  if (!open) return null;

  const rect = anchorEl?.getBoundingClientRect?.();
  const top = rect
    ? (anchorOrigin.vertical === 'top' ? rect.top : rect.bottom)
    : 0;
  const left = rect
    ? (anchorOrigin.horizontal === 'right' ? rect.right : rect.left)
    : 0;
  const translateX = typeof transformOrigin.horizontal === 'number'
    ? `-${transformOrigin.horizontal}px`
    : (transformOrigin.horizontal === 'right' ? '-100%' : '0');
  const translateY = transformOrigin.vertical === 'bottom' ? '-100%' : '0';

  return createPortal(
    <div
      ref={menuRef}
      className={`fixed z-[1400] min-w-[16px] max-w-[calc(100vw-32px)] overflow-y-auto rounded bg-[#30373b] py-2 text-white shadow-xl ${className}`}
      role="menu"
      style={{ left, top, transform: `translate(${translateX}, ${translateY})` }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
});

Menu.displayName = 'Menu';

export default Menu;

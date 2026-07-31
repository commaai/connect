import React, { forwardRef } from 'react';

const MenuItem = forwardRef(({
  children, className = '', disabled = false, onClick, onKeyDown, ...props
}, ref) => (
  <div
    ref={ref}
    aria-disabled={disabled || undefined}
    className={`flex min-h-12 w-auto items-center px-4 py-2 text-base outline-none transition-colors ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-white/10 focus:bg-white/10'} ${className}`}
    onClick={disabled ? undefined : onClick}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (!disabled && !event.defaultPrevented && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onClick?.(event);
      }
    }}
    role="menuitem"
    tabIndex={disabled ? -1 : 0}
    {...props}
  >
    {children}
  </div>
));

MenuItem.displayName = 'MenuItem';

export default MenuItem;

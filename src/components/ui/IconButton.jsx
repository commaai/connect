import React, { forwardRef } from 'react';

const IconButton = forwardRef(({
  children, className = '', disabled = false, variant, ...props
}, ref) => (
  <button
    ref={ref}
    className={`inline-flex items-center justify-center rounded-full p-3 text-inherit transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:pointer-events-none disabled:opacity-50 ${variant === 'fab' ? 'shadow-md' : ''} ${className}`}
    disabled={disabled}
    type="button"
    {...props}
  >
    {children}
  </button>
));

IconButton.displayName = 'IconButton';

export default IconButton;

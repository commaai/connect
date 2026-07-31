import React, { forwardRef } from 'react';

const toSize = (size) => (typeof size === 'number' ? `${size}px` : size);

const CircularProgress = forwardRef(({
  className = '', size = 40, style, thickness = 3.6, ...props
}, ref) => (
  <span
    ref={ref}
    role="progressbar"
    className={`inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent ${className}`}
    style={{ width: toSize(size), height: toSize(size), borderWidth: thickness, ...style }}
    {...props}
  />
));

CircularProgress.displayName = 'CircularProgress';

export default CircularProgress;

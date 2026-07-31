import React, { forwardRef } from 'react';

const Paper = forwardRef(({
  children, className = '', elevation = 2, ...props
}, ref) => (
  <div
    ref={ref}
    className={`rounded bg-[#30373b] text-white ${elevation ? 'shadow-md' : ''} ${className}`}
    {...props}
  >
    {children}
  </div>
));

Paper.displayName = 'Paper';

export default Paper;

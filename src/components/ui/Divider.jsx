import React, { forwardRef } from 'react';

const Divider = forwardRef(({ className = '', ...props }, ref) => (
  <hr ref={ref} className={`m-0 w-full border-0 border-t border-white/10 ${className}`} {...props} />
));

Divider.displayName = 'Divider';

export default Divider;

import React, { forwardRef } from 'react';

const positions = {
  absolute: 'absolute',
  fixed: 'fixed',
  relative: 'relative',
  static: 'static',
  sticky: 'sticky top-0',
};

const AppBar = forwardRef(({
  children, className = '', elevation = 0, position = 'fixed', ...props
}, ref) => (
  <header
    ref={ref}
    className={`${positions[position] || positions.fixed} z-[1100] w-full bg-[#30373b] text-white ${elevation ? 'shadow-md' : ''} ${className}`}
    {...props}
  >
    {children}
  </header>
));

AppBar.displayName = 'AppBar';

export default AppBar;

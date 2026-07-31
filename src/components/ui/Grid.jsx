import React, { forwardRef } from 'react';

const Grid = forwardRef(({
  align, alignItems, children, className = '', container = false, item = false, style, xs, ...props
}, ref) => {
  const width = xs ? `${(Number(xs) / 12) * 100}%` : undefined;
  return (
    <div
      ref={ref}
      className={`${container ? 'flex flex-wrap' : ''} ${item ? 'min-w-0' : ''} ${className}`}
      style={{ alignItems, textAlign: align, width, ...style }}
      {...props}
    >
      {children}
    </div>
  );
});

Grid.displayName = 'Grid';

export default Grid;

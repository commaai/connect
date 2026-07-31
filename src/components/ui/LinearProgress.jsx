import React, { forwardRef } from 'react';

const LinearProgress = forwardRef(({
  className = '', value = 0, variant = 'indeterminate', ...props
}, ref) => {
  const progress = Math.max(0, Math.min(100, Number(value)));
  return (
    <div
      ref={ref}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={variant === 'determinate' ? progress : undefined}
      className={`h-1 w-full overflow-hidden bg-white/20 ${className}`}
      role="progressbar"
      {...props}
    >
      <div
        className={`h-full bg-[#57a9e3] transition-transform ${variant === 'indeterminate' ? 'animate-pulse' : ''}`}
        style={{ transform: `translateX(${progress - 100}%)` }}
      />
    </div>
  );
});

LinearProgress.displayName = 'LinearProgress';

export default LinearProgress;

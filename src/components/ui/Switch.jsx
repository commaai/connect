import React, { forwardRef } from 'react';

const Switch = forwardRef(({
  checked = false, className = '', classes = {}, color, disabled = false, ...props
}, ref) => (
  <span className={`relative inline-flex h-6 w-10 shrink-0 ${className}`}>
    <input
      ref={ref}
      checked={checked}
      className="peer sr-only"
      disabled={disabled}
      type="checkbox"
      {...props}
    />
    <span className="absolute inset-0 rounded-full bg-white/30 transition-colors peer-checked:bg-[#1da756] peer-disabled:opacity-50" />
    <span className={`pointer-events-none absolute left-1 top-1 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4 ${classes.icon || ''}`} />
  </span>
));

Switch.displayName = 'Switch';

export default Switch;

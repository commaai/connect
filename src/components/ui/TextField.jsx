import React, { forwardRef } from 'react';

const TextField = forwardRef(({
  className = '', helperText, id, label, variant, ...props
}, ref) => (
  <div className={`flex w-full flex-col gap-1 ${className}`}>
    {label && <label className="ml-1 text-xs text-white/70" htmlFor={id}>{label}</label>}
    <input
      ref={ref}
      className={`w-full rounded-2xl border border-[#272c2f] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-[#57a9e3] ${variant === 'outlined' ? 'bg-transparent' : 'bg-white/5'}`}
      id={id}
      {...props}
    />
    {helperText && <span className="ml-2 text-xs text-white/60">{helperText}</span>}
  </div>
));

TextField.displayName = 'TextField';

export default TextField;

import React, { forwardRef } from 'react';

const variantClasses = {
  contained: 'bg-[#57a9e3] text-white hover:bg-[#79bae8]',
  outlined: 'border border-white/30 text-white hover:bg-white/10',
  text: 'text-white hover:bg-white/10',
};

const colorClasses = {
  primary: 'focus-visible:outline-[#57a9e3]',
  secondary: 'focus-visible:outline-[#1da756]',
};

const Button = forwardRef(({
  children,
  className = '',
  classes = {},
  color,
  disabled = false,
  href,
  variant = 'text',
  ...props
}, ref) => {
  const Component = href ? 'a' : 'button';
  const disabledClasses = disabled ? 'pointer-events-none cursor-default opacity-50' : 'cursor-pointer';
  const { type = 'button', ...rest } = props;
  const componentProps = href ? { href, 'aria-disabled': disabled || undefined } : { disabled, type };

  return (
    <Component
      ref={ref}
      className={`inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium normal-case transition-colors focus-visible:outline focus-visible:outline-2 ${variantClasses[variant] || variantClasses.text} ${colorClasses[color] || ''} ${disabledClasses} ${classes.root || ''} ${className}`}
      {...componentProps}
      {...rest}
    >
      {children}
    </Component>
  );
});

Button.displayName = 'Button';

export default Button;

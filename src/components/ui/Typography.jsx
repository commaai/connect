import React, { forwardRef } from 'react';

const variants = {
  body1: ['p', 'text-base'],
  body2: ['p', 'text-sm'],
  caption: ['span', 'text-xs text-white/70'],
  display1: ['h1', 'text-[2.125rem]'],
  headline: ['h1', 'text-2xl'],
  subheading: ['h3', 'text-base font-medium'],
  title: ['h2', 'text-xl font-medium'],
};

const Typography = forwardRef(({
  align, children, className = '', color, component, style, variant = 'body1', ...props
}, ref) => {
  const [defaultComponent, variantClass] = variants[variant] || variants.body1;
  const Component = component || defaultComponent;
  return (
    <Component
      ref={ref}
      className={`${variantClass} m-0 ${color === 'inherit' ? 'text-inherit' : ''} ${className}`}
      style={{ textAlign: align, ...style }}
      {...props}
    >
      {children}
    </Component>
  );
});

Typography.displayName = 'Typography';

export default Typography;

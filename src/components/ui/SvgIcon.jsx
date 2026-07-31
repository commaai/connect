import React, { forwardRef } from 'react';

const fontSizes = {
  inherit: '1em',
  large: 35,
  small: 20,
};

const SvgIcon = forwardRef(({
  children,
  className = '',
  color,
  fontSize = 'default',
  htmlColor,
  style,
  titleAccess,
  viewBox = '0 0 24 24',
  ...props
}, ref) => {
  const size = fontSizes[fontSize] || 24;
  return (
    <svg
      ref={ref}
      aria-hidden={titleAccess ? undefined : true}
      aria-label={titleAccess}
      className={`inline-block shrink-0 fill-current ${className}`}
      focusable="false"
      role={titleAccess ? 'img' : undefined}
      style={{ color: htmlColor || color, fontSize: size, height: '1em', width: '1em', ...style }}
      viewBox={viewBox}
      {...props}
    >
      {titleAccess && <title>{titleAccess}</title>}
      {children}
    </svg>
  );
});

SvgIcon.displayName = 'SvgIcon';

export default SvgIcon;

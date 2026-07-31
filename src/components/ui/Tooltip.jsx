import React, { forwardRef, useState } from 'react';

const placements = {
  bottom: 'left-1/2 top-full mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
};

const Tooltip = forwardRef(({
  children,
  className = '',
  classes = {},
  onClose,
  onOpen,
  open,
  placement = 'bottom',
  PopperProps,
  title,
  ...props
}, ref) => {
  const [hovered, setHovered] = useState(false);
  const visible = open ?? hovered;
  const show = (event) => {
    if (open === undefined) setHovered(true);
    onOpen?.(event);
  };
  const hide = (event) => {
    if (open === undefined) setHovered(false);
    onClose?.(event);
  };

  return (
    <span
      ref={ref}
      className={`relative inline-flex ${classes.popper || ''} ${className}`}
      onBlur={hide}
      onFocus={show}
      onMouseEnter={show}
      onMouseLeave={hide}
      {...props}
    >
      {children}
      {visible && Boolean(title) && (
        <span
          className={`pointer-events-none absolute z-[1600] w-max max-w-xs rounded bg-[#616161] px-2 py-1 text-xs text-white shadow-md ${placements[placement] || placements.bottom} ${classes.tooltip || ''}`}
          role="tooltip"
        >
          {title}
        </span>
      )}
    </span>
  );
});

Tooltip.displayName = 'Tooltip';

export default Tooltip;

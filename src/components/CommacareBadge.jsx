import React from 'react';

import CommacareIcon from '../icons/commacare.png';

export const COMMACARE_URL = 'https://comma.ai/connect#what-is-commacare';

const CommacareBadge = ({ size = 22, style, variant = 'icon', onClick }) => {
  if (variant === 'pill') {
    return (
      <a
        className="inline-flex cursor-pointer items-center rounded-xl border border-care py-1.5 pl-3 pr-3.5 font-semibold leading-none tracking-[0.04em] text-care no-underline transition-colors hover:bg-success/10"
        style={style}
        href={COMMACARE_URL}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={CommacareIcon} alt="" className="mr-3 w-6" />
        commacare
      </a>
    );
  }

  return (
    <span onClick={onClick}
      style={{ display: 'inline-flex', flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}>
      <img src={CommacareIcon} alt="commacare" style={{ width: size, ...style }} />
    </span>
  );
};

export default CommacareBadge;

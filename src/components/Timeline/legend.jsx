import React from 'react';

import theme from '../../theme';

export const legendItems = [
  { label: 'Driving', color: 'drivingBlue' },
  { label: 'openpilot engaged', color: 'engagedGreen' },
  { label: 'Driver override', color: 'engagedGrey' },
  { label: 'Alert', color: 'alertOrange' },
  { label: 'Critical alert', color: 'alertRed' },
  { label: 'Bookmark', color: 'userBookmark' },
];

export default function TimelineLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 m-0 px-3 pt-2 md:px-8 list-none">
      { legendItems.map(({ label, color }) => (
        <li key={color} className="flex items-center gap-[6px] text-[11px] tracking-[0.5px] uppercase text-white/50">
          <span
            aria-hidden="true"
            className="inline-block w-[10px] h-[10px] rounded-[2px]"
            style={{ background: theme.palette.states[color] }}
          />
          { label }
        </li>
      )) }
    </ul>
  );
}

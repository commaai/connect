import React from 'react';

const SPOKES = Array.from({ length: 12 }, (_, i) => i);

// iOS-style activity indicator: 12 spokes fading behind the lead one, turned one spoke per step. Not MUI's
// CircularProgress (it animates SVG strokes and repaints every frame), and not a smooth rotation (WebKit does not
// always GPU-accelerate it): either dropped an iPhone from 60 to 40 fps while the video buffered. 12 repaints a
// second are cheap even without acceleration, and the fading trail makes the steps read as motion, not stutter.
const StepSpinner = ({ label = 'Loading', className = 'h-12 w-12' }) => (
  <div
    role="progressbar"
    aria-label={label}
    className={`${className} relative animate-[spin_1s_steps(12,end)_infinite] motion-reduce:animate-none`}
  >
    {SPOKES.map((i) => (
      <span key={i} className="absolute inset-0" style={{ transform: `rotate(${-i * 30}deg)`, opacity: 1 - i * 0.07 }}>
        <span className="mx-auto block h-[28%] w-[10%] rounded-full bg-white" />
      </span>
    ))}
  </div>
);

export default StepSpinner;

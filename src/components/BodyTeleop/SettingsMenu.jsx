import React, {
  useState, useRef, useEffect, useLayoutEffect, useCallback,
} from 'react';
import Settings from '@material-ui/icons/Settings';
import ChevronRight from '@material-ui/icons/ChevronRight';
import Check from '@material-ui/icons/Check';
import { ArrowBackBold } from '../../icons';

const QUALITY_OPTIONS = [
  { key: 'auto', label: 'auto' },
  { key: 'high', label: 'high', bitrate: '5 mbps' },
  { key: 'med', label: 'med', bitrate: '1.5 mbps' },
  { key: 'low', label: 'low', bitrate: '500 kbps' },
];

const rowClass = 'flex items-center h-9 px-3.5 gap-3 cursor-pointer select-none text-[13px] text-white/85 hover:bg-white/10 transition-colors whitespace-nowrap';
const pageClass = 'absolute top-0 left-0 w-max min-w-[200px] py-1.5 transition-all duration-200 ease-out';

const SettingsMenu = ({ onQualityChange, options = QUALITY_OPTIONS }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('main'); // 'main' | 'quality'
  const [quality, setQuality] = useState(options[0]?.key);

  const wrapperRef = useRef(null);
  const mainRef = useRef(null);
  const qualityRef = useRef(null);
  const [dims, setDims] = useState(null);

  const selected = options.find((o) => o.key === quality) || options[0];

  // Size the panel to whichever page is active so it morphs between them.
  useLayoutEffect(() => {
    const el = view === 'main' ? mainRef.current : qualityRef.current;
    if (el) setDims({ width: el.offsetWidth, height: el.offsetHeight });
  }, [view, open, quality, options]);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setView('main');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggleOpen = useCallback((e) => {
    e.stopPropagation();
    setOpen((prev) => {
      if (prev) setView('main');
      return !prev;
    });
  }, []);

  const selectQuality = useCallback((key) => {
    setQuality(key);
    onQualityChange?.(key);
    setView('main');
  }, [onQualityChange]);

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className="flex items-center justify-center h-9 w-9 rounded-[18px] cursor-pointer select-none bg-glass text-white/60 hover:text-white/90 hover:!bg-black/60"
        onClick={toggleOpen}
        title="Settings"
      >
        <Settings
          style={{
            fontSize: 20,
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(30deg)' : 'none',
          }}
        />
      </div>

      <div
        className={`absolute right-0 top-full mt-2 z-50 origin-top-right overflow-hidden rounded-[12px] bg-glass-dark transition-all duration-200 ease-out ${
          open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={dims ? { width: dims.width, height: dims.height } : undefined}
      >
        {/* main page */}
        <div
          ref={mainRef}
          className={pageClass}
          style={{
            transform: view === 'main' ? 'translateX(0)' : 'translateX(-100%)',
            opacity: view === 'main' ? 1 : 0,
            pointerEvents: view === 'main' ? 'auto' : 'none',
          }}
        >
          <div className={rowClass} onClick={() => setView('quality')}>
            <span className="flex-1">Quality</span>
            <span className="flex items-center gap-1 text-white/45">
              {selected?.label}
              <ChevronRight style={{ fontSize: 18 }} />
            </span>
          </div>
        </div>

        {/* quality page */}
        <div
          ref={qualityRef}
          className={pageClass}
          style={{
            transform: view === 'quality' ? 'translateX(0)' : 'translateX(100%)',
            opacity: view === 'quality' ? 1 : 0,
            pointerEvents: view === 'quality' ? 'auto' : 'none',
          }}
        >
          <div className={`${rowClass} font-medium text-white/90`} onClick={() => setView('main')}>
            <ArrowBackBold className="w-4 h-4 -ml-1 text-white/70" />
            <span>Quality (Bitrate)</span>
          </div>
          <div className="h-px bg-white/10 mx-2 my-1" />
          {options.map((opt) => (
            <div key={opt.key} className={rowClass} onClick={() => selectQuality(opt.key)}>
              <span className="flex w-4 items-center justify-center">
                {opt.key === quality && <Check style={{ fontSize: 16 }} className="text-white" />}
              </span>
              <span className="flex-1">{opt.label}</span>
              {opt.bitrate && <span className="text-[10px] text-white/40">{opt.bitrate}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsMenu;

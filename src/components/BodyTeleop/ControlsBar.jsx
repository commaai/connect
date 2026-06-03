import React, { useCallback } from 'react';
import PhotoCamera from '@material-ui/icons/PhotoCamera';

const CAMERAS = [
  { key: 'wideRoad', label: 'road', num: '1' },
  { key: 'driver', label: 'driver', num: '2' },
];

const btnBase = `h-11 px-3.5 rounded-xl text-[14px] font-bold tracking-[0.2px] uppercase flex items-center justify-center min-w-[44px] cursor-pointer select-none hover:text-white hover:bg-white/20 bg-glass`;
const btnInactive = `${btnBase} bg-white/10 text-white/60`;
const btnActive = `${btnBase} bg-white/30 text-white`;

const controlsGroupBase = 'absolute bottom-4 left-4 z-10 flex flex-row items-stretch gap-3.5 rounded-[20px] p-3 bg-glass-dark';
const controlsGroupPortrait = 'relative bottom-auto left-auto transform-none self-stretch rounded-none shrink-0 justify-between gap-2';

const ControlsBar = ({
  activeCamera, onSwitchCamera,
  gamepadConnected, videoRef, isLandscape, className = '',
}) => {
  const handleScreenshot = useCallback(async () => {
    const video = videoRef?.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const filename = `screenshot_${activeCamera}_${Date.now()}.png`;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [videoRef, activeCamera]);

  return (
    <div className={`${controlsGroupBase} ${!isLandscape ? controlsGroupPortrait : ''} ${className}`}>
      {!gamepadConnected && (
        <div className="flex flex-col items-center justify-between gap-[7px]">
          <div className="flex gap-[4px] items-center">
            {CAMERAS.map((cam) => (
              <div
                key={cam.key}
                className={activeCamera === cam.key ? btnActive : btnInactive}
                onClick={() => onSwitchCamera(cam.key)}
              >
                {cam.label}
              </div>
            ))}
          </div>
          <span className="text-[13px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Camera</span>
        </div>
      )}
      <div className="flex flex-col items-center justify-between gap-[7px]">
        <div
          className={btnInactive}
          onClick={handleScreenshot}
          title="Save screenshot"
        >
          <PhotoCamera className="text-[25px]" />
        </div>
        <span className="text-[13px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Screenshot</span>
      </div>
    </div>
  );
};

export default ControlsBar;

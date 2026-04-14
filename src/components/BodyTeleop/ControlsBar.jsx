import React, { useCallback } from 'react';
import PhotoCamera from '@material-ui/icons/PhotoCamera';

const QUICK_SOUNDS = [
  { key: 'engage', label: 'Engage', icon: '😊' },
  { key: 'disengage', label: 'Disengage', icon: '😢' },
  { key: 'prompt', label: 'Prompt', icon: '⚠️' },
  { key: 'warningImmediate', label: 'Warning', icon: '❗' },
];

const CAMERAS = [
  { key: 'wideRoad', label: 'road', num: '1' },
  { key: 'driver', label: 'driver', num: '2' },
];

const btnBase = `h-8 px-2.5 rounded-lg text-[10px] font-bold tracking-[0.2px] uppercase flex items-center justify-center min-w-[32px] cursor-pointer select-none hover:text-white hover:bg-white/20 bg-glass`;
const btnInactive = `${btnBase} bg-white/10 text-white/60`;
const btnActive = `${btnBase} bg-white/30 text-white`;

const controlsGroupBase = 'absolute bottom-4 left-4 z-10 flex flex-row items-stretch gap-2.5 rounded-[14px] p-2 bg-glass-dark';
const controlsGroupPortrait = 'relative bottom-auto left-auto transform-none self-stretch rounded-none shrink-0 justify-between gap-1.5';

const ControlsBar = ({
  connection, activeCamera, onSwitchCamera,
  gamepadConnected, videoRef, isLandscape,
}) => {
  const handlePlaySound = useCallback((sound) => {
    connection?.playSound(sound).catch((err) => {
      console.error('Failed to play body sound:', err);
    });
  }, [connection]);

  const handleScreenshot = useCallback(() => {
    const video = videoRef?.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const link = document.createElement('a');
    link.download = `screenshot_${activeCamera}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [videoRef, activeCamera]);

  return (
    <div className={`${controlsGroupBase} ${!isLandscape ? controlsGroupPortrait : ''}`}>
      {!gamepadConnected && (
        <div className="flex flex-col items-center justify-between gap-[5px]">
          <div className="flex gap-[3px] items-center">
            {CAMERAS.map((cam) => (
              <div
                key={cam.key}
                className={activeCamera === cam.key ? btnActive : btnInactive}
                onClick={() => onSwitchCamera(cam.key)}
              >
                {isLandscape ? cam.label : cam.num}
              </div>
            ))}
          </div>
          <span className="text-[9px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Camera</span>
        </div>
      )}
      <div className="flex flex-col items-center justify-between gap-[5px]">
        <div className="flex gap-[3px] items-center">
          {QUICK_SOUNDS.map((sound) => (
            <div
              key={sound.key}
              className={btnInactive}
              onClick={() => handlePlaySound(sound.key)}
            >
              {isLandscape ? sound.label : sound.icon}
            </div>
          ))}
        </div>
        <span className="text-[9px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Sounds</span>
      </div>
      <div className="flex flex-col items-center justify-between gap-[5px]">
        <div className="flex gap-[3px] items-center">
          <div
            className={btnInactive}
            onClick={handleScreenshot}
            title="Save screenshot"
          >
            <PhotoCamera className="text-[18px]" />
          </div>
        </div>
        <span className="text-[9px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Screenshot</span>
      </div>
    </div>
  );
};

export default ControlsBar;

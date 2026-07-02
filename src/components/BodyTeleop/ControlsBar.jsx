import React, { useCallback, useRef } from 'react';
import PhotoCamera from '@material-ui/icons/PhotoCamera';
import VolumeOff from '@material-ui/icons/VolumeOff';
import VolumeUp from '@material-ui/icons/VolumeUp';

const CAMERAS = [
  { key: 'wideRoad', label: 'road', num: '1' },
  { key: 'driver', label: 'driver', num: '2' },
];

const btnBase = `h-11 w-[80px] rounded-xl text-[14px] font-bold tracking-[0.2px] uppercase flex items-center justify-center min-w-[44px] cursor-pointer select-none hover:text-white hover:bg-white/20 bg-glass`;
const btnInactive = `${btnBase} bg-white/10 text-white/60`;
const btnActive = `${btnBase} bg-white/30 text-white`;

const controlsGroupBase = 'z-10 flex flex-row items-stretch gap-3.5 rounded-[20px] p-4 bg-glass-dark';
const controlsGroupLandscape = 'absolute bottom-4 left-4';
const controlsGroupPortrait = 'relative self-stretch rounded-none shrink-0 justify-between gap-2';

const ControlsBar = ({
  activeCamera, onSwitchCamera,
  speakerVolume, onSpeakerVolumeChange,
  gamepadConnected, videoRef, isLandscape, controlsDisabled,
}) => {
  const screenshotInProgress = useRef(false);
  const handleScreenshot = useCallback(async () => {
    if (controlsDisabled || screenshotInProgress.current) return;
    const video = videoRef?.current;
    if (!video || !video.videoWidth) return;
    screenshotInProgress.current = true;
    try {
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
    } finally {
      screenshotInProgress.current = false;
    }
  }, [videoRef, activeCamera, controlsDisabled]);

  // overwrite default touch callback to avoid rapid double taps zooming in on iOS
  const handleScreenshotTouch = useCallback((e) => {
    e.preventDefault();
    if (controlsDisabled) return;
    handleScreenshot();
  }, [handleScreenshot, controlsDisabled]);

  // handle touch directly: iOS does not synthesize a click on a second finger
  // while another touch (the joystick) is already active
  const handleSwitchCameraTouch = useCallback((e, cameraKey) => {
    e.preventDefault();
    if (controlsDisabled) return;
    onSwitchCamera(cameraKey);
  }, [onSwitchCamera, controlsDisabled]);

  const handleSpeakerVolumeChange = useCallback((e) => {
    if (controlsDisabled) return;
    onSpeakerVolumeChange(Number(e.target.value));
  }, [onSpeakerVolumeChange, controlsDisabled]);

  const handleSpeakerMuteToggle = useCallback(() => {
    if (controlsDisabled) return;
    onSpeakerVolumeChange(speakerVolume > 0 ? 0 : 100);
  }, [speakerVolume, onSpeakerVolumeChange, controlsDisabled]);

  const handleSpeakerMuteTouch = useCallback((e) => {
    e.preventDefault();
    handleSpeakerMuteToggle();
  }, [handleSpeakerMuteToggle]);

  return (
    <div className={`${controlsGroupBase} ${isLandscape ? controlsGroupLandscape : controlsGroupPortrait}`}>
      {!gamepadConnected && (
        <div className="flex flex-col items-center justify-between gap-[5px] lg:gap-[7px]">
          <div className="flex gap-[4px] items-center">
            {CAMERAS.map((cam) => (
              <button
                key={cam.key}
                className={`${activeCamera === cam.key ? btnActive : btnInactive} transition duration-200 ${controlsDisabled ? 'opacity-50' : 'opacity-90'}`}
                disabled={controlsDisabled}
                onClick={() => onSwitchCamera(cam.key)}
                onTouchEnd={(e) => handleSwitchCameraTouch(e, cam.key)}
              >
                {cam.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] lg:text-[13px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Camera</span>
        </div>
      )}
      <div className="flex flex-col items-center justify-between gap-[5px] lg:gap-[7px] min-w-[128px]">
        <div className={`h-11 rounded-xl px-3 flex items-center gap-2 bg-glass text-white/70 transition duration-200 ${controlsDisabled ? 'opacity-50 pointer-events-none' : 'opacity-90 hover:text-white'}`}>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white"
            disabled={controlsDisabled}
            aria-label={speakerVolume > 0 ? 'Mute speaker' : 'Unmute speaker'}
            onClick={handleSpeakerMuteToggle}
            onTouchEnd={handleSpeakerMuteTouch}
          >
            {speakerVolume > 0
              ? <VolumeUp className="text-[24px]" />
              : <VolumeOff className="text-[24px]" />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={speakerVolume}
            disabled={controlsDisabled}
            onChange={handleSpeakerVolumeChange}
            aria-label="Speaker volume"
            className="w-20 cursor-pointer accent-white disabled:cursor-default"
            style={{ touchAction: 'pan-x', accentColor: 'rgba(255, 255, 255, 0.85)' }}
          />
        </div>
        <span className="text-[10px] lg:text-[13px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Speaker</span>
      </div>
      <div className="flex flex-col items-center justify-between gap-[5px] lg:gap-[7px]">
        <div
          className={`${btnInactive} w-full transition duration-200 ${controlsDisabled ? 'opacity-50 pointer-events-none' : 'opacity-90'}`}
          onClick={handleScreenshot}
          onTouchEnd={handleScreenshotTouch}
          title="Save screenshot"
        >
          <PhotoCamera className="text-[25px]" />
        </div>
        <span className="text-[10px] lg:text-[13px] font-semibold tracking-[0.5px] uppercase text-white/35 text-center leading-none">Snapshot</span>
      </div>
    </div>
  );
};

export default ControlsBar;

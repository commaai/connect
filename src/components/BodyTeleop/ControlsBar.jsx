import React, { useCallback } from 'react';
import PhotoCamera from '@material-ui/icons/PhotoCamera';

const QUICK_SOUNDS = [
  { key: 'engage', label: 'Engage' },
  { key: 'disengage', label: 'Disengage' },
  { key: 'prompt', label: 'Prompt' },
  { key: 'warningImmediate', label: 'Warning' },
];

const CAMERAS = [
  { key: 'wideRoad', label: 'road', num: '1' },
  { key: 'driver', label: 'driver', num: '2' },
];

const ControlsBar = ({
  classes, connection, activeCamera, onSwitchCamera,
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

  if (!isLandscape) {
    // Portrait layout
    return (
      <div className={`${classes.controlsGroup} ${classes.controlsGroupPortrait}`}>
        <div className={classes.portraitRow}>
          {!gamepadConnected && (
            <div className={classes.portraitCategory}>
              <span className={classes.controlsLabelPortrait}>Cams</span>
              <div className={classes.controlsButtons}>
                {CAMERAS.map((cam) => (
                  <div
                    key={cam.key}
                    className={`${classes.controlButton} ${classes.controlButtonPortrait} ${activeCamera === cam.key ? classes.controlButtonActive : classes.controlButtonInactive}`}
                    style={{ aspectRatio: '1/1' }}
                    onClick={() => onSwitchCamera(cam.key)}
                  >
                    {cam.num}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div className={classes.portraitCategory}>
            <span className={classes.controlsLabelPortrait}>Play Sounds</span>
            <div className={classes.controlsButtons}>
              {QUICK_SOUNDS.map((sound) => (
                <div
                  key={sound.key}
                  className={`${classes.controlButton} ${classes.controlButtonPortrait}`}
                  onClick={() => handlePlaySound(sound.key)}
                >
                  {sound.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Landscape layout
  return (
    <div className={classes.controlsGroup}>
      {!gamepadConnected && (
        <div className={classes.controlsColumn}>
          <div className={classes.controlsButtons}>
            {CAMERAS.map((cam) => (
              <div
                key={cam.key}
                className={`${classes.controlButton} ${activeCamera === cam.key ? classes.controlButtonActive : classes.controlButtonInactive}`}
                onClick={() => onSwitchCamera(cam.key)}
              >
                {cam.label}
              </div>
            ))}
          </div>
          <span className={classes.controlsLabelBelow}>Camera</span>
        </div>
      )}
      <div className={classes.controlsColumn}>
        <div className={classes.controlsButtons}>
          {QUICK_SOUNDS.map((sound) => (
            <div
              key={sound.key}
              className={classes.controlButton}
              onClick={() => handlePlaySound(sound.key)}
            >
              {sound.label}
            </div>
          ))}
        </div>
        <span className={classes.controlsLabelBelow}>Sounds</span>
      </div>
      <div className={classes.controlsColumn}>
        <div className={classes.controlsButtons}>
          <div
            className={classes.controlButton}
            onClick={handleScreenshot}
            title="Save screenshot"
          >
            <PhotoCamera className={classes.actionButtonIcon} />
          </div>
        </div>
        <span className={classes.controlsLabelBelow}>Screenshot</span>
      </div>
    </div>
  );
};

export default ControlsBar;

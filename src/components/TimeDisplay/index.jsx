import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import VolumeUp from '@material-ui/icons/VolumeUp';
import VolumeOff from '@material-ui/icons/VolumeOff';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, play, pause } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';
import { isIos } from '../../utils/browser.js';
import { selectRouteZoom, selectCurrentRoute } from '../../selectors/route';

const timerSteps = [
  0.1,
  0.25,
  0.5,
  1,
  2,
  4,
  8,
];

const styles = (theme) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: theme.palette.grey[999],
    height: '64px',
    borderRadius: '32px',
    padding: theme.spacing.unit,
    width: 400,
    maxWidth: '100%',
    margin: '0 auto',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.1s ease-in-out',
    '&.isExpanded': {
      opacity: 1,
      pointerEvents: 'auto',
    },
    '&.isThin': {
      height: 50,
      paddingBottom: 0,
      paddingTop: 0,
    },
  },
  desiredPlaySpeedContainer: {
    marginRight: theme.spacing.unit * 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '40px',
  },
  icon: {
    width: '98%',
    height: '98%',
    '&.dim': {
      color: theme.palette.grey[300],
    },
    '&.small': {
      width: '80%',
      height: '80%',
    },
    '&.circle': {
      border: `1px solid ${theme.palette.grey[900]}`,
      borderRadius: '50%',
    },
  },
  iconButton: {
    width: '40px',
    height: '40px',
  },
  tinyArrowIcon: {
    width: 12,
    height: 12,
    color: theme.palette.grey[500],
    '&[disabled]': {
      visibility: 'hidden',
    },
  },
  rightBorderBox: {
    borderRight: `1px solid ${theme.palette.grey[900]}`,
  },
  leftBorderBox: {
    borderLeft: `1px solid ${theme.palette.grey[900]}`,
  },
  currentTime: {
    margin: `0 ${theme.spacing.unit * 1}px`,
    fontSize: 15,
    fontWeight: 500,
    display: 'block',
    flexGrow: 1,
  },
});

const TimeDisplay = ({ classes, isThin, onMuteToggle, isMuted, hasAudio }) => {
  const dispatch = useDispatch();
  const currentRoute = useSelector((state) => selectCurrentRoute(state));
  const zoom = useSelector((state) => selectRouteZoom(state));
  const videoPlaySpeed = useSelector((state) => state.desiredPlaySpeed);

  const textHolder = useRef(null);
  const animationFrameId = useRef(null);
  const [desiredPlaySpeed, setDesiredPlaySpeed] = useState(videoPlaySpeed || 1);

  // Update desiredPlaySpeed when videoPlaySpeed changes
  useEffect(() => {
    if (videoPlaySpeed !== 0) {
      setDesiredPlaySpeed(videoPlaySpeed);
    }
  }, [videoPlaySpeed]);

  const getDisplayTime = () => {
    const offset = currentOffset();
    const now = new Date(offset + currentRoute.start_time_utc_millis);
    if (Number.isNaN(now.getTime())) {
      return '...';
    }
    let dateString = dayjs(now).format('HH:mm:ss');
    const seg = getSegmentNumber(currentRoute);
    if (seg !== null) {
      dateString = `${dateString} \u2013 ${seg}`;
    }
    return dateString;
  };

  const updateTime = () => {
    if (textHolder.current) {
      const newDisplayTime = getDisplayTime();
      // Update DOM directly instead of setState to avoid re-renders every frame
      if (textHolder.current.textContent !== newDisplayTime) {
        textHolder.current.textContent = newDisplayTime;
      }
    }
    animationFrameId.current = requestAnimationFrame(updateTime);
  };

  const jumpBack = (amount) => {
    dispatch(seek(currentOffset() - amount));
  };

  const jumpForward = (amount) => {
    dispatch(seek(currentOffset() + amount));
  };

  const decreaseSpeed = () => {
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.max(0, curIndex - 1);
    dispatch(play(timerSteps[curIndex]));
  };

  const canDecreaseSpeed = () => {
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex > 0;
  };

  const increaseSpeed = () => {
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.min(timerSteps.length - 1, curIndex + 1);
    dispatch(play(timerSteps[curIndex]));
  };

  const canIncreaseSpeed = () => {
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex < timerSteps.length - 1;
  };

  const togglePause = () => {
    if (videoPlaySpeed === 0) {
      dispatch(play(desiredPlaySpeed));
    } else {
      dispatch(pause());
    }
  };

  // Initialize RAF loop on mount
  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(updateTime);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  const isPaused = videoPlaySpeed === 0;
  const isExpandedCls = zoom ? 'isExpanded' : '';
  const isThinCls = isThin ? 'isThin' : '';

  return (
    <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => jumpBack(10000) }
          aria-label="Jump back 10 seconds"
        >
          <Replay10 className={`${classes.icon} small dim`} />
        </IconButton>
      </div>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => jumpForward(10000) }
          aria-label="Jump forward 10 seconds"
        >
          <Forward10 className={`${classes.icon} small dim`} />
        </IconButton>
      </div>
      { !isThin && (
        <Typography variant="caption" align="center" style={{ paddingTop: 4 }}>
          CURRENT PLAYBACK TIME
        </Typography>
      )}
      <Typography variant="body1" align="center" className={classes.currentTime}>
        <span ref={textHolder}>{ getDisplayTime() }</span>
      </Typography>
      {!isIos() && (
        <div className={ classes.desiredPlaySpeedContainer }>
          <IconButton
            className={classes.tinyArrowIcon}
            onClick={increaseSpeed}
            disabled={!canIncreaseSpeed()}
            aria-label="Increase play speed by 1 step"
          >
            <UpArrow className={classes.tinyArrowIcon} />
          </IconButton>
          <Typography variant="body2" align="center">
            {desiredPlaySpeed}
            ×
          </Typography>
          <IconButton
            className={classes.tinyArrowIcon}
            onClick={decreaseSpeed}
            disabled={!canDecreaseSpeed()}
            aria-label="Decrease play speed by 1 step"
          >
            <DownArrow className={classes.tinyArrowIcon} />
          </IconButton>
        </div>
      )}
      <div className={ classes.leftBorderBox }>
        <Tooltip title={ !hasAudio ? "Enable audio recording through the \"Record and Upload Microphone Audio\" toggle on your device" : '' }>
          <div>
            <IconButton
              className={ classes.iconButton }
              onClick={onMuteToggle}
              disabled={!hasAudio}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted
                ? (<VolumeOff className={`${classes.icon} small ${!hasAudio ? 'dim' : ''}`} />)
                : (<VolumeUp className={`${classes.icon} small`} />)}
            </IconButton>
          </div>
        </Tooltip>
      </div>
      <div className={ classes.leftBorderBox }>
        <IconButton
          onClick={togglePause}
          aria-label={isPaused ? 'Unpause' : 'Pause'}
        >
          {isPaused
            ? (<PlayArrow className={classes.icon} />)
            : (<Pause className={classes.icon} />)}
        </IconButton>
      </div>
    </div>
  );
};

export default withStyles(styles)(TimeDisplay);

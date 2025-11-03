import { Tooltip } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import VolumeOff from '@mui/icons-material/VolumeOff';
import VolumeUp from '@mui/icons-material/VolumeUp';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow } from '../../icons';
import { selectCurrentRoute, selectRouteZoom } from '../../selectors/route';
import { currentOffset } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';
import { isIos } from '../../utils/browser.js';

const timerSteps = [0.1, 0.25, 0.5, 1, 2, 4, 8];

const Base = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  backgroundColor: theme.palette.grey[999],
  height: '64px',
  borderRadius: '32px',
  padding: theme.spacing(1),
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
}));

const DesiredPlaySpeedContainer = styled('div')(({ theme }) => ({
  marginRight: theme.spacing(1),
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: '40px',
}));

const StyledIconButton = styled(IconButton)({
  width: '40px',
  height: '40px',
});

const TinyArrowIcon = styled(IconButton)(({ theme }) => ({
  width: 12,
  height: 12,
  color: theme.palette.grey[500],
  '&[disabled]': {
    visibility: 'hidden',
  },
}));

const RightBorderBox = styled('div')(({ theme }) => ({
  borderRight: `1px solid ${theme.palette.grey[900]}`,
}));

const LeftBorderBox = styled('div')(({ theme }) => ({
  borderLeft: `1px solid ${theme.palette.grey[900]}`,
}));

const CurrentTime = styled(Typography)(({ theme }) => ({
  margin: `0 ${theme.spacing(1)}`,
  fontSize: 15,
  fontWeight: 500,
  display: 'block',
  flexGrow: 1,
}));

const PlaybackLabel = styled(Typography)({
  paddingTop: 4,
});

const TimeDisplay = ({ isThin, onMuteToggle, isMuted, hasAudio }) => {
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: updateTime intentionally not in deps to avoid infinite RAF loop
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
    <Base className={`${isExpandedCls} ${isThinCls}`}>
      <RightBorderBox>
        <StyledIconButton onClick={() => jumpBack(10000)} aria-label="Jump back 10 seconds">
          <Replay10 sx={{ width: '80%', height: '80%' }} />
        </StyledIconButton>
      </RightBorderBox>
      <RightBorderBox>
        <StyledIconButton onClick={() => jumpForward(10000)} aria-label="Jump forward 10 seconds">
          <Forward10 sx={{ width: '80%', height: '80%' }} />
        </StyledIconButton>
      </RightBorderBox>
      {!isThin && (
        <PlaybackLabel variant="caption" align="center">
          CURRENT PLAYBACK TIME
        </PlaybackLabel>
      )}
      <CurrentTime variant="body1" align="center">
        <span ref={textHolder}>{getDisplayTime()}</span>
      </CurrentTime>
      {!isIos() && (
        <DesiredPlaySpeedContainer>
          <TinyArrowIcon onClick={increaseSpeed} disabled={!canIncreaseSpeed()} aria-label="Increase play speed by 1 step">
            <UpArrow sx={{ width: 12, height: 12 }} />
          </TinyArrowIcon>
          <Typography variant="body2" align="center">
            {desiredPlaySpeed}×
          </Typography>
          <TinyArrowIcon onClick={decreaseSpeed} disabled={!canDecreaseSpeed()} aria-label="Decrease play speed by 1 step">
            <DownArrow sx={{ width: 12, height: 12 }} />
          </TinyArrowIcon>
        </DesiredPlaySpeedContainer>
      )}
      <LeftBorderBox>
        <Tooltip title={!hasAudio ? 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device' : ''}>
          <div>
            <StyledIconButton onClick={onMuteToggle} disabled={!hasAudio} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? (
                <VolumeOff sx={(theme) => ({ width: '80%', height: '80%', color: !hasAudio ? theme.palette.grey[300] : undefined })} />
              ) : (
                <VolumeUp sx={{ width: '80%', height: '80%' }} />
              )}
            </StyledIconButton>
          </div>
        </Tooltip>
      </LeftBorderBox>
      <LeftBorderBox>
        <StyledIconButton onClick={togglePause} aria-label={isPaused ? 'Unpause' : 'Pause'}>
          {isPaused ? <PlayArrow sx={{ width: '80%', height: '80%' }} /> : <Pause sx={{ width: '80%', height: '80%' }} />}
        </StyledIconButton>
      </LeftBorderBox>
    </Base>
  );
};

export default TimeDisplay;

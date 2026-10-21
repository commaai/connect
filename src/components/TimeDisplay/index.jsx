import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, play, pause } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';
import { isIos } from '../../utils/browser.js';

const timerSteps = [
  0.1,
  0.25,
  0.5,
  1,
  2,
  4,
  8,
];

class TimeDisplay extends Component {
  static getDerivedStateFromProps(props, state) {
    if (props.desiredPlaySpeed !== 0 && props.desiredPlaySpeed !== state.desiredPlaySpeed) {
      return {
        ...state,
        desiredPlaySpeed: props.desiredPlaySpeed,
      };
    }
    return state;
  }

  constructor(props) {
    super(props);

    this.textHolder = React.createRef();

    this.updateTime = this.updateTime.bind(this);
    this.togglePause = this.togglePause.bind(this);
    this.increaseSpeed = this.increaseSpeed.bind(this);
    this.decreaseSpeed = this.decreaseSpeed.bind(this);
    this.jumpBack = this.jumpBack.bind(this);
    this.jumpForward = this.jumpForward.bind(this);

    this.state = {
      desiredPlaySpeed: 1,
      displayTime: this.getDisplayTime(),
    };
  }

  componentDidMount() {
    this.mounted = true;
    requestAnimationFrame(this.updateTime);
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  getDisplayTime() {
    const offset = currentOffset();
    const { currentRoute } = this.props;
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
  }

  jumpBack(amount) {
    this.props.dispatch(seek(currentOffset() - amount));
  }

  jumpForward(amount) {
    this.props.dispatch(seek(currentOffset() + amount));
  }

  updateTime() {
    if (!this.mounted || !this.textHolder.current) {
      return;
    }
    const newDisplayTime = this.getDisplayTime();
    const { displayTime } = this.state;
    if (newDisplayTime !== displayTime) {
      this.setState({ displayTime: newDisplayTime });
    }

    requestAnimationFrame(this.updateTime);
  }

  decreaseSpeed() {
    const { dispatch } = this.props;
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.max(0, curIndex - 1);
    dispatch(play(timerSteps[curIndex]));
  }

  canDecreaseSpeed() {
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex > 0;
  }

  increaseSpeed() {
    const { dispatch } = this.props;
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.min(timerSteps.length - 1, curIndex + 1);
    dispatch(play(timerSteps[curIndex]));
  }

  canIncreaseSpeed() {
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex < timerSteps.length - 1;
  }

  togglePause() {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (desiredPlaySpeed === 0) {
      // eslint-disable-next-line react/destructuring-assignment
      dispatch(play(this.state.desiredPlaySpeed));
    } else {
      dispatch(pause());
    }
  }

  render() {
    const { zoom, desiredPlaySpeed: videoPlaySpeed, isThin, onMuteToggle, isMuted, hasAudio } = this.props;
    const { displayTime, desiredPlaySpeed } = this.state;
    const isPaused = videoPlaySpeed === 0;
    const iconButton = 'text-[length:inherit] w-[2.5em] h-[2.5em]';
    const smallIcon = 'w-[80%] h-[80%]';
    const tinyArrow = 'text-[length:inherit] w-[0.75em] h-[0.75em] text-[#424a4f] disabled:invisible';
    return (
      <div
        className={`flex items-center bg-[#0c0e0f] rounded-[2em] px-[0.5em] w-[25em] max-w-full mx-auto transition-opacity duration-100 ease-in-out
          ${isThin ? 'h-[3.125em] py-0' : 'h-[4em] py-[0.5em]'}
          ${zoom ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="border-r border-[#1e2224]">
          <IconButton
            className={iconButton}
            onClick={this.togglePause}
            aria-label={isPaused ? 'Unpause' : 'Pause'}
          >
            {isPaused
              ? (<PlayArrow className="w-[98%] h-[98%]" />)
              : (<Pause className="w-[98%] h-[98%]" />)}
          </IconButton>
        </div>
        <div className="border-r border-[#1e2224]">
          <IconButton
            className={iconButton}
            onClick={() => this.jumpBack(10000)}
            aria-label="Jump back 10 seconds"
          >
            <Replay10 className={`${smallIcon} text-[#535f64]`} />
          </IconButton>
        </div>
        <div className="border-r border-[#1e2224]">
          <IconButton
            className={iconButton}
            onClick={() => this.jumpForward(10000)}
            aria-label="Jump forward 10 seconds"
          >
            <Forward10 className={`${smallIcon} text-[#535f64]`} />
          </IconButton>
        </div>
        {!isThin && (
          <Typography variant="caption" align="center" className="pt-1">
            CURRENT PLAYBACK TIME
          </Typography>
        )}
        <Typography variant="body1" align="center" className="block grow mx-[0.5em] text-[0.9375em] font-medium">
          <span ref={this.textHolder}>{displayTime}</span>
        </Typography>
        {!isIos() && (
          <div className="flex flex-col items-center min-w-[2.5em] mr-[0.5em]">
            <IconButton
              className={tinyArrow}
              onClick={this.increaseSpeed}
              disabled={!this.canIncreaseSpeed()}
              aria-label="Increase play speed by 1 step"
            >
              <UpArrow className={tinyArrow} />
            </IconButton>
            <Typography variant="body2" align="center" className="text-[0.875em]">
              {desiredPlaySpeed}
              ×
            </Typography>
            <IconButton
              className={tinyArrow}
              onClick={this.decreaseSpeed}
              disabled={!this.canDecreaseSpeed()}
              aria-label="Decrease play speed by 1 step"
            >
              <DownArrow className={tinyArrow} />
            </IconButton>
          </div>
        )}
        <div className="border-l border-[#1e2224]">
          <Tooltip title={!hasAudio ? 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device' : ''}>
            <div>
              <IconButton
                className={iconButton}
                onClick={onMuteToggle}
                disabled={!hasAudio}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted
                  ? (<VolumeOff className={`${smallIcon} ${!hasAudio ? 'text-[#535f64]' : ''}`} />)
                  : (<VolumeUp className={smallIcon} />)}
              </IconButton>
            </div>
          </Tooltip>
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  desiredPlaySpeed: state.desiredPlaySpeed,
});

export default connect(stateToProps)(TimeDisplay);

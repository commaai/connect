import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import fecha from 'fecha';
import { clips as Clips } from '@commaai/api';

import { withStyles, Typography, TextField, Button, CircularProgress } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/ErrorOutline';

import { clipsCreate } from '../../actions/clips';
import Colors from '../../colors';
import { formatClipTimestamp } from '../../utils/clips';
import DriveVideo from '../DriveVideo';
import ResizeHandler from '../ResizeHandler';
import TimeDisplay from '../TimeDisplay';
import Timeline from '../Timeline';

const styles = () => ({
  clipOption: {
    marginTop: 12,
    width: '100%',
    '& h4': {
      color: Colors.white,
      margin: '0 0 5px 0',
      fontSize: '1rem',
    },
  },
  videoTypeOptions: {
    display: 'flex',
    alignItems: 'center',
  },
  videoTypeOption: {
    height: 32,
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: `1px solid ${Colors.white10}`,
    borderRight: 'none',
    '&.selected': {
      backgroundColor: Colors.grey950,
    },
    '&:first-child': {
      borderRadius: '16px 0 0 16px',
    },
    '&:last-child': {
      borderRadius: '0 16px 16px 0',
      borderRight: `1px solid ${Colors.white10}`,
    },
  },
  clipTitleInput: {
    '& div': {
      border: `1px solid ${Colors.white10}`,
    },
    '& input': {
      padding: '6px 16px',
    },
  },
  overviewBlockError: {
    borderRadius: 12,
    marginBottom: 12,
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    color: Colors.white,
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  buttons: {
    width: '100%',
    maxWidth: 400,
    height: 42,
    borderRadius: 21,
    background: Colors.white,
    color: Colors.grey900,
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
    '&:disabled': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
    '&:disabled:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
  },
  timeView: {
    marginBottom: 8,
    width: '100%',
    display: 'flex',
    justifyContent: 'space-around',
    color: Colors.white,
    textAlign: 'center',
    '& p': {
      margin: 0,
      fontSize: '0.9rem',
      '&:first-child': { fontWeight: 500 },
    },
    '& span': {
      fontSize: '0.7rem',
      lineHeight: '0.7rem',
      display: 'block',
    },
  },
  headerTimeline: {
    backgroundColor: Colors.grey900,
    padding: '4px 0',
  },
});

class ClipCreate extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      videoTypeOption: 'q',
      clipTitle: null,
      createLoading: false,
      error: null,
    };

    this.onResize = this.onResize.bind(this);
    this.onClipCreate = this.onClipCreate.bind(this);
  }

  async onClipCreate() {
    const { videoTypeOption, clipTitle } = this.state;
    const { loop, currentRoute } = this.props;

    if (loop.duration > 300000) { // 5 minutes
      this.setState({ error: 'clip selection exceeds maximum length of 5 minutes' });
      return;
    }

    this.setState({ createLoading: true });
    try {
      const resp = await Clips.clipsCreate(
        currentRoute.fullname,
        clipTitle,
        loop.startTime,
        loop.startTime + loop.duration,
        videoTypeOption,
        false,
      );
      if (resp && resp.success) {
        this.props.dispatch(clipsCreate(resp.clip_id, videoTypeOption, clipTitle, false));
      } else if (resp.error == 'too_many_pending') {
        this.setState({ error: 'you already have a clip pending, please wait for it to complete', createLoading: false });
      } else {
        this.setState({ error: 'failed to create clip', createLoading: false });
        console.log(resp);
      }
    } catch (err) {
      this.setState({ error: 'unable to create clip', createLoading: false });
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_details' });
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes, loop, device } = this.props;
    const { windowWidth, videoTypeOption, clipTitle, createLoading, error } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const startStr = fecha.format(new Date(loop.startTime), 'h:mm:ss\u00a0a').toLowerCase();
    const endStr = fecha.format(new Date(loop.startTime + loop.duration), 'h:mm:ss\u00a0a').toLowerCase();
    const durSeconds = Math.floor(loop.duration / 1000);
    let durationStr = durSeconds >= 3600 ? `${Math.floor(durSeconds / 3600)}:` : '';
    durationStr += `${Math.floor((durSeconds % 3600) / 60).toString().padStart(durSeconds >= 3600 ? 2 : 1, '0')}:`;
    durationStr += (durSeconds % 60).toString().padStart(2, '0');

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <Timeline className={classes.headerTimeline} thumbnailsVisible hasClip />
        <div style={{ padding: viewerPadding }}>
          <div className={ classes.timeView }>
            <div>
              <p>start</p>
              <p>{ startStr }</p>
            </div>
            <div>
              <p>end</p>
              <p>{ endStr }</p>
            </div>
            <div>
              <p>duration</p>
              <p>{ durationStr }</p>
              <p><span>max 5 min</span></p>
            </div>
          </div>
          <DriveVideo />
          <div className={ classes.clipOption }>
            <TimeDisplay isThin />
          </div>
          <div className={ classes.clipOption }>
            <h4>Video type</h4>
            <div className={classes.videoTypeOptions} style={{ maxWidth: 400 }}>
              <div
                className={ `${classes.videoTypeOption} ${videoTypeOption === 'q' ? 'selected' : ''}` }
                onClick={ () => this.setState({ videoTypeOption: 'q' }) }
              >
                <Typography className={classes.mediaOptionText}>
                  {`Front ${windowWidth < 450 ? '(SD)': '(low-res)'}`}
                </Typography>
              </div>
              <div
                className={ `${classes.videoTypeOption} ${videoTypeOption === 'f' ? 'selected' : ''}` }
                onClick={ () => this.setState({ videoTypeOption: 'f' }) }
              >
                <Typography className={classes.mediaOptionText}>Front</Typography>
              </div>
              { device.device_type === 'three' && (
                <div
                  className={ `${classes.videoTypeOption} ${videoTypeOption === 'e' ? 'selected' : ''}` }
                  onClick={ () => this.setState({ videoTypeOption: 'e' }) }
                >
                  <Typography className={classes.mediaOptionText}>Wide</Typography>
                </div>
              ) }
              <div
                className={ `${classes.videoTypeOption} ${videoTypeOption === 'd' ? 'selected' : ''}` }
                onClick={ () => this.setState({ videoTypeOption: 'd' }) }
              >
                <Typography className={classes.mediaOptionText}>Interior</Typography>
              </div>
              { device.device_type === 'three' && (
                <div
                  className={ `${classes.videoTypeOption} ${videoTypeOption === '360' ? 'selected' : ''}` }
                  onClick={ () => this.setState({ videoTypeOption: '360' }) }
                >
                  <Typography className={classes.mediaOptionText}>360°</Typography>
                </div>
              ) }
            </div>
          </div>
          <div className={ classes.clipOption }>
            <h4>Clip title</h4>
            <TextField
              className={ classes.clipTitleInput }
              value={ clipTitle || '' }
              onChange={ (ev) => this.setState({ clipTitle: ev.target.value }) }
              placeholder={ formatClipTimestamp(loop.startTime) }
            />
          </div>
          <div className={ classes.clipOption }>
            { error && (
              <div className={ classes.overviewBlockError }>
                <ErrorIcon />
                <Typography>{ error }</Typography>
              </div>
            ) }
            <Button
              className={classes.buttons}
              disabled={ createLoading }
              onClick={ this.onClipCreate }
            >
              { createLoading
                ? <CircularProgress style={{ margin: 0, color: Colors.white }} size={ 19 } />
                : 'Create clip' }
            </Button>
          </div>
        </div>
      </>
    );
  }
}

const stateToProps = Obstruction({
  currentRoute: 'currentRoute',
  dongleId: 'dongleId',
  device: 'device',
  loop: 'loop',
});

export default connect(stateToProps)(withStyles(styles)(ClipCreate));

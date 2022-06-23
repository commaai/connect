import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Typography, TextField, Button } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/ErrorOutline';

import ResizeHandler from '../ResizeHandler';
import DriveVideo from '../DriveVideo';
import Timeline from '../Timeline';
import TimeDisplay from '../TimeDisplay';
import Colors from '../../colors';
import { clipCreate } from '../../actions/clip';

const styles = (theme) => ({
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
    width: 'max-content',
    alignItems: 'center',
    display: 'flex',
  },
  videoTypeOption: {
    height: 32,
    width: 84,
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
  clipLabelInput: {
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
});

class ClipCreate extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      videoTypeOption: 'f',
      clipLabel: null,
      error: null,
    };

    this.onResize = this.onResize.bind(this);
    this.onclipCreate = this.onclipCreate.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, PrevState) {
  }

  onclipCreate() {
    const { videoTypeOption, clipLabel } = this.state;
    const { loop } = this.props;
    if (loop.duration > 300000) {  // 5 minutes
      this.setState({ error: 'clip selection exceeds maximum length of 5 minutes' });
      return;
    }
    this.props.dispatch(clipCreate(videoTypeOption, clipLabel));
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes } = this.props;
    const { windowWidth, videoTypeOption, clipLabel, error } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32

    return <>
      <ResizeHandler onResize={ this.onResize } />
      <Timeline className={classes.headerTimeline} thumbnailsVisible={ true } hasClip />
      <div style={{ padding: viewerPadding }}>
        <DriveVideo />
        <div className={ classes.clipOption }>
          <TimeDisplay isThin />
        </div>
        <div className={ classes.clipOption }>
          <h4>Video type</h4>
          <div className={classes.videoTypeOptions}>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'f' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'f' }) }>
              <Typography className={classes.mediaOptionText}>Front</Typography>
            </div>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'e' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'e' }) }>
              <Typography className={classes.mediaOptionText}>Wide</Typography>
            </div>
            <div className={ `${classes.videoTypeOption} ${videoTypeOption === 'd' ? 'selected' : ''}` }
              onClick={ () => this.setState({ videoTypeOption: 'd' }) }>
              <Typography className={classes.mediaOptionText}>Cabin</Typography>
            </div>
          </div>
        </div>
        <div className={ classes.clipOption }>
          <h4>Clip title</h4>
          <TextField className={ classes.clipLabelInput } value={ clipLabel ? clipLabel : '' }
            onChange={ (ev) =>this.setState({ clipLabel: ev.target.value }) } />
        </div>
        <div className={ classes.clipOption }>
          { error && <div className={ classes.overviewBlockError }>
            <ErrorIcon />
            <Typography>{ error }</Typography>
          </div> }
          <Button variant="outlined" onClick={ this.onclipCreate }>
            Create clip
          </Button>
        </div>
      </div>
    </>;
  }
}

const stateToProps = Obstruction({
  currentSegment: 'currentSegment',
  dongleId: 'dongleId',
  clip: 'clip',
  loop: 'loop',
});

export default connect(stateToProps)(withStyles(styles)(ClipCreate));

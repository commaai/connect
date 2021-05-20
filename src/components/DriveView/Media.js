import React, { Component } from 'react';
import { connect } from 'react-redux';
import cx from 'classnames';
import Obstruction from 'obstruction';

import { withStyles, Typography } from '@material-ui/core';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import ResizeHandler from '../ResizeHandler';

const styles = (theme) => ({
  root: {
    display: 'flex',
  },
  mediaOptionsRoot: {
    maxWidth: 964,
    margin: '0 auto',
    marginBottom: 12,
  },
  mediaOptions: {
    width: 'max-content',
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 50,
    display: 'flex',
    marginLeft: 'auto',
  },
  mediaOption: {
    alignItems: 'center',
    borderRight: '1px solid rgba(255,255,255,.1)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    cursor: 'pointer',
    minHeight: 32,
    minWidth: 44,
    paddingLeft: 15,
    paddingRight: 15,
    opacity: '0.6',
    '&.disabled': {
      cursor: 'default',
    },
    '&:last-child': {
      borderRight: 'none',
    },
  },
  mediaOptionDisabled: {
    cursor: 'auto',
  },
  mediaOptionIcon: {
    backgroundColor: '#fff',
    borderRadius: 3,
    height: 20,
    margin: '2px 0',
    width: 30,
  },
  mediaOptionText: {
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  mediaSource: {
    width: '100%',
  },
  mediaSourceSelect: {
    width: '100%',
  },
});

const MediaType = {
  VIDEO: 'video',
  DRIVER_VIDEO: 'dcamera',
  HUD: 'hud',
  MAP: 'map'
};

class Media extends Component {
  constructor(props) {
    super(props);

    this.renderMediaOptions = this.renderMediaOptions.bind(this);

    this.state = {
      inView: MediaType.HUD,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };

    this.onResize = this.onResize.bind(this);
  }

  onResize(windowWidth, windowHeight) {
    this.setState({ windowWidth, windowHeight });
  }

  render() {
    const { classes } = this.props;
    const { inView, windowWidth, windowHeight } = this.state;

    const showMapAlways = windowWidth >= 1536;
    if (showMapAlways && inView === MediaType.MAP) {
      this.setState({ inView: MediaType.HUD });
    }

    const mediaContainerStyle = showMapAlways ?
      { width: '60%' } :
      { width: '100%' };
    const mapContainerStyle = showMapAlways ?
      { width: '40%', marginTop: 46, paddingLeft: 24 } :
      { width: '100%' };

    return (
      <div className={ classes.root }>
        <ResizeHandler onResize={ this.onResize } />
        <div style={ mediaContainerStyle }>
          { this.renderMediaOptions(showMapAlways) }
          { inView !== MediaType.MAP &&
            <DriveVideo shouldShowUI={inView === MediaType.HUD} front={inView === MediaType.DRIVER_VIDEO}
              onVideoChange={(noVideo) => this.setState({ inView: noVideo ? MediaType.MAP : inView }) } />
          }
          { (inView === MediaType.MAP && !showMapAlways) &&
            <div style={ mapContainerStyle }>
              <DriveMap />
            </div>
          }
        </div>
        { (inView !== MediaType.MAP && showMapAlways) &&
          <div style={ mapContainerStyle }>
            <DriveMap />
          </div>
        }
      </div>
    );
  }

  renderMediaOptions(showMapAlways) {
    const { classes, currentSegment } = this.props;
    const { inView } = this.state;
    const mediaSource = 'eon-road-camera';
    const hasDriverCameraStream = this.props.currentSegment && this.props.currentSegment.hasDriverCameraStream;
    return (
      <div className={classes.mediaOptionsRoot}>
        <div className={classes.mediaOptions}>
          <div className={classes.mediaOption} style={inView === MediaType.HUD ? { opacity: 1 } : { }}
            onClick={() => this.setState({ inView: MediaType.HUD })}>
            <Typography className={classes.mediaOptionText}>HUD</Typography>
          </div>
          <div className={classes.mediaOption} style={inView === MediaType.VIDEO ? { opacity: 1 } : {}}
            onClick={() => this.setState({ inView: MediaType.VIDEO })}>
            <Typography className={classes.mediaOptionText}>Video</Typography>
          </div>
          { hasDriverCameraStream && (
            <div className={cx(classes.mediaOption, { disabled: !hasDriverCameraStream })}
              style={inView === MediaType.DRIVER_VIDEO ? { opacity: 1 } : {}}
              onClick={() => hasDriverCameraStream && this.setState({ inView: MediaType.DRIVER_VIDEO })}>
              <Typography className={classes.mediaOptionText}>Driver Video</Typography>
            </div>
            )}
          { !showMapAlways &&
            <div className={classes.mediaOption} style={inView === MediaType.MAP ? { opacity: 1 } : { }}
              onClick={() => this.setState({ inView: MediaType.MAP })}>
              <Typography className={classes.mediaOptionText}>Map</Typography>
            </div>
          }
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
});

export default connect(stateToProps)(withStyles(styles)(Media));

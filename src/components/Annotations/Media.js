import React, { Component } from 'react';
import { connect } from 'react-redux';
import cx from 'classnames';
import Obstruction from 'obstruction';

import { withStyles, Typography } from '@material-ui/core';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';

const styles = (theme) => ({
  root: {
    display: 'flex',
    alignItems: 'flex-end',
  },
  mediaOptions: {
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 50,
    display: 'flex',
    marginLeft: 'auto',
    marginBottom: 12,
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
    };
  }

  render() {
    const { classes } = this.props;
    const { inView } = this.state;
    return (
      <>
        { this.renderMediaOptions() }
        { inView === MediaType.MAP && <DriveMap /> }
        { (inView !== MediaType.MAP)
          && (
          <DriveVideo
            shouldShowUI={inView === MediaType.HUD}
            front={inView === MediaType.DRIVER_VIDEO}
            onVideoChange={(noVideo) => {
              this.setState({ inView: noVideo ? MediaType.MAP : inView });
            }}
          />
          )}
      </>
    );
  }

  renderMediaOptions() {
    const { classes, currentSegment } = this.props;
    const { inView } = this.state;
    const mediaSource = 'eon-road-camera';
    const hasDriverCameraStream = this.props.currentSegment && this.props.currentSegment.hasDriverCameraStream;
    return (
      <div className={classes.root}>
        <div className={classes.mediaOptions}>
          <div className={classes.mediaOption} style={inView === MediaType.HUD ? { opacity: 1 } : { }}
            onClick={() => this.setState({ inView: MediaType.HUD })}>
            <Typography className={classes.mediaOptionText}>
              HUD
            </Typography>
          </div>
          <div className={classes.mediaOption} style={inView === MediaType.VIDEO ? { opacity: 1 } : {}}
            onClick={() => this.setState({ inView: MediaType.VIDEO })}>
            <Typography className={classes.mediaOptionText}>
              Video
            </Typography>
          </div>
          { hasDriverCameraStream && (
            <div className={cx(classes.mediaOption, { disabled: !hasDriverCameraStream })}
              style={inView === MediaType.DRIVER_VIDEO ? { opacity: 1 } : {}}
              onClick={() => hasDriverCameraStream && this.setState({ inView: MediaType.DRIVER_VIDEO })}>
              <Typography className={classes.mediaOptionText}>
                Driver Video
              </Typography>
            </div>
            )}
          <div className={classes.mediaOption} style={inView === MediaType.MAP ? { opacity: 1 } : { }}
            onClick={() => this.setState({ inView: MediaType.MAP })}>
            <Typography className={classes.mediaOptionText}>
              Map
            </Typography>
          </div>
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
});

export default connect(stateToProps)(withStyles(styles)(Media));

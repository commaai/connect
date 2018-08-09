import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { classNames } from 'react-extras';

import {
  withStyles,
  Grid,
  FormControl,
  Select,
  MenuItem,
  Typography,
} from '@material-ui/core';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';

const styles = theme => ({
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
    opacity: '0.6',
    '&:last-child': {
      borderRight: 'none',
    }
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
  HUD: 'hud',
  MAP: 'map'
}

class Media extends Component {

  constructor(props) {
    super(props);

    this.renderMediaOptions = this.renderMediaOptions.bind(this);

    this.state = {
      inView: MediaType.HUD,
    }
  }

  render () {
    const { classes } = this.props;
    let { inView } = this.state;
    return (
      <React.Fragment>
        { this.renderMediaOptions() }
        { inView === MediaType.MAP && <DriveMap /> }
        { inView !== MediaType.MAP &&
          <DriveVideo
            shouldShowUI={ inView === MediaType.HUD }
            onVideoChange={ (noVideo) => {
              this.setState({ inView: noVideo ? MediaType.MAP : inView }) }
            } />
        }
      </React.Fragment>
    );
  }

  renderMediaOptions () {
    const { classes } = this.props;
    let { inView } = this.state;
    const mediaSource = 'eon-road-camera';
    return (
      <Grid container>
        <Grid item xs={ 7 }>
          {/*
          <FormControl className={ classes.mediaSource }>
            <Select
              name='media-source'
              value={ 'eon-road-camera' }
              className={ classes.mediaSourceSelect }>
              <MenuItem value='eon-road-camera'>EON Road Camera</MenuItem>
              <MenuItem value='eon-driver-camera'>EON Driver Camera</MenuItem>
            </Select>
          </FormControl>
          */}
        </Grid>
        <Grid item xs={ 4 }
          className={ classes.mediaOptions }>
          <Grid item xs={ 4 }
            className={ classes.mediaOption }
            style={ inView === MediaType.VIDEO ? { opacity: 1 } : {}}
            onClick={() => this.setState({inView: MediaType.VIDEO})}>
            <Typography className={ classes.mediaOptionText }>
              Video
            </Typography>
          </Grid>
          <Grid item xs={ 4 }
            className={ classes.mediaOption }
            style={ inView === MediaType.HUD ? { opacity: 1 } : { } }
            onClick={() => this.setState({inView: MediaType.HUD }) }>
            <Typography className={ classes.mediaOptionText }>
              HUD
            </Typography>
          </Grid>
          <Grid item xs={ 4 }
            className={ classes.mediaOption }
            style={ inView === MediaType.MAP ? { opacity: 1 } : { } }
            onClick={() => this.setState({inView: MediaType.MAP})}>
            <Typography className={ classes.mediaOptionText }>
              Map
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    )
  }

}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(Media));

import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { classNames } from 'react-extras';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import Typography from '@material-ui/core/Typography';

import SingleMap from '../singlemap';
import VideoPreview from '../video';

const styles = theme => ({
  mediaSources: {

  },
  mediaOptions: {
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 50,
    display: 'flex',
    marginBottom: 12,
  },
  mediaOption: {
    alignItems: 'center',
    borderRight: '1px solid rgba(255,255,255,.1)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    cursor: 'pointer',
    height: '48px',
    minWidth: '44px',
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
  mediaSourceSelect: {
    width: '100%',
  },
});

const MediaType = {
  VIDEO: 'video',
  UI: 'ui',
  MAP: 'map'
}

class Media extends Component {
  constructor(props) {
    super(props);

    this.state = {
      inView: MediaType.UI,
    }
  }
  render () {
    let inView = this.state.inView;
    const mediaSource = 'eon-road-camera';
    return (
      <React.Fragment>
        <Grid container>
          <Grid item xs={ 8 }>
            {/*<Select
              disabled={ true }
              displayEmpty
              value={ 'eon-road-camera' }
              onChange={ () => { console.log('select media source') } }
              className={ this.props.classes.mediaSourceSelect }
              inputProps={{
                name: 'media_source',
                id: 'media_source'
              }}>
              { mediaSource === 'eon-road-camera' &&
                <MenuItem disabled value='' >
                  EON Road Camera
                </MenuItem>
              }
              <MenuItem value='eon-driver-camera'>EON Driver Camera</MenuItem>
            </Select>*/}
          </Grid>
          <Grid item xs={ 4 }
            className={ this.props.classes.mediaOptions }>
            <Grid item xs={ 4 }
              className={ this.props.classes.mediaOption }
              style={ inView === MediaType.VIDEO ? { opacity: 1 } : {}}
              onClick={() => this.setState({inView: MediaType.VIDEO})}>
              <div className={ this.props.classes.mediaOptionIcon } />
              <Typography className={ this.props.classes.mediaOptionText }>
                Video
              </Typography>
            </Grid>
            <Grid item xs={ 4 }
              className={ this.props.classes.mediaOption }
              style={ inView === MediaType.UI ? { opacity: 1 } : {}}
              onClick={() => this.setState({inView: MediaType.UI})}>
              <div className={ this.props.classes.mediaOptionIcon } />
              <Typography className={ this.props.classes.mediaOptionText }>
                HUD
              </Typography>
            </Grid>
            <Grid item xs={ 4 }
              className={ this.props.classes.mediaOption }
              style={ inView === MediaType.MAP ? { opacity: 1 } : {}}
              onClick={() => this.setState({inView: MediaType.MAP})}>
              <div className={ this.props.classes.mediaOptionIcon } />
              <Typography className={ this.props.classes.mediaOptionText }>
                Map
              </Typography>
            </Grid>
          </Grid>
        </Grid>
        { inView === MediaType.MAP && <SingleMap /> }
        { inView !== MediaType.MAP && <VideoPreview shouldShowUI={ inView === MediaType.UI } onVideoChange={(noVideo) => this.setState({inView: noVideo ? MediaType.MAP : inView}) } /> }
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(Media));

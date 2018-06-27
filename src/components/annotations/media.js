import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import classNames from '@sindresorhus/class-names';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import SingleMap from '../singlemap';
import VideoPreview from '../video';

const styles = theme => ({
  mediaChoice: {
    display: 'block',
    cursor: 'pointer',
    height: '48px',
    minWidth: '44px'
  }
});

const MediaType = {
  VIDEO: 'video',
  MAP: 'map'
}

class Media extends Component {
  constructor(props) {
    super(props);

    this.state = {
      inView: MediaType.VIDEO,
    }
  }
  render () {
    let inView = this.state.inView;

    return (
      <React.Fragment>
        <Grid container justify='flex-end'>
          <Grid item xs={1} className={ this.props.classes.mediaChoice } onClick={() => this.setState({inView: MediaType.VIDEO})}>
            <Typography>Video</Typography>
          </Grid>
          <Grid item xs={1} className={ this.props.classes.mediaChoice } onClick={() => this.setState({inView: MediaType.MAP})}>
            <Typography>Map</Typography>
          </Grid>
        </Grid>
        { inView === MediaType.VIDEO && <VideoPreview onVideoChange={(noVideo) => this.setState({inView: noVideo ? MediaType.MAP : MediaType.VIDEO}) } /> }
        { inView === MediaType.MAP && <SingleMap /> }
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(Media));

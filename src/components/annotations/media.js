import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';

import SingleMap from '../singlemap';
import VideoPreview from '../video';

const styles = theme => {
  root: {}
};

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
        { inView === MediaType.VIDEO && <VideoPreview /> }
        { inView === MediaType.MAP && <SingleMap /> }
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
});

export default connect(stateToProps)(withStyles(styles)(Media));

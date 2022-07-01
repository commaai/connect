import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core';

import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';

const styles = (theme) => ({
  clipOption: {
    marginBottom: 12,
    width: '100%',
    '& h4': {
      color: Colors.white,
      margin: '0 0 5px 0',
      fontSize: '1rem',
    },
  },
});

class ClipDone extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
    };

    this.onResize = this.onResize.bind(this);
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes, clips } = this.props;
    const { windowWidth } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    return <>
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ padding: viewerPadding }}>
        <div className={ classes.clipOption }>
          <h4>{ clips.title }</h4>
          <video autoPlay={true} controls={true} muted={true} playsInline={true} loop={true} width={ '100%' }>
            { clips.url && <source src={ clips.url} /> }
          </video>
        </div>
      </div>
    </>;
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  clips: 'clips',
});

export default connect(stateToProps)(withStyles(styles)(ClipDone));

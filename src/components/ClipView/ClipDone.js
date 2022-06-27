import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { CircularProgress, withStyles } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/ErrorOutline';

import { deviceIsOnline, deviceOnCellular } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import Colors from '../../colors';
import { fetchFiles, fetchAthenaQueue, updateFiles, doUpload, fetchUploadUrls, fetchUploadQueue } from '../../actions/files';

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

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { clip } = this.props;

  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes, device, clip } = this.props;
    const { windowWidth } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    return <>
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ padding: viewerPadding }}>
        <div className={ classes.clipOption }>
          <h4>{ clip.title }</h4>
          <video autoPlay={true} controls={true} muted={true} playsinline={true} width={ '100%' }>
            <source src={ clip.url} type="video/mp4" />
          </video>
        </div>
      </div>
    </>;
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
  clip: 'clip',
});

export default connect(stateToProps)(withStyles(styles)(ClipDone));

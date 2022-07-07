import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Button } from '@material-ui/core';
import ShareIcon from '@material-ui/icons/Share';
import FileDownloadIcon from '@material-ui/icons/FileDownload';

import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';

const styles = (theme) => ({
  clipOption: {
    marginBottom: 12,
    width: '100%',
  },
  clipHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    '& h4': {
      color: Colors.white,
      margin: 0,
      fontSize: '1rem',
    },
  },
  buttonView: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    '& button': {
      marginTop: 4,
      '&:first-child': { marginTop: 0 },
    },
  },
  shareIcon: {
    display: 'inline',
    verticalAlign: 'text-bottom',
    margin: '0 3px',
  },
  shareButton: {
    display: 'flex',
    alignItems: 'center',
    minHeight: 14,
    fontSize: '0.8rem',
    padding: '4px 8px',
    borderRadius: 4,
    backgroundColor: Colors.white08,
    marginLeft: 8,
    '& svg': {
      height: 18,
    },
    '& button': {
      marginLeft: 8,
      marginRight: -6,
      color: Colors.white,
      fontSize: '0.8rem',
      padding: '4px 0',
      minHeight: 19,
      backgroundColor: Colors.white05,
      '&:hover': {
        backgroundColor: Colors.white10,
      },
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
    this.shareCurrentClip = this.shareCurrentClip.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  async shareCurrentClip() {
    try {
      await navigator.share({
        title: 'comma connect',
        url: window.location.href,
      });
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'clip_navigator_share' });
    }
  }

  downloadFile() {
    const { clips } = this.props;
    if (clips.url) {
      window.location.href = clips.url;
    }
  }

  render() {
    const { classes, clips } = this.props;
    const { windowWidth } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const videoSizeStyle = windowWidth > 1080 ?
      { maxHeight: 'calc(100vh - 224px)', width: '100%' } :
      { maxHeight: 'calc(100vh - 64px)', width: '100%' };

    return <>
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ padding: viewerPadding }}>
        <div className={ `${classes.clipOption} ${classes.clipHeader}` }>
          <h4>
            { clips.title ? clips.title : clips.route.split('|')[1] }
          </h4>
          <div className={classes.buttonView}>
            <Button onClick={ this.downloadFile } className={ classes.shareButton }>
              download
              <FileDownloadIcon />
            </Button>
            { Boolean(typeof navigator.share !== 'undefined' && clips.is_public) &&
              <Button onClick={ this.shareCurrentClip } className={ classes.shareButton }>
                share
                <ShareIcon />
              </Button>
            }
          </div>
        </div>
        <div className={ classes.clipOption }>
          <video autoPlay={true} controls={true} muted={true} playsInline={true} loop={true} style={ videoSizeStyle }>
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

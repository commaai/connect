import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Button } from '@material-ui/core';
import ShareIcon from '@material-ui/icons/Share';

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
  video: {
    maxHeight: 'calc(100vh - 64px)',
    maxWidth: '100%',
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

  render() {
    const { classes, clips } = this.props;
    const { windowWidth } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    return <>
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ padding: viewerPadding }}>
        <div className={ `${classes.clipOption} ${classes.clipHeader}` }>
          <h4>{ clips.title }</h4>
          { Boolean(typeof navigator.share !== 'undefined' && clips.is_public) &&
            <Button onClick={ this.shareCurrentClip } className={ classes.shareButton }>
              share
              <ShareIcon />
            </Button>
          }
        </div>
        <div className={ classes.clipOption }>
          <video autoPlay={true} controls={true} muted={true} playsInline={true} loop={true}
            className={ classes.video }>
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

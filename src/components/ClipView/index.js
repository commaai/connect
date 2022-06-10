import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, IconButton } from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';

import DriveVideo from '../DriveVideo';
import Timeline from '../Timeline';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { fetchEvents } from '../../actions/cached';
import { clipExit } from '../../actions/clip';

const styles = (theme) => ({
  window: {
    background: 'linear-gradient(to bottom, #30373B 0%, #272D30 10%, #1D2225 100%)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    margin: 18,
  },
  header: {},
  headerContext: {
    alignItems: 'center',
    justifyContent: 'space-between',
    display: 'flex',
    padding: 12,
  },
  headerInfo: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 500,
    paddingLeft: 12,
  },
});

class ClipView extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      modal: null,
    };

    this.onResize = this.onResize.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, PrevState) {
    if (prevProps.currentSegment !== this.props.currentSegment && this.props.currentSegment) {
      this.props.dispatch(fetchEvents(this.props.currentSegment));
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes, dongleId, zoom } = this.props;
    const viewerPadding = this.state.windowWidth < 768 ? 12 : 32

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <div className={classes.window} >
          <div className={classes.header}>
            <div className={classes.headerContext}>
              <IconButton onClick={ () => this.props.dispatch(clipExit()) }>
                <CloseIcon />
              </IconButton>
              <div className={ classes.headerInfo }>
                Create a clip
              </div>
              <IconButton onClick={ () => this.setState({ modal: 'help' }) }>
                <HelpOutlineIcon />
              </IconButton>
            </div>
            <Timeline className={classes.headerTimeline} thumbnailsVisible={ true } hasClip />
          </div>
          <div style={{ padding: viewerPadding }}>
            <DriveVideo />
          </div>
        </div>
      </>
    );
  }
}

const stateToProps = Obstruction({
  currentSegment: 'currentSegment',
  dongleId: 'dongleId',
  zoom: 'zoom',
  clip: 'clip',
});

export default connect(stateToProps)(withStyles(styles)(ClipView));

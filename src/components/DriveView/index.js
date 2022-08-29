import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';

import { withStyles, IconButton, Typography } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';
import CloseIcon from '@material-ui/icons/Close';

import Media from './Media';
import Timeline from '../Timeline';

import { selectRange } from '../../actions';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { filterRegularClick } from '../../utils';

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

class DriveView extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
    };

    this.close = this.close.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  close() {
    this.props.dispatch(selectRange(null, null));
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes, dongleId, zoom, routes } = this.props;
    const viewerPadding = this.state.windowWidth < 768 ? 12 : 32

    const viewEndTime = fecha.format(new Date(zoom.end), 'HH:mm');
    const startTime = fecha.format(new Date(zoom.start), 'MMM D @ HH:mm');
    let headerText = `${startTime} - ${viewEndTime}`;
    if (this.state.windowWidth >= 640) {
      const startDay = fecha.format(new Date(zoom.start), 'dddd');
      headerText = startDay + " " + headerText;
    }
    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <div className={classes.window} >
          <div className={classes.header}>
            <div className={classes.headerContext}>
              <IconButton aria-label="Go Back" onClick={ () => window.history.back() }>
                <KeyboardBackspaceIcon />
              </IconButton>
              <div className={ classes.headerInfo }>
                { headerText }
              </div>
              <IconButton onClick={ filterRegularClick(this.close) } aria-label="Close" href={ `/${dongleId}` }>
                <CloseIcon />
              </IconButton>
            </div>
            <Timeline className={classes.headerTimeline} thumbnailsVisible={ true } hasRuler />
          </div>
          <div style={{ padding: viewerPadding }}>
            { Boolean(routes && routes.length === 0) ?
              <Typography>Route does not exist.</Typography> :
              <Media />
            }
          </div>
        </div>
      </>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  routes: 'routes',
  zoom: 'zoom',
});

export default connect(stateToProps)(withStyles(styles)(DriveView));

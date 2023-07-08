import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import dayjs from 'dayjs';

import { withStyles, IconButton, Typography } from '@material-ui/core';

import { selectRange } from '../../actions';
import Colors from '../../colors';
import { ArrowBackBold, CloseBold } from '../../icons';
import { filterRegularClick } from '../../utils';
import ResizeHandler from '../ResizeHandler';

import Media from './Media';
import Timeline from '../Timeline';

const styles = () => ({
  window: {
    background: 'linear-gradient(to bottom, #30373B 0%, #272D30 10%, #1D2225 100%)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    margin: 18,
  },
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

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  close() {
    this.props.dispatch(selectRange(null, null));
  }

  render() {
    const { classes, dongleId, zoom, routes } = this.props;
    const { windowWidth } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const viewEndTime = dayjs(zoom.end).format('HH:mm');
    const startTime = dayjs(zoom.start).format('MMM D @ HH:mm');
    let headerText = `${startTime} - ${viewEndTime}`;
    if (windowWidth >= 640) {
      const startDay = dayjs(zoom.start).format('dddd');
      headerText = `${startDay} ${headerText}`;
    }

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <div className={classes.window}>
          <div>
            <div className={classes.headerContext}>
              <IconButton aria-label="Go Back" onClick={ () => window.history.back() }>
                <ArrowBackBold />
              </IconButton>
              <div className={ classes.headerInfo }>
                { headerText }
              </div>
              <IconButton
                onClick={ filterRegularClick(this.close) }
                aria-label="Close"
                href={ `/${dongleId}` }
              >
                <CloseBold />
              </IconButton>
            </div>
            <Timeline className={classes.headerTimeline} thumbnailsVisible hasRuler />
          </div>
          <div style={{ padding: viewerPadding }}>
            { (routes && routes.length === 0)
              ? <Typography>Route does not exist.</Typography>
              : <Media /> }
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

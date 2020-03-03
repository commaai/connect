import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import {
  withStyles,
  Grid,
  Slide,
  Paper,
  Typography,
  IconButton,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';

import AnnotationTabs from './AnnotationTabs';
import Media from './Media';
import Timeline from '../Timeline';
import TimeDisplay from '../TimeDisplay';
import AnnotationsFooter from './footer';

import { selectRange } from '../../actions';
import { DeviceType } from '../../defs/segments';

const styles = (theme) => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    width: '100vw',
    overflowY: 'scroll',
    paddingLeft: 12
  },
  header: {},
  headerContext: {
    alignItems: 'center',
    display: 'flex',
    padding: 12,
    paddingLeft: 18,
    paddingRight: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 700,
    paddingLeft: 12,
  },
  headerActions: {
    marginLeft: 'auto',
  },
  headerTimeline: {},
  largeViewer: {
    padding: theme.spacing.unit * 4,
  },
  videoHalf: {
    marginRight: 10
  },
  footer: {
    alignItems: 'center',
    background: 'linear-gradient(to bottom, #30373B 0%, #272D30 10%, #1D2225 100%)',
    display: 'flex',
    width: '100%',
  },
  annotations: {
    height: '100%',
  },
});

class Annotations extends Component {
  constructor(props) {
    super(props);

    this.close = this.close.bind(this);
  }

  close() {
    this.props.dispatch(selectRange(null, null));
  }

  renderAnnotationsElement = (visibleSegment) => (
    <AnnotationTabs segment={visibleSegment} />
  );

  renderLargeScreen = (classes, visibleSegment) => (
    <div className={classes.largeViewer}>
      <Grid container wrap="nowrap">
        <Grid className={classes.videoHalf} container wrap="nowrap" direction="column" alignItems="center">
          <Media />
          <TimeDisplay isThin />
        </Grid>
        <Grid container className={classes.annotations}>
          { visibleSegment && this.renderAnnotationsElement(visibleSegment) }
        </Grid>
      </Grid>
    </div>
  );

  renderSmallScreen = (classes, visibleSegment) => (
    <div className={classes.viewer}>
      <Grid container direction="column" alignItems="center">
        <Grid container wrap="nowrap" direction="column" alignItems="center">
          <Media />
          <TimeDisplay isThin />
        </Grid>
        <Grid container className={classes.annotations}>
          { visibleSegment && this.renderAnnotationsElement(visibleSegment) }
        </Grid>
      </Grid>
    </div>
  );

  render() {
    const {
      classes,
      device,
      loop,
      currentSegment,
      nextSegment,
      start
    } = this.props;
    const visibleSegment = (currentSegment || nextSegment);
    const routeName = visibleSegment ? visibleSegment.route : 'Nothing visible';
    // const shortName = routeName.split('|')[1];
    let annotations;
    if (screen.width < 850) {
      console.log('rendering small screen');
      annotations = this.renderSmallScreen(classes, visibleSegment);
    } else {
      console.log('rendering large screen');
      annotations = this.renderLargeScreen(classes, visibleSegment);
    }

    return (
      <div className={classes.base}>
        <div className={classes.header}>
          <div className={classes.headerContext}>
            <Typography className={classes.headerTitle}>
              { this.props.device.alias }
            </Typography>
          </div>
          <Timeline
            className={classes.headerTimeline}
            zoomed
            colored
            hasThumbnails
            hasRuler
            hasGradient
            tooltipped
            dragSelection
          />
        </div>
        {annotations}
        <div className={classes.footer}>
          <AnnotationsFooter segment={visibleSegment} loop={loop} start={start} />
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
  nextSegment: 'workerState.nextSegment',
  device: 'workerState.device',
  loop: 'workerState.loop',
  start: 'workerState.start'
});

export default connect(stateToProps)(withStyles(styles)(Annotations));

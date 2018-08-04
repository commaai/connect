import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Grid from '@material-ui/core/Grid';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import Paper from '@material-ui/core/Paper';

import CloseIcon from '@material-ui/icons/Close';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';

import AnnotationTabs from './tabs';
import EonUpsell from './eonUpsell';
import Media from './media';
import Timeline from '../Timeline';
import AnnotationsFooter from './footer';

import { selectRange } from '../../actions';
import { DeviceType } from '../../defs/segments';

const styles = theme => {
  return {
    base: {
      background: 'linear-gradient(to bottom, #30373B 0%, #272D30 10%, #1D2225 100%)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      margin: 24,
    },

    header: {},
    headerTitle: {
      alignItems: 'center',
      display: 'flex',
      padding: 12,
      paddingLeft: 18,
      paddingRight: 24,
    },
    headerTimeline: {},
    viewer: {
      padding: theme.spacing.unit * 4,
    },

    annotationsViewerHeaderName: {
      fontSize: 22,
      fontWeight: 700,
      paddingLeft: 12,
    },
    annotationsViewerHeaderClose: {
      marginLeft: 'auto',
    }
  };
};

class Annotations extends Component {
  constructor (props) {
    super(props);

    this.close = this.close.bind(this);
  }

  close () {
    this.props.dispatch(selectRange(null, null));
  }

  render () {
    const { classes, device } = this.props;
    let visibleSegment = (this.props.currentSegment || this.props.nextSegment);
    let routeName = visibleSegment ? visibleSegment.route : 'Nothing visible';
    let shortName = routeName.split('|')[1];
    return (
      <div className={ classes.base }>
        <div className={ classes.header }>
          <div className={ classes.headerTitle }>
            <IconButton aria-label='Go Back' onClick={ () => window.history.back() } >
              <KeyboardBackspaceIcon />
            </IconButton>
            <Typography className={ classes.annotationsViewerHeaderName }>
              { this.props.device.alias }
            </Typography>
            <IconButton onClick={ this.close } aria-label='Close' className={ classes.annotationsViewerHeaderClose }>
              <CloseIcon />
            </IconButton>
          </div>
          <Timeline
            className={ classes.headerTimeline }
            zoomed colored hasThumbnails hasRuler hasGradient tooltipped dragSelection />
        </div>
        <div className={ classes.viewer }>
          <Grid container spacing={ 32 }>
            <Grid item xs={ 6 }>
              { visibleSegment && this.renderAnnotationsElement(visibleSegment) }
            </Grid>
            <Grid item xs={ 6 }>
              <Media />
            </Grid>
          </Grid>
        </div>
      </div>
    );
    // { /* <AnnotationsFooter segment={ visibleSegment } /> */ }
  }

  renderAnnotationsElement(visibleSegment) {
    if (visibleSegment.deviceType === DeviceType.one) {
      return (<AnnotationTabs segment={ visibleSegment } />);
    } else {
      return (<EonUpsell hook='Unlock driving annotations with an EON' />);
    }
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
  nextSegment: 'workerState.nextSegment',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Annotations));

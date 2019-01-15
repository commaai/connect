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
import EonUpsell from './eonUpsell';
import Media from './Media';
import Timeline from '../Timeline';
import TimeDisplay from '../TimeDisplay';
import AnnotationsFooter from './footer';

import { selectRange } from '../../actions';
import { DeviceType } from '../../defs/segments';

const styles = theme => {
  return {
    base: {
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
    },
    window: {
      background: 'linear-gradient(to bottom, #30373B 0%, #272D30 10%, #1D2225 100%)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      overflowY: 'scroll',
      margin: 18,
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
    viewer: {
      padding: theme.spacing.unit * 4,
    },
    footer: {
      alignItems: 'center',
      background: 'linear-gradient(to bottom, #30373B 0%, #272D30 10%, #1D2225 100%)',
      display: 'flex',
      marginTop: 'auto',
      width: '100%',
    },
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
        <div className={ classes.window }>
          <div className={ classes.header }>
            <div className={ classes.headerContext }>
              <IconButton aria-label='Go Back' onClick={ () => window.history.back() } >
                <KeyboardBackspaceIcon />
              </IconButton>
              <Typography className={ classes.headerTitle }>
                { this.props.device.alias }
              </Typography>
              <div className={ classes.headerActions }>
                <IconButton onClick={ this.close } aria-label='Close'>
                  <CloseIcon />
                </IconButton>
              </div>
            </div>
            <Timeline className={ classes.headerTimeline }
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
        <div className={ classes.footer }>
          <AnnotationsFooter segment={ visibleSegment } />
        </div>
      </div>
    );
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

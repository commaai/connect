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
import VideoPreview from '../video';
import EonUpsell from './eonUpsell';
import Media from './media';
import AnnotationsFooter from './footer';
import Minimap from '../minimap';
import LogStream from '../logstream';
import { selectRange } from '../../actions';
import { DeviceType } from '../../defs/segments';

const styles = theme => {
  return {
    base: {
      background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexGrow: 1,
      minWidth: '100%',
    },
    header: {},
    headerTitle: {},
    headerSeeker: {},
    viewer: {
      padding: theme.spacing.unit * 4,
    },

    annotationsViewerHeader: {
      alignItems: 'center',
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

class AnnotationsView extends Component {
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
    let titleElement = routeName;
    if (visibleSegment) {
      let shortName = routeName.split('|')[1];
      titleElement = (
        <Grid container className={ classes.annotationsViewerHeader }>
          <IconButton aria-label='Go Back' onClick={ () => window.history.back() } >
            <KeyboardBackspaceIcon />
          </IconButton>
          <Typography className={ classes.annotationsViewerHeaderName }>
            { shortName } { this.props.device && '- ' + this.props.device.alias }
          </Typography>
          <IconButton onClick={ this.close } aria-label='Close' className={ classes.annotationsViewerHeaderClose }>
            <CloseIcon />
          </IconButton>
        </Grid>
      );
    }
    return (
      <div className={ classes.base }>
        <div className={ classes.header }>
          <div className={ classes.headerTitle }>
            { titleElement }
          </div>
          <div className={ classes.headerSeeker }>
            <Minimap gradient zoomed colored thumbnailed dragSelection />
          </div>
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

export default connect(stateToProps)(withStyles(styles)(AnnotationsView));

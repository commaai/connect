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
    root: {
      margin: theme.spacing.unit * 5,
      borderRadius: theme.spacing.unit,
      background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)'
    },
    paddedContainer: {
      padding: theme.spacing.unit * 4,
    },
    title: {
      margin: 20
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
    let visibleSegment = (this.props.currentSegment || this.props.nextSegment);
    let routeName = visibleSegment ? visibleSegment.route : 'Nothing visible';
    let titleElement = routeName;
    if (visibleSegment) {
      let shortName = routeName.split('|')[1];
      titleElement = (
        <React.Fragment>
          <Grid container className={ this.props.classes.annotationsViewerHeader }>
            <IconButton aria-label='Go Back' onClick={ () => window.history.back() } >
              <KeyboardBackspaceIcon />
            </IconButton>
            <Typography className={ this.props.classes.annotationsViewerHeaderName }>
              { shortName } { this.props.device && this.props.device.alias && ('- ' + this.props.device.alias) }
            </Typography>
            <IconButton onClick={ this.close } aria-label='Close' className={ this.props.classes.annotationsViewerHeaderClose }>
              <CloseIcon />
            </IconButton>
          </Grid>
          {/*<a href={ 'https://community.comma.ai/cabana/?route=' + routeName} target='_blank'>
            Open in Cabana!
          </a>*/}
        </React.Fragment>
      );
    }
    return (
      <Grid container>
        <Grid item xs={12}>
          <Paper className={ this.props.classes.root }>
            <Grid container>
              <Grid item xs={12}>
                <Typography variant='title' className={ this.props.classes.title } >
                  { titleElement }
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Minimap gradient zoomed colored thumbnailed dragSelection />
              </Grid>
            </Grid>
            <Grid container spacing={ 32 } className={ this.props.classes.paddedContainer } >
              { visibleSegment && this.renderAnnotationsElement(visibleSegment) }
              <Grid item xs={6}>
                <Media />
              </Grid>
              <Grid item xs={12}>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        <Grid item xs={12}>
          <AnnotationsFooter segment={ visibleSegment } />
        </Grid>
      </Grid>
    );
  }

  renderAnnotationsElement(visibleSegment) {
    var annotElement = null;
    if (visibleSegment.deviceType === DeviceType.one) {
      annotElement = <AnnotationTabs segment={ visibleSegment } />;
    } else {
      annotElement = <EonUpsell hook='Unlock driving annotations with an EON' />;
    }

    return (
      <Grid item xs={6}>
        { annotElement }
      </Grid>
    );
  }
}

const stateToProps = Obstruction({
  currentSegment: 'workerState.currentSegment',
  nextSegment: 'workerState.nextSegment',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(AnnotationsView));

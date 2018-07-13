import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';

import { withStyles } from '@material-ui/core/styles';
import Badge from '@material-ui/core/Badge';
import Button from '@material-ui/core/Button';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';
import Pencil from '@material-ui/icons/Edit';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';

import DeviceList from './deviceList';
import RouteList from './routes';
import Timelineworker from '../../timeline';
import { selectRange, selectDevice } from '../../actions';
import { filterEvent } from '../annotations/common';

// 1 second on either end
const ZOOM_BUFFER = 1000;

const styles = theme => {
  return {
    margin: {
      margin: theme.spacing.unit * 2
    },
    floatingBox: {
      padding: theme.spacing.unit * 2,
      borderRadius: theme.spacing.unit
    },
    badge: {

    },
  };
};

class Dashboard extends Component {
  constructor (props) {
    super(props);

    this.state = {
      editingDevice: null,

    };

    this.handleDeviceSelected = this.handleDeviceSelected.bind(this);
    this.goToAnnotation = this.goToAnnotation.bind(this);
  }

  handleDeviceSelected (dongleId) {
    this.props.dispatch(selectDevice(dongleId));
  }

  goToAnnotation (segment) {
    let startTime = segment.startTime - ZOOM_BUFFER;
    let endTime = segment.startTime + segment.duration + ZOOM_BUFFER;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  render() {
    let firstAnnotationSegment = null;
    let newAnnotations = this.props.segments.reduce((count, segment) => {
      let segCount = segment.events.filter(filterEvent).reduce((memo, event) => event.id ? memo : memo + 1, 0);
      if (!firstAnnotationSegment && segCount > 0) {
        firstAnnotationSegment = segment;
      }
      return count + segCount
    }, 0);

    return (
      <div className={ this.props.classes.margin }>
        <Grid container spacing={ 24 } >
          <Grid item xs={ 6 } >
            <Paper className={ this.props.classes.floatingBox }>
              <Typography variant='headline'>
                Your Devices
              </Typography>
              <DeviceList
                selectedDevice={ this.props.selectedDongleId }
                handleDeviceSelected={ this.handleDeviceSelected } />
            </Paper>
          </Grid>
          <Grid item xs={ 6 } >
            <Paper className={ this.props.classes.floatingBox }>
              <Typography variant='headline'>
                Recent Drives
                { this.props.device &&
                  <span className={ this.props.classes.selectedDeviceText }>: { this.props.device.alias || this.props.device.device_type }</span> }
              </Typography>
              <Grid item xs={ 12 } style={{ textAlign: 'center' }} >
                { newAnnotations > 0 && this.renderAnnotateButton(firstAnnotationSegment, newAnnotations) }
              </Grid>
              <RouteList />
            </Paper>
          </Grid>
        </Grid>
        <Grid
          className={ this.props.classes.margin }
          container
          justify='center'
          alignContent='center'
          alignItems='center'
          >
        </Grid>
      </div>
    );
  }

  renderAnnotateButton (segment, count) {
    return (
      <Badge style={{ width: '50%' }} color='secondary' badgeContent={ count }>
        <Button fullWidth variant='outlined' size='large' onClick={ partial(this.goToAnnotation, segment) }>
          Begin Annotating
        </Button>
      </Badge>
    )
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  selectedDongleId: 'workerState.dongleId',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));

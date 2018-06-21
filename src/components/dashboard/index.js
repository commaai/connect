import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import { push } from 'react-router-redux'

import { withStyles } from '@material-ui/core/styles';
import Badge from '@material-ui/core/Badge';
import Button from '@material-ui/core/Button';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';
import Slide from '@material-ui/core/Slide';
import Typography from '@material-ui/core/Typography';

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
    expansion: {
      backgroundColor: theme.palette.grey[800]
    },
    expanded: {
      minHeight: 'initial',
      margin: '0px 0',
      backgroundColor: theme.palette.grey[999]
    },
    badge: {

    }
  };
};

class Dashboard extends Component {
  constructor (props) {
    super(props);

    this.renderDevice = this.renderDevice.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.goToAnnotation = this.goToAnnotation.bind(this);
  }

  handleChange (dongleId) {
    this.props.dispatch(selectDevice(dongleId));
  }

  goToAnnotation (segment) {
    let startTime = segment.startTime - ZOOM_BUFFER;
    let endTime = segment.startTime + segment.duration + ZOOM_BUFFER;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  render() {
    var devices = this.props.devices;
    var dongleId = this.props.selectedDevice;
    var found = !dongleId;

    devices.forEach(function (device) {
      if (device.dongle_id === dongleId) {
        found = true;
      }
    });

    if (!found) {
      devices.push({
        dongle_id: dongleId,
        shared: true
      });
    }

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
          <Grid item xs={ 12 } style={{ textAlign: 'center' }} >
            { newAnnotations > 0 && this.renderAnnotateButton(firstAnnotationSegment, newAnnotations) }
          </Grid>
          <Grid item xs={ 6 } >
            <Paper className={ this.props.classes.floatingBox }>
              <Typography variant='headline'>
                Your Devices
              </Typography>
              { this.props.devices.map(this.renderDevice) }
            </Paper>
          </Grid>
          <Grid item xs={ 6 } >
            <Paper className={ this.props.classes.floatingBox }>
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

  renderDevice (device) {
    return (
      <ExpansionPanel
        classes={{
          expanded: this.props.classes.expanded
        }}
        key={ device.dongle_id }
        expanded={ this.props.selectedDevice === device.dongle_id }
        onChange={ partial(this.handleChange, device.dongle_id) }
        className={ this.props.classes.expansion }
        >
        <ExpansionPanelSummary>
          <Typography>{ (device.alias && device.alias + ' (' + device.dongle_id + ')') || device.dongle_id }</Typography>
        </ExpansionPanelSummary>
      </ExpansionPanel>
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
  devices: 'workerState.devices',
  selectedDevice: 'workerState.dongleId'
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));

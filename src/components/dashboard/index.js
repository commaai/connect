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
    base: {
      background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
      display: 'flex',
      overflow: 'hidden',
      flexGrow: 1,
      minWidth: '100%',
    },
    deviceList: {
      background: 'linear-gradient(180deg, #1B2023 0%, #111516 100%)',
      minWidth: 300,
    },
    deviceListHeader: {
      alignItems: 'center',
      padding: 24,
    },
    routeList: {
      display: 'flex',
      flexGrow: 1,
      flexDirection: 'column',
    },
    annotateButton: {
      background: '#fff',
      borderRadius: 30,
      color: '#404B4F',
      height: 50,
      textTransform: 'none',
      width: '80%',
      '&:hover': {
        background: '#fff',
        color: '#404B4F',
      }
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
    if (segment == null) { return; }
    let startTime = segment.startTime - ZOOM_BUFFER;
    let endTime = segment.startTime + segment.duration + ZOOM_BUFFER;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  render() {
    const { classes } = this.props;
    let firstAnnotationSegment = null;
    let newAnnotations = this.props.segments.reduce((count, segment) => {
      let segCount = segment.events.filter(filterEvent).reduce((memo, event) => event.id ? memo : memo + 1, 0);
      if (!firstAnnotationSegment && segCount > 0) {
        firstAnnotationSegment = segment;
      }
      return count + segCount
    }, 0);

    return (
      <div className={ classes.base }>
        <div className={ classes.deviceList }>
          <div className={ classes.deviceListHeader }>
            <Button
              size='large'
              variant='outlined'
              className={ this.props.classes.annotateButton }
              onClick={ partial(this.goToAnnotation, firstAnnotationSegment) }>
              Annotate
            </Button>
          </div>
          <DeviceList
            selectedDevice={ this.props.selectedDongleId }
            handleDeviceSelected={ this.handleDeviceSelected } />
        </div>
        <div className={ classes.routeList }>
          <RouteList />
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  selectedDongleId: 'workerState.dongleId',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));

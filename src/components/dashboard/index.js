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
      margin: theme.spacing.unit * 2,
      marginLeft: 48,
      marginRight: 48,
    },
    floatingBox: {
      background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
      padding: theme.spacing.unit * 2,
      borderRadius: theme.spacing.unit
    },
    deviceListHeader: {
      alignItems: 'center',
      padding: 12,
      paddingLeft: 24,
      paddingRight: 24,
    },
    deviceListHeaderName: {
      fontSize: 18,
      fontWeight: 500,
    },
    routeListHeaderButton: {
      background: 'linear-gradient(to bottom, rgb(82, 94, 102) 0%, rgb(64, 75, 79) 100%)',
      borderRadius: 30,
      color: '#fff',
    },
    routeListHeaderButtonBubble: {
      backgroundColor: '#DACA25',
      borderRadius: 20,
      color: '#fff',
      fontWeight: 500,
      minWidth: 40,
      height: 28,
      textShadow: '0 1px 4px rgba(0,0,0,.35)',
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
    this.renderAnnotateButton = this.renderAnnotateButton.bind(this);
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
          <Grid item xs={ 6 } lg={ 3 } >
            <Paper className={ this.props.classes.floatingBox }>
              <Grid container className={ this.props.classes.deviceListHeader }>
                <Typography variant='headline' className={ this.props.classes.deviceListHeaderName }>
                  Your Devices
                </Typography>
              </Grid>
              <DeviceList
                selectedDevice={ this.props.selectedDongleId }
                handleDeviceSelected={ this.handleDeviceSelected } />
            </Paper>
          </Grid>
          <Grid item xs={ 6 } lg={ 9 } >
            <Paper className={ this.props.classes.floatingBox }>
              <RouteList
                renderAnnotateButton={ partial(this.renderAnnotateButton, firstAnnotationSegment, newAnnotations) } />
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
      <Badge badgeContent={ count } style={{ width: '100%' }} classes={{ badge: this.props.classes.routeListHeaderButtonBubble }}>
        <Button fullWidth variant='outlined' size='large' disabled={ segment == null } onClick={ partial(this.goToAnnotation, segment) } className={ this.props.classes.routeListHeaderButton }>
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

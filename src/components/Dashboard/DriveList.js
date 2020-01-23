import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';

import {
  withStyles,
  Typography,
  Grid,
  Menu,
  MenuItem,
  ListItem,
  IconButton,
} from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';

import { filterEvent } from '../../utils';
import { selectRange } from '../../actions';
import DeviceSettingsModal from './DeviceSettingsModal';
import DriveListItem from './DriveListItem';

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = (theme) => ({
  header: {
    alignItems: 'center',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    padding: 16,
    paddingLeft: 48,
    paddingRight: 60,
  },
  headerLabel: {
    cursor: 'default',
    textTransform: 'uppercase',
  },
  drives: {
    height: '100%',
    margin: 0,
    overflowY: 'scroll',
    padding: 16,
    paddingLeft: 24,
    paddingRight: 24,
  },
  zeroState: {
    padding: '16px 48px',
  },
  settingsArea: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  settingsButton: {
    border: '1px solid #272D30'
  },
  settingsButtonIcon: {
    color: '#272D30',
  },
});

class DriveList extends Component {
  constructor(props) {
    super(props);

    this.goToAnnotation = this.goToAnnotation.bind(this);
    this.filterShortDrives = this.filterShortDrives.bind(this);
    this.renderDriveListHeader = this.renderDriveListHeader.bind(this);
    this.renderDriveListSettings = this.renderDriveListSettings.bind(this);
    this.handleClickedSettings = this.handleClickedSettings.bind(this);
    this.handleClosedSettings = this.handleClosedSettings.bind(this);
    this.handleOpenedSettingsModal = this.handleOpenedSettingsModal.bind(this);
    this.handleCanceledSettings = this.handleCanceledSettings.bind(this);
    this.handleClosedSettingsModal = this.handleClosedSettingsModal.bind(this);

    this.state = {
      anchorEl: null,
      showDeviceSettingsModal: false
    };
  }

  componentWillReceiveProps(props) {
    if (props.device && !this.state.deviceAliasSaved) {
      this.setState({ deviceAliasSaved: props.device.alias });
    }
  }

  filterShortDrives(ride) {
    return ride.duration > 60000;
  }

  goToAnnotation(segment) {
    const startTime = segment.startTime - this.props.zoomBuffer;
    const endTime = segment.startTime + segment.duration + this.props.zoomBuffer;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  handleClickedSettings(event) {
    this.setState({ anchorEl: event.currentTarget });
  }

  handleClosedSettings() {
    this.setState({ anchorEl: null });
  }

  handleOpenedSettingsModal(device) {
    this.setState({ showDeviceSettingsModal: true });
  }

  handleClosedSettingsModal() {
    this.setState({ showDeviceSettingsModal: false });
  }

  handleCanceledSettings() {
    this.setState({
      anchorEl: null,
      showDeviceSettingsModal: false,
    });
  }

  handleClose() {
    this.setState({
      showPicker: false
    });
  }

  render() {
    const { classes, device, segments } = this.props;

    if (!device) {
      return [];
    }

    const driveList = [];
    let lastEnd = 0;
    let lastSegmentEnd = 0;
    let curRideChunk = null;
    this.props.segments.forEach((segment) => {
      if (!curRideChunk || segment.startTime - lastEnd > MIN_TIME_BETWEEN_ROUTES) {
        curRideChunk = {
          segments: 0,
          startTime: segment.startTime,
          offset: segment.offset,
          duration: 0,
          annotations: 0,
          startCoord: segment.startCoord,
          endCoord: segment.endCoord,
          distanceMiles: segment.distanceMiles,
        };
        driveList.unshift(curRideChunk);
        lastSegmentEnd = segment.startTime;
      }
      curRideChunk.duration += segment.startTime - lastSegmentEnd;
      curRideChunk.duration += segment.duration;
      lastSegmentEnd = segment.startTime + segment.duration;
      curRideChunk.segments++;
      lastEnd = segment.startTime + segment.duration;
      curRideChunk.annotations += segment.events.filter(filterEvent)
        .reduce((memo, event) => (event.id ? memo : memo + 1), 0);
    });

    return (
      <>
        { this.renderDriveListHeader() }
        { driveList.length === 0 && this.renderZeroRides() }
        <ul className={classes.drives}>
          { driveList.filter(this.filterShortDrives).map((drive) => (
            <DriveListItem
              key={drive.startTime}
              drive={drive}
              deviceAlias={device.alias}
            />
          ))}
        </ul>
      </>
    );
  }

  renderZeroRides() {
    const { classes } = this.props;
    let zeroRidesEle = null;
    const { device, segmentData } = this.props;

    if (device && (segmentData === null || typeof segmentData.segments === 'undefined')) {
      zeroRidesEle = <Typography>Loading...</Typography>;
    } else if (segmentData && segmentData.segments && segmentData.segments.length === 0) {
      zeroRidesEle = (
        <Typography>
Looks like you haven
          {'\''}
t driven in the selected time range.
        </Typography>
      );
    }

    return (
      <div className={classes.zeroState}>
        <Grid container>
          { zeroRidesEle }
        </Grid>
      </div>
    );
  }

  renderDriveListHeader() {
    const { classes, device } = this.props;
    return (
      <div className={classes.header}>
        <Grid container alignItems="center">
          <Grid item xs={4}>
            <Typography variant="title">
              { device.alias }
              {' '}
Drives
            </Typography>
          </Grid>
          <Grid item xs={2}>
            <Typography variant="caption" className={classes.headerLabel}>
              Duration
            </Typography>
          </Grid>
          <Grid item xs={2}>
            <Typography variant="caption" className={classes.headerLabel}>
              Origin
            </Typography>
          </Grid>
          <Grid item xs={2}>
            <Typography variant="caption" className={classes.headerLabel}>
              Destination
            </Typography>
          </Grid>
          <Grid item xs={1}>
            <Typography variant="caption" className={classes.headerLabel}>
              Distance
            </Typography>
          </Grid>
          <Grid item xs={1} className={classes.settingsArea}>
            { ((device && !device.shared && device.is_owner) || this.props.isSuperUser)
              && this.renderDriveListSettings()}
          </Grid>
        </Grid>
      </div>
    );
  }

  renderDriveListSettings() {
    const { classes, device } = this.props;
    const { anchorEl } = this.state;
    const open = Boolean(anchorEl);
    return (
      <>
        <IconButton
          className={classes.settingsButton}
          onClick={partial(this.handleOpenedSettingsModal, device)}
        >
          <SettingsIcon className={classes.settingsButtonIcon} />
        </IconButton>
        <DeviceSettingsModal
          isOpen={this.state.showDeviceSettingsModal}
          onClose={this.handleClosedSettingsModal}
          onCancel={this.handleCanceledSettings}
        />
      </>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  segmentData: 'workerState.segmentData',
  start: 'workerState.start',
  device: 'workerState.device',
  isSuperUser: 'workerState.profile.superuser',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));

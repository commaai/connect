import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import Colors from '../../colors';

import { withStyles, Typography, Grid, IconButton } from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';

import DeviceSettingsModal from './DeviceSettingsModal';
import DriveListItem from './DriveListItem';
import ResizeHandler from '../ResizeHandler';
import { deviceTypePretty } from '../../utils'

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = (theme) => ({
  header: {
    alignItems: 'center',
    borderBottom: `1px solid ${Colors.white10}`,
    padding: '16px 48px',
    flexGrow: 0,
  },
  drivesTable: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  drives: {
    margin: 0,
    padding: '16px 12px',
    flex: '1',
  },
  zeroState: {
    padding: '16px 48px',
    flex: '0',
  },
  settingsArea: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  settingsButton: {
    position: 'relative',
    left: 12,
    border: `1px solid ${Colors.white40}`
  },
  settingsButtonIcon: {
    color: Colors.white40,
  },
});

class DriveList extends Component {
  constructor(props) {
    super(props);

    this.filterShortDrives = this.filterShortDrives.bind(this);
    this.renderDriveListHeader = this.renderDriveListHeader.bind(this);
    this.renderDriveListSettings = this.renderDriveListSettings.bind(this);
    this.handleClickedSettings = this.handleClickedSettings.bind(this);
    this.handleClosedSettings = this.handleClosedSettings.bind(this);
    this.handleOpenedSettingsModal = this.handleOpenedSettingsModal.bind(this);
    this.handleCanceledSettings = this.handleCanceledSettings.bind(this);
    this.handleClosedSettingsModal = this.handleClosedSettingsModal.bind(this);
    this.onResize = this.onResize.bind(this);

    this.state = {
      anchorEl: null,
      showDeviceSettingsModal: false,
      windowWidth: window.innerWidth,
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

  onResize(windowWidth) {
    this.setState({ windowWidth });
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
    });

    return (
      <>
        { this.renderDriveListHeader() }
        <div className={ classes.drivesTable }>
          { driveList.length === 0 && this.renderZeroRides() }
          <ul className={classes.drives}>
            { driveList.filter(this.filterShortDrives).map((drive) => (
              <DriveListItem key={drive.startTime} drive={drive} windowWidth={ this.state.windowWidth }/>
            ))}
          </ul>
        </div>
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
      zeroRidesEle = ( <Typography>Looks like you haven{'\''}t driven in the selected time range.</Typography> );
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
    const isMedium = this.state.windowWidth < 768;
    const isSmall = this.state.windowWidth < 640;
    const deviceStyle = isSmall ?
      { flexGrow: 0, maxWidth: '90%', flexBasis: '90%' } :
      { flexGrow: 0, maxWidth: 'calc(26% + 12px)', flexBasis: 'calc(26% + 12px)', marginLeft: -12 };
    return (
      <div className={classes.header}>
        <ResizeHandler onResize={ this.onResize } />
        <Grid container alignItems="center">
          <div style={ deviceStyle }>
            <Typography variant="title">{ device.alias || deviceTypePretty(device.device_type) }</Typography>
          </div>
          { !isSmall && <>
            <div style={{ flexGrow: 0, maxWidth: '14%', flexBasis: '14%' }}>
              <Typography variant="subheading">Duration</Typography>
            </div>
            <div style={{ flexGrow: 0, maxWidth: '22%', flexBasis: '22%' }}>
              <Typography variant="subheading">Origin</Typography>
            </div>
            <div style={{ flexGrow: 0, maxWidth: '22%', flexBasis: '22%' }}>
              <Typography variant="subheading">Destination</Typography>
            </div>
            <div style={{ flexGrow: 0, maxWidth: '10%', flexBasis: '10%' }}>
              <Typography variant="subheading">{ isMedium ? 'Dist.' : 'Distance' }</Typography>
            </div>
          </> }
          <div className={classes.settingsArea} style={{ flexGrow: 0, maxWidth: '6%', flexBasis: '6%' }}>
            { device && ((!device.shared && device.is_owner) || this.props.isSuperUser)
              && this.renderDriveListSettings()}
          </div>
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

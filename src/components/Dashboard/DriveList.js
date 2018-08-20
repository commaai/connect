import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';
import Raven from 'raven-js';

import {
  withStyles,
  Typography,
  Grid,
  Menu,
  MenuItem,
  ListItem,
  IconButton,
  Button,
  Paper,
  Modal,
  TextField,
} from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';

import { filterEvent } from '../../utils';
import { selectRange } from '../../actions';
import * as API from '../../api';
import Timelineworker from '../../timeline';
import GeocodeApi from '../../api/geocode';
import DriveListItem from './DriveListItem';

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = theme => {
  return {
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
    modal: {
      position: 'absolute',
      padding: theme.spacing.unit * 2,
      width: theme.spacing.unit * 50,
      margin: '0 auto',
      left: '50%',
      top: '40%',
      transform: 'translate(-50%, -50%)'
    },
  }
};

class DriveList extends Component {
  constructor (props) {
    super(props);

    this.goToAnnotation = this.goToAnnotation.bind(this);
    this.filterShortDrives = this.filterShortDrives.bind(this);
    this.renderDriveListHeader = this.renderDriveListHeader.bind(this);
    this.renderDriveListSettings = this.renderDriveListSettings.bind(this);
    this.handleClickedSettings = this.handleClickedSettings.bind(this);
    this.handleClosedSettings = this.handleClosedSettings.bind(this);
    this.handleOpenedSettingsModal= this.handleOpenedSettingsModal.bind(this);
    this.handleCanceledSettings= this.handleCanceledSettings.bind(this);
    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.handleAliasFieldKeyPress = this.handleAliasFieldKeyPress.bind(this);
    this.setDeviceAlias = this.setDeviceAlias.bind(this);

    this.state = {
      anchorEl: null,
      showDeviceSettings: false,
      editingDevice: null,
      deviceAlias: '',
      deviceAliasSaved: '',
      isWaitingForApi: false,
    }
  }

  componentDidMount () {
    this.setState({ deviceAliasSaved: this.props.device.alias })
  }

  filterShortDrives(ride) {
    return ride.duration >= 180000;
  }

  goToAnnotation (segment) {
    let startTime = segment.startTime - this.props.zoomBuffer;
    let endTime = segment.startTime + segment.duration + this.props.zoomBuffer;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  handleClickedSettings (event) {
    this.setState({ anchorEl: event.currentTarget });
  }

  handleClosedSettings () {
    this.setState({ anchorEl: null });
  }

  handleOpenedSettingsModal (device) {
    this.setState({ showDeviceSettings: true })
    if (this.state.editingDevice === device.dongle_id) {
      this.setState({ editingDevice: null });
    } else {
      this.setState({
        editingDevice: device.dongle_id,
        deviceAlias: this.state.deviceAliasSaved,
      });
    }
  }

  handleCanceledSettings () {
    this.setState({
      anchorEl: null,
      showDeviceSettings: false,
    })
  }

  handleClose () {
    this.setState({
      showPicker: false
    });
  }

  handleAliasChange (e) {
    this.setState({ deviceAlias: e.target.value });
  }

  handleAliasFieldKeyPress (dongle_id, e) {
    if (e.key === 'Enter' && !this.state.isWaitingForApi) {
      this.setDeviceAlias(dongle_id);
    }
  }

  async setDeviceAlias (dongle_id) {
    this.setState({ isWaitingForApi: true });
    try {
      const device = await API.setDeviceAlias(dongle_id, this.state.deviceAlias.trim());
      Timelineworker.updateDevice(device);
      this.setState({
        isWaitingForApi: false,
        editingDevice: null ,
        anchorEl: null,
        showDeviceSettings: false,
        deviceAliasSaved: this.state.deviceAlias,
      });
    } catch(e) {
      Raven.captureException(e);
      this.setState({ error: e.message, isWaitingForApi: false });
    }
  }

  render () {
    const { classes, device, segments } = this.props;
    const deviceAlias = this.state.deviceAliasSaved;
    var driveList = [];
    var lastEnd = 0;
    var lastSegmentEnd = 0;
    var curRideChunk = null;
    this.props.segments.forEach(function (segment) {
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
        .reduce((memo, event) => event.id ? memo : memo + 1, 0);
    });

    return (
      <React.Fragment>
        { this.renderDriveListHeader() }
        { driveList.length === 0 && this.renderZeroRides() }
        <ul className={ classes.drives }>
          { driveList.filter(this.filterShortDrives).map((drive) => {
              return (
                <DriveListItem
                  key={ drive.startTime }
                  drive={ drive }
                  deviceAlias={ deviceAlias } />
              )
            })
          }
        </ul>
      </React.Fragment>
    );
  }

  renderZeroRides() {
    const { classes } = this.props;
    var zeroRidesEle = null;
    let device = this.props.device;
    let hasDrivesInQuery = (device && device.last_segment_utc_millis !== null)
      && (device.last_segment_utc_millis >= this.props.start);

    if (hasDrivesInQuery) {
      zeroRidesEle = <Typography>Loading...</Typography>;
    } else {
      zeroRidesEle = <Typography>Looks like you haven{'\''}t driven in the selected time range.</Typography>
    }

    return (
      <div className={ classes.zeroState }>
        <Grid container>
          { zeroRidesEle }
        </Grid>
      </div>
    );
  }

  renderDriveListHeader() {
    const { classes, device } = this.props;
    const deviceAlias = this.state.deviceAliasSaved;
    return (
      <div className={ classes.header }>
        <Grid container alignItems='center'>
          <Grid item xs={ 4 }>
            <Typography variant='title'>
              { deviceAlias } Drives
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Duration
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Origin
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Destination
            </Typography>
          </Grid>
          <Grid item xs={ 1 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Distance
            </Typography>
          </Grid>
          <Grid item xs={ 1 } className={ classes.settingsArea }>
            { (!device.shared && (device.is_owner || this.props.isSuperUser)) &&
              this.renderDriveListSettings()
            }
          </Grid>
        </Grid>
      </div>
    )
  }

  renderDriveListSettings() {
    const { classes, device } = this.props;
    const { anchorEl } = this.state;
    const deviceAlias = this.state.deviceAliasSaved;
    const open = Boolean(anchorEl);
    return (
      <React.Fragment>
        <IconButton
          aria-owns={ open ? 'device-settings' : null }
          aria-haspopup='true'
          className={ classes.settingsButton }
          onClick={ this.handleClickedSettings }>
          <SettingsIcon className={ classes.settingsButtonIcon } />
        </IconButton>
        <Menu
          id='device-settings'
          open={ open }
          onClose={ this.handleClosedSettings }
          anchorEl={ anchorEl }
          anchorOrigin={ {
            vertical: 'top',
            horizontal: 'right',
          } }
          transformOrigin={ {
            vertical: 'top',
            horizontal: 'right',
          } }>
          <ListItem classes={ { root: classes.userMeta } } disableGutters>
            <div>
              <Typography variant='body2' paragraph>
                { deviceAlias }
              </Typography>
            </div>
          </ListItem>
          <MenuItem onClick={ partial(this.handleOpenedSettingsModal, device) }>Edit Device</MenuItem>
        </Menu>
        <Modal
          aria-labelledby='device-settings-modal'
          aria-describedby='device-settings-modal-description'
          open={ this.state.showDeviceSettings }
          onClose={ this.handleCanceledSettings }>
          <Paper className={ this.props.classes.modal }>
            <TextField
              id='device_alias'
              label="Device Name"
              className={ classes.textField }
              value={ this.state.deviceAlias }
              onChange={ this.handleAliasChange }
              onKeyPress={ partial(this.handleAliasFieldKeyPress, device.dongle_id) } />
            <div className={ this.props.classes.buttonGroup }>
              <Button variant='contained' onClick={ this.handleCanceledSettings }>
                Cancel
              </Button>
              &nbsp;
              <Button variant='contained' color='secondary' onClick={ partial(this.setDeviceAlias, device.dongle_id)  }>
                Save
              </Button>
            </div>
          </Paper>
        </Modal>
      </React.Fragment>
    )
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  start: 'workerState.start',
  devices: 'workerState.devices',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));

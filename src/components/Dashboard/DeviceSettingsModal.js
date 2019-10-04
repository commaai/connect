import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import Raven from 'raven-js';

import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import Divider from '@material-ui/core/Divider';
import IconButton from '@material-ui/core/IconButton';
import Modal from '@material-ui/core/Modal';
import Paper from '@material-ui/core/Paper';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';

import CheckIcon from '@material-ui/icons/Check';
import SaveIcon from '@material-ui/icons/Save';
import ShareIcon from '@material-ui/icons/Share';

import { devices as Devices } from '@commaai/comma-api';
import Timelineworker from '../../timeline';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)'
  },
  textField: {
  },
  buttonGroup: {
    textAlign: 'right'
  },
  form: {
    paddingTop: theme.spacing.unit,
    paddingBottom: theme.spacing.unit
  },
  formRow: {
    minHeight: 75
  },
  fabProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  wrapper: {
    margin: theme.spacing.unit,
    position: 'relative',
    display: 'inline-block'
  }
});

class DeviceSettingsModal extends Component {
  constructor(props) {
    super(props);

    this.state = {
      deviceAlias: '',
      loadingDeviceAlias: false,
      loadingDeviceShare: false,
      hasSavedAlias: false,
      shareEmail: ''
    };

    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.handleEmailChange = this.handleEmailChange.bind(this);
    this.callOnEnter = this.callOnEnter.bind(this);
    this.setDeviceAlias = this.setDeviceAlias.bind(this);
    this.shareDevice = this.shareDevice.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.device && nextProps.device.alias !== this.state.deviceAlias) {
      this.setState({ deviceAlias: nextProps.device.alias });
    }
  }

  handleAliasChange(e) {
    this.setState({
      deviceAlias: e.target.value,
      hasSavedAlias: e.target.value === this.props.device.dongle_id ? this.state.hasSavedAlias : false
    });
  }

  handleEmailChange(e) {
    this.setState({
      shareEmail: e.target.value,
      hasShared: false
    });
  }

  callOnEnter(method, e) {
    if (e.key === 'Enter') {
      method();
    }
  }

  async setDeviceAlias() {
    const { dongle_id } = this.props.device;

    if (this.state.loadingDeviceAlias) {
      return;
    }

    this.setState({
      loadingDeviceAlias: true,
      hasSavedAlias: false
    });
    try {
      const device = await Devices.setDeviceAlias(dongle_id, this.state.deviceAlias.trim());
      Timelineworker.updateDevice(device);
      this.setState({
        loadingDeviceAlias: false,
        hasSavedAlias: true
      });
    } catch (e) {
      Raven.captureException(e);
      this.setState({ error: e.message, loadingDeviceAlias: false });
    }
  }

  async shareDevice() {
    if (this.state.loadingDeviceShare) {
      return;
    }

    const { dongle_id } = this.props.device;
    const email = this.state.shareEmail;

    this.setState({
      loadingDeviceShare: true,
      hasShared: false
    });
    try {
      await Devices.grantDeviceReadPermission(dongle_id, this.state.shareEmail.trim());
      this.setState({
        loadingDeviceShare: false,
        shareEmail: '',
        hasShared: true
      });
    } catch (e) {
      const err = e;
      console.log(e, err);
      console.log(err.statusCode);
      debugger;
      Raven.captureException(e);
      this.setState({ error: e.message, loadingDeviceShare: false });
    }
  }

  render() {
    const { classes } = this.props;
    return (
      <Modal
        aria-labelledby="device-settings-modal"
        aria-describedby="device-settings-modal-description"
        open={this.props.isOpen}
        onClose={this.props.onClose}
      >
        <Paper className={classes.modal}>
          <Typography variant="title">
            Edit Device
          </Typography>
          <Divider />
          <div className={classes.form}>
            <div className={classes.formRow}>
              <TextField
                id="device_alias"
                label="Device Name"
                className={classes.textField}
                value={this.state.deviceAlias}
                onChange={this.handleAliasChange}
                onKeyPress={partial(this.callOnEnter, this.setDeviceAlias)}
              />
              { (this.props.device.alias !== this.state.deviceAlias || this.state.hasSavedAlias)
                  && (
                  <div className={classes.wrapper}>
                    <IconButton
                      variant="fab"
                      onClick={this.setDeviceAlias}
                    >
                      { this.state.hasSavedAlias && <CheckIcon /> || <SaveIcon /> }
                    </IconButton>
                    {this.state.loadingDeviceAlias && <CircularProgress size={48} className={classes.fabProgress} />}
                  </div>
                  )}
            </div>
            <div className={classes.formRow}>
              <TextField
                id="device_share"
                label="Share by Email"
                className={classes.textField}
                value={this.state.shareEmail}
                onChange={this.handleEmailChange}
                onKeyPress={partial(this.callOnEnter, this.shareDevice)}
              />
              { (this.state.shareEmail.length > 0 || this.state.hasShared)
                  && (
                  <div className={classes.wrapper}>
                    <IconButton
                      variant="fab"
                      onClick={this.shareDevice}
                    >
                      { this.state.hasShared && <CheckIcon /> || <ShareIcon /> }
                    </IconButton>
                    {this.state.loadingDeviceShare && <CircularProgress size={48} className={classes.fabProgress} />}
                  </div>
                  )}
            </div>
          </div>
          <div className={classes.buttonGroup}>
            <Button variant="contained" onClick={this.props.onClose}>
              Close
            </Button>
            &nbsp;
          </div>
        </Paper>
      </Modal>
    );
  }
}

const stateToProps = Obstruction({
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(DeviceSettingsModal));

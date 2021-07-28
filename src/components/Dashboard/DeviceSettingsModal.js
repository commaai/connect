import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from "@sentry/react";

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

import { devices as DevicesApi } from '@commaai/comma-api';
import Timelineworker from '../../timeline';
import { primeNav, selectDevice } from '../../actions';
import Colors from '../../colors';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    maxWidth: '90%',
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
  },
  modalUnpair: {
    width: theme.spacing.unit * 45,
    maxWidth: '80%',
  },
  titleContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
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
  textField: {
    maxWidth: '70%',
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
  },
  primeManageButton: {
    marginTop: 20,
  },
  topButtonGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap-reverse',
    alignItems: 'baseline',
  },
  cancelButton: {
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
});

class DeviceSettingsModal extends Component {
  constructor(props) {
    super(props);

    this.state = {
      deviceAlias: '',
      loadingDeviceAlias: false,
      loadingDeviceShare: false,
      hasSavedAlias: false,
      shareEmail: '',
      unpairConfirm: false,
      unpaired: false,
    };

    this.onPrimeSettings = this.onPrimeSettings.bind(this);
    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.handleEmailChange = this.handleEmailChange.bind(this);
    this.callOnEnter = this.callOnEnter.bind(this);
    this.setDeviceAlias = this.setDeviceAlias.bind(this);
    this.shareDevice = this.shareDevice.bind(this);
    this.unpairDevice = this.unpairDevice.bind(this);
    this.closeUnpair = this.closeUnpair.bind(this);
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
      const device = await DevicesApi.setDeviceAlias(dongle_id, this.state.deviceAlias.trim());
      Timelineworker.updateDevice(device);
      this.setState({
        loadingDeviceAlias: false,
        hasSavedAlias: true
      });
    } catch (e) {
      Sentry.captureException(e);
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
      await DevicesApi.grantDeviceReadPermission(dongle_id, this.state.shareEmail.trim());
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
      Sentry.captureException(e);
      this.setState({ error: e.message, loadingDeviceShare: false });
    }
  }

  onPrimeSettings() {
    let intv = null;
    const doPrimeNav = () => {
      if (intv) {
        clearInterval(intv);
      }
      this.props.dispatch(primeNav());
      this.props.onClose();
    };

    if (this.props.device.dongle_id !== this.props.stateDevice.dongle_id) {
      this.props.dispatch(selectDevice(this.props.device.dongle_id));
      intv = setInterval(() => {
        if (this.props.device.dongle_id === this.props.stateDevice.dongle_id) {
          doPrimeNav();
        }
      }, 100);
    } else {
      doPrimeNav();
    }
  }

  async unpairDevice() {
    this.setState({ loadingUnpair: true });
    await DevicesApi.unpair(this.props.device.dongle_id);
    this.setState({ loadingUnpair: false, unpaired: true })
  }

  closeUnpair() {
    if (this.state.unpaired) {
      window.location = window.location.origin;
    } else {
      this.setState({ unpairConfirm: false });
    }
  }

  render() {
    const { classes, device } = this.props;
    if (!device) {
      return <></>;
    }

    return ( <>
      <Modal aria-labelledby="device-settings-modal" aria-describedby="device-settings-modal-description"
        open={this.props.isOpen} onClose={this.props.onClose}>
        <Paper className={classes.modal}>
          <div className={ classes.titleContainer }>
            <Typography variant="title">
              Device settings
            </Typography>
            <Typography variant="caption">
              { device.dongle_id }
            </Typography>
          </div>
          <Divider />
          <div className={ classes.topButtonGroup }>
            <Button variant="outlined" className={ classes.primeManageButton } onClick={ this.onPrimeSettings }>
              Manage prime settings
            </Button>
            <Button variant="outlined" className={ classes.primeManageButton }
              onClick={ () => this.setState({ unpairConfirm: true }) }>
              Unpair device
            </Button>
          </div>
          <div className={classes.form}>
            <div className={classes.formRow}>
              <TextField id="device_alias" label="Device Name" className={ classes.textField }
                value={ this.state.deviceAlias ? this.state.deviceAlias : '' }
                onChange={this.handleAliasChange} onKeyPress={ (ev) => this.callOnEnter(this.setDeviceAlias, ev) } />
              { (this.props.device.alias !== this.state.deviceAlias || this.state.hasSavedAlias) &&
                <div className={classes.wrapper}>
                  <IconButton variant="fab" onClick={this.setDeviceAlias}>
                    { this.state.hasSavedAlias && <CheckIcon /> || <SaveIcon /> }
                  </IconButton>
                  {this.state.loadingDeviceAlias && <CircularProgress size={48} className={classes.fabProgress} />}
                </div>
              }
            </div>
            <div className={classes.formRow}>
              <TextField id="device_share" label="Share by Email" className={ classes.textField }
                value={this.state.shareEmail} onChange={this.handleEmailChange} variant="outlined"
                onKeyPress={ (ev) => this.callOnEnter(this.shareDevice, ev) }
                helperText="give another user read access to to this device" />
              { (this.state.shareEmail.length > 0 || this.state.hasShared) &&
                <div className={classes.wrapper}>
                  <IconButton variant="fab" onClick={this.shareDevice}>
                    { this.state.hasShared && <CheckIcon /> || <ShareIcon /> }
                  </IconButton>
                  {this.state.loadingDeviceShare && <CircularProgress size={48} className={classes.fabProgress} />}
                </div>
              }
            </div>
          </div>
          <div className={classes.buttonGroup}>
            <Button variant="contained" className={ classes.cancelButton } onClick={this.props.onClose}>
              Close
            </Button>
          </div>
        </Paper>
      </Modal>
      <Modal aria-labelledby="device-settings-modal" aria-describedby="device-settings-modal-description"
        open={this.state.unpairConfirm} onClose={ this.closeUnpair }>
        <Paper className={ `${classes.modal} ${classes.modalUnpair}` }>
          <div className={ classes.titleContainer }>
            <Typography variant="title">
              Unpair device
            </Typography>
            <Typography variant="caption">
              { device.dongle_id }
            </Typography>
          </div>
          <Divider />
          <div className={ classes.topButtonGroup }>
            <Button variant="contained" className={ `${classes.primeManageButton} ${classes.cancelButton}` }
              onClick={ this.closeUnpair }>
              { this.state.unpaired ? 'Close' : 'Cancel' }
            </Button>
            { this.state.unpaired ?
              <Typography variant="body2">Unpaired</Typography> :
              <Button variant="outlined" className={ classes.primeManageButton } onClick={ this.unpairDevice }
                disabled={ this.state.loadingUnpair }>
                { this.state.loadingUnpair ? '...' : 'Confirm' }
              </Button>
            }
          </div>
        </Paper>
      </Modal>
    </> );
  }
}

const stateToProps = Obstruction({
  subscription: 'workerState.subscription',
  stateDevice: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(DeviceSettingsModal));

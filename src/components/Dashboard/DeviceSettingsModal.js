import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import Raven from 'raven-js';

import {
  Modal,
  TextField,
  Button,
  Paper,
} from '@material-ui/core';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import * as API from '../../api';
import Timelineworker from '../../timeline';

const styles = theme => {
  return {
    modal: {
      position: 'absolute',
      padding: theme.spacing.unit * 2,
      width: theme.spacing.unit * 50,
      margin: '0 auto',
      left: '50%',
      top: '40%',
      transform: 'translate(-50%, -50%)'
    },
    textField: {

    },
    buttonGroup: {

    },
  }
};

class DeviceSettingsModal extends Component {
  constructor(props) {
    super(props);

    this.state = {
      editingDevice: null,
      deviceAlias: null,
      isWaitingForApi: false,
    };

    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.handleAliasFieldKeyPress = this.handleAliasFieldKeyPress.bind(this);
    this.setDeviceAlias = this.setDeviceAlias.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    if (this.state.editingDevice === null && nextProps.device !== null && nextProps.device.alias !== this.state.deviceAlias) {
      this.setState({ deviceAlias: nextProps.device.alias });
    }
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
        editingDevice: null,
        showDeviceSettings: false,
      });
      this.props.onClose();
    } catch(e) {
      Raven.captureException(e);
      this.setState({ error: e.message, isWaitingForApi: false });
    }
  }

  render () {
    return (
      <Modal
        aria-labelledby='device-settings-modal'
        aria-describedby='device-settings-modal-description'
        open={ this.props.isOpen }
        onClose={ this.props.onClose }>
        <Paper className={ this.props.classes.modal }>
          <TextField
            id='device_alias'
            label="Device Name"
            className={ this.props.classes.textField }
            value={ this.state.deviceAlias }
            onChange={ this.handleAliasChange }
            onKeyPress={ partial(this.handleAliasFieldKeyPress, this.props.device.dongle_id) } />
          <div className={ this.props.classes.buttonGroup }>
            <Button variant='contained' onClick={ this.props.onCancel }>
              Cancel
            </Button>
            &nbsp;
            <Button
              variant='contained'
              color='secondary'
              onClick={ partial(this.setDeviceAlias, this.props.device.dongle_id) }>
              Save
            </Button>
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

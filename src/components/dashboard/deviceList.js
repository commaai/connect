import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import Raven from 'raven-js';

import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import FormHelperText from '@material-ui/core/FormHelperText';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import Grid from '@material-ui/core/Grid';
import LinearProgress from '@material-ui/core/LinearProgress';
import Pencil from '@material-ui/icons/Edit';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import FormControl from '@material-ui/core/FormControl';

import EonUpsell from '../annotations/eonUpsell';
import * as API from '../../api';
import Timelineworker from '../../timeline';

const styles = theme => {
  return {
    root: {},
    editDeviceIcon: {
      color: 'white',
      '&:hover': {
        color: theme.palette.grey[100]
      }
    },
    expansion: {
      backgroundColor: theme.palette.grey[800]
    },
    expanded: {
      minHeight: 'initial',
      margin: '0px 0',
      backgroundColor: theme.palette.grey[999]
    },
    nameField: {
      marginRight: theme.spacing.unit,
    },
    saveButton: {
      marginRight: theme.spacing.unit,
    },
    textField: {
      marginBottom: theme.spacing.unit
    },
    deviceListItemName: {
      fontWeight: 500,
    },
  }
};

class DeviceList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      editingDevice: null,
      deviceAlias: '',
      isWaitingForApi: false,
      error: null,
    };

    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.handleAliasFieldKeyPress = this.handleAliasFieldKeyPress.bind(this);
    this.renderDevice = this.renderDevice.bind(this);
    this.setDeviceAlias = this.setDeviceAlias.bind(this);
    this.toggleDeviceEdit = this.toggleDeviceEdit.bind(this);
    this.cancelEdit = this.cancelEdit.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.selectedDevice !== this.props.selectedDevice
        && nextProps.selectedDevice !== this.state.editingDevice) {
      this.setState({ editingDevice: null });
    }
  }

  toggleDeviceEdit (device) {
    if (this.state.editingDevice === device.dongle_id) {
      this.setState({ editingDevice: null });
    } else {
      this.props.handleDeviceSelected(device.dongle_id);
      this.setState({ editingDevice: device.dongle_id, deviceAlias: device.alias });
    }
  }
  cancelEdit () {
    this.setState({ editingDevice: null });
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
      this.setState({ isWaitingForApi: false, editingDevice: null });
    } catch(e) {
      Raven.captureException(e);
      this.setState({ error: e.message, isWaitingForApi: false });
    }
  }

  render () {
    var devices = this.props.devices;
    var dongleId = this.props.selectedDevice;
    var found = !dongleId;
    var onlyHasAppDevice = true;
    devices.forEach(function (device, idx) {
      if (device.dongle_id === dongleId) {
        found = true;
      }
      onlyHasAppDevice = onlyHasAppDevice && (device.device_type !== 'neo' && device.device_type !== 'panda');
      if (device.device_type === 'neo'){
        devices[idx].device_type = 'EON';
      } else if (device.device_type === 'app') {
        devices[idx].device_type = 'chffr';
      }
    });

    if (!found) {
      devices.push({
        dongle_id: dongleId,
        shared: true,
        alias: 'Shared device',
      });
    }

    return (
      <React.Fragment>
        { devices.filter(this.filterDrivingDevice).map(this.renderDevice) }
        { onlyHasAppDevice && <EonUpsell hook='Upgrade to an EON to augment your driving experience' /> }
      </React.Fragment>
    );
  }

  renderDevice (device) {
    let alias = device.alias || device.device_type;

    return (
      <ExpansionPanel
        classes={{
          expanded: this.props.classes.expanded
        }}
        key={ device.dongle_id }
        expanded={ this.props.selectedDevice === device.dongle_id }
        onChange={ partial(this.props.handleDeviceSelected, device.dongle_id) }
        className={ this.props.classes.expansion }
        >
        <ExpansionPanelSummary>
          <Grid container>
            <Grid item xs={10}>
              { this.state.editingDevice === device.dongle_id ?
                <React.Fragment>
                  { this.state.isWaitingForApi && <LinearProgress /> }
                  { this.state.error !== null && <FormHelperText error>{ this.state.error }</FormHelperText> }
                  <TextField
                    id="name"
                    label="Name"
                    className={this.props.classes.textField}
                    value={this.state.deviceAlias}
                    onChange={this.handleAliasChange}
                    onKeyPress={ partial(this.handleAliasFieldKeyPress, device.dongle_id) }
                  />
                </React.Fragment>
                :
                <Typography className={ this.props.classes.deviceListItemName }>{ (alias + ' (' + device.dongle_id + ')') }</Typography>
              }
            </Grid>
            { (!device.shared && (device.is_owner || this.props.isSuperUser)) &&
              <Grid item xs={2}>
                <Pencil className={ this.props.classes.editDeviceIcon } onClick={ partial(this.toggleDeviceEdit, device) } />
              </Grid>
            }
            { this.state.editingDevice === device.dongle_id &&
              <React.Fragment>
                <Grid item xs={6}>
                  <Button
                  variant='outlined'
                  onClick={ partial(this.setDeviceAlias, device.dongle_id) }
                  className={this.props.classes.saveButton }>
                    Save
                  </Button>
                </Grid>
                <Grid item xs={6}>
                  <Button variant='outlined' onClick={ this.cancelEdit }>
                    Cancel
                  </Button>
                </Grid>
              </React.Fragment>
            }
          </Grid>
        </ExpansionPanelSummary>
      </ExpansionPanel>
    );
  }

  filterDrivingDevice(device) {
    return device.device_type !== 'panda';
  }
}

const stateToProps = Obstruction({
  devices: 'workerState.devices',
  isSuperUser: 'workerState.profile.superuser',
});

export default connect(stateToProps)(withStyles(styles)(DeviceList));

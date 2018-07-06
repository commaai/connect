import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';

import { withStyles } from '@material-ui/core/styles';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import Grid from '@material-ui/core/Grid';
import Pencil from '@material-ui/icons/Edit';
import Typography from '@material-ui/core/Typography';

import TextField from '@material-ui/core/TextField';

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
  }
};

class DeviceList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      editingDevice: null,
      deviceAlias: '',
    };

    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.renderDevice = this.renderDevice.bind(this);
    this.toggleDeviceEdit = this.toggleDeviceEdit.bind(this);
  }

  toggleDeviceEdit (device) {
    this.setState({ editingDevice: device.dongleId, deviceAlias: device.alias });
  }

  handleAliasChange (deviceAlias) {
    this.setState({ deviceAlias });
  }

  render () {
    // var devices = this.props.devices;
    // var dongleId = this.props.selectedDevice;
    // var found = !dongleId;

    // devices.forEach(function (device) {
    //   if (device.dongle_id === dongleId) {
    //     found = true;
    //   }
    // });

    // if (!found) {
    //   devices.push({
    //     dongle_id: dongleId,
    //     shared: true
    //   });
    // }
    return (
      <React.Fragment>
        { this.props.devices.map(this.renderDevice) }
      </React.Fragment>
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
          <Grid item xs={10}>
            { this.state.editingDevice === device.dongle_id ?
              <TextField
                id="name"
                label="Name"
                className={this.props.classes.textField}
                value={this.state.deviceAlias}
                onChange={this.handleChange}
                margin="normal"
              />
              : 
              <Typography>{ (device.alias && device.alias + ' (' + device.dongle_id + ')') || device.dongle_id }</Typography>
            }
          </Grid>
          <Grid item xs={2} alignContent='center'>
            <Pencil className={ this.props.classes.editDeviceIcon } onClick={ partial(this.toggleDeviceEdit, device) } />
          </Grid>
        </ExpansionPanelSummary>
      </ExpansionPanel>
    );
  }
}

const stateToProps = Obstruction({
  devices: 'workerState.devices',
});

export default connect(stateToProps)(withStyles(styles)(DeviceList));

import React, { Component } from "react";
import { connect } from "react-redux";
import Obstruction from "obstruction";
import { partial } from "ap";
import Raven from "raven-js";
import cx from "classnames";

import { withStyles, Typography } from "@material-ui/core";

import { devices as Devices } from "@commaai/comma-api";
import Timelineworker from "../../timeline";
import EonUpsell from "../Annotations/eonUpsell";

const styles = theme => {
  return {
    base: {
      height: "100%",
      overflowY: "scroll"
    },
    device: {
      alignItems: "center",
      cursor: "pointer",
      display: "flex",
      padding: 32,
      paddingTop: 16,
      paddingBottom: 16,
      "&.isSelected": {
        backgroundColor: "#171B1D"
      }
    },
    deviceAvatar: {
      backgroundColor: "#1D2225",
      borderRadius: 30,
      height: 46,
      width: 46
    },
    deviceInfo: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      marginLeft: 16
    },
    deviceAlias: {},
    deviceId: {
      color: "#525E66",
      fontFamily: "MaisonNeueMono"
    },

    editDeviceIcon: {
      color: "white",
      "&:hover": {
        color: theme.palette.grey[100]
      }
    },
    nameField: {
      marginRight: theme.spacing.unit
    },
    saveButton: {
      marginRight: theme.spacing.unit
    },
    textField: {
      marginBottom: theme.spacing.unit
    }
  };
};

class DeviceList extends Component {
  constructor(props) {
    super(props);

    this.state = {
      editingDevice: null,
      deviceAlias: "",
      isWaitingForApi: false,
      error: null
    };

    this.handleAliasChange = this.handleAliasChange.bind(this);
    this.handleAliasFieldKeyPress = this.handleAliasFieldKeyPress.bind(this);
    this.renderDevice = this.renderDevice.bind(this);
    this.setDeviceAlias = this.setDeviceAlias.bind(this);
    this.toggleDeviceEdit = this.toggleDeviceEdit.bind(this);
    this.cancelEdit = this.cancelEdit.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    if (
      nextProps.selectedDevice !== this.props.selectedDevice &&
      nextProps.selectedDevice !== this.state.editingDevice
    ) {
      this.setState({ editingDevice: null });
    }
  }

  toggleDeviceEdit(device) {
    if (this.state.editingDevice === device.dongle_id) {
      this.setState({ editingDevice: null });
    } else {
      this.props.handleDeviceSelected(device.dongle_id);
      this.setState({
        editingDevice: device.dongle_id,
        deviceAlias: device.alias
      });
    }
  }
  cancelEdit() {
    this.setState({ editingDevice: null });
  }

  handleAliasChange(e) {
    this.setState({ deviceAlias: e.target.value });
  }

  handleAliasFieldKeyPress(dongle_id, e) {
    if (e.key === "Enter" && !this.state.isWaitingForApi) {
      this.setDeviceAlias(dongle_id);
    }
  }

  async setDeviceAlias(dongle_id) {
    this.setState({ isWaitingForApi: true });
    try {
      const device = await Devices.setDeviceAlias(
        dongle_id,
        this.state.deviceAlias.trim()
      );
      Timelineworker.updateDevice(device);
      this.setState({ isWaitingForApi: false, editingDevice: null });
    } catch (e) {
      Raven.captureException(e);
      this.setState({ error: e.message, isWaitingForApi: false });
    }
  }

  render() {
    var devices = this.props.devices;
    var dongleId = this.props.selectedDevice;
    var found = !dongleId;
    var onlyHasAppDevice = true;
    devices.forEach(function(device, idx) {
      if (device.dongle_id === dongleId) {
        found = true;
      }
      onlyHasAppDevice =
        onlyHasAppDevice &&
        (device.device_type !== "neo" && device.device_type !== "panda");
      if (device.device_type === "neo") {
        devices[idx].device_type = "EON";
      } else if (device.device_type === "app") {
        devices[idx].device_type = "chffr";
      }
    });

    if (!found) {
      devices.push({
        dongle_id: dongleId,
        shared: true,
        alias: "Shared device"
      });
    }

    return (
      <div className={this.props.classes.base}>
        {devices.filter(this.filterDrivingDevice).map(this.renderDevice)}
        {onlyHasAppDevice && (
          <EonUpsell hook="Upgrade to an EON to augment your driving experience" />
        )}
      </div>
    );
  }

  renderDevice(device) {
    const { classes } = this.props;
    const isSelected = this.props.selectedDevice === device.dongle_id;
    let alias = device.alias || device.device_type;
    return (
      <div
        key={device.dongle_id}
        onClick={partial(this.props.handleDeviceSelected, device.dongle_id)}
        className={cx(classes.device, [{ isSelected: isSelected }])}
      >
        <div className={classes.deviceAvatar} />
        <div className={classes.deviceInfo}>
          <Typography variant="body2" className={classes.deviceAlias}>
            {alias}
          </Typography>
          <Typography variant="caption" className={classes.deviceId}>
            ({device.dongle_id})
          </Typography>
        </div>
      </div>
    );
  }

  filterDrivingDevice(device) {
    return device.device_type !== "panda";
  }
}

const stateToProps = Obstruction({
  devices: "workerState.devices",
  isSuperUser: "workerState.profile.superuser"
});

export default connect(stateToProps)(withStyles(styles)(DeviceList));

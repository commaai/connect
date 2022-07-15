import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import PropTypes from 'prop-types';

import { withStyles, Divider, Typography, Button, Modal, Paper } from '@material-ui/core';

import { deviceIsOnline, deviceTypePretty, filterRegularClick } from '../../utils';
import Colors from '../../colors';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    width: 'max-content',
    maxWidth: '90%',
    left: '50%',
    top: '50%',
    maxHeight: '80vh',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  deviceList: {
    overflow: 'scroll',
  },
  titleContainer: {
    margin: theme.spacing.unit * 2,
  },
  cancelButton: {
    margin: theme.spacing.unit * 2,
    alignSelf: 'flex-end',
    '&:hover': {
      backgroundColor: Colors.white10,
      color: Colors.white,
    },
  },
  device: {
    cursor: 'pointer',
    textDecoration: 'none',
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 32px',
    '&:hover': {
      backgroundColor: Colors.darken10,
    }
  },
  deviceOnline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green400,
  },
  deviceOffline: {
    backgroundColor: Colors.grey400,
  },
  deviceInfo: {
    display: 'flex',
    alignItems: 'center',
  },
  deviceName: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    marginLeft: 16,
  },
  deviceAlias: {
    fontWeight: 600,
  },
  deviceId: {
    color: Colors.grey300,
  },
});

class DeviceSelect extends Component {
  constructor(props) {
    super(props);

    this.state = {};

    this.renderDevice = this.renderDevice.bind(this);
  }

  render() {
    const { classes, devices, deviceFilter } = this.props;

    if (!devices) {
      return null;
    }

    return <>
      <Modal open={ this.props.open } onClose={ this.props.onClose }>
        <Paper className={ classes.modal }>
          <div className={ classes.titleContainer }>
            <Typography variant="title">Select device</Typography>
          </div>
          <Divider />
          <div className={ classes.deviceList }>
            { devices.filter(deviceFilter ? deviceFilter : () => true).map(this.renderDevice) }
          </div>
          <Button variant="contained" className={ classes.cancelButton } onClick={ this.props.onClose }>
            Cancel
          </Button>
        </Paper>
      </Modal>
    </>;
  }

  renderDevice(device) {
    const { classes, onSelect, deviceHref } = this.props;
    const alias = device.alias || deviceTypePretty(device.device_type);
    const offlineCls = !deviceIsOnline(device) ? classes.deviceOffline : '';
    return (
      <a key={device.dongle_id} className={ classes.device } onClick={ filterRegularClick(() => onSelect(device)) }
        href={ deviceHref ? deviceHref(device) : null }>
        <div className={classes.deviceInfo}>
          <div className={ `${classes.deviceOnline} ${offlineCls}` }>&nbsp;</div>
          <div className={ classes.deviceName }>
            <Typography className={classes.deviceAlias}>
              { alias }
            </Typography>
            <Typography variant="caption" className={classes.deviceId}>
              { device.dongle_id }
            </Typography>
          </div>
        </div>
      </a>
    );
  }
}

const stateToProps = Obstruction({
  devices: 'devices',
});

DeviceSelect.propTypes = {
  open: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  deviceHref: PropTypes.func,
  onClose: PropTypes.func,
  deviceFilter: PropTypes.func,
};

export default connect(stateToProps)(withStyles(styles)(DeviceSelect));

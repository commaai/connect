import { devices as Devices } from '@commaai/api';
import MyCommaAuth from '@commaai/my-comma-auth';
import { IconButton, Typography, withStyles } from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';
import * as Sentry from '@sentry/react';
import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { updateDevices } from '../../actions';
import Colors from '../../colors';
import { deviceIsOnline, deviceNamePretty, emptyDevice, filterRegularClick } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';

import AddDevice from './AddDevice';
import DeviceSettingsModal from './DeviceSettingsModal';

const styles = (theme) => ({
  deviceList: {
    overflow: 'auto',
  },
  device: {
    textDecoration: 'none',
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 32px',
    '&.isSelected': {
      backgroundColor: 'rgba(0, 0, 0, 0.25)',
    },
  },
  settingsButton: {
    height: 46,
    width: 46,
    color: Colors.white30,
    transition: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
    '&:hover': {
      color: Colors.white,
    },
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
    color: '#74838e',
  },
  editDeviceIcon: {
    color: 'white',
    '&:hover': {
      color: theme.palette.grey[100],
    },
  },
  nameField: {
    marginRight: theme.spacing.unit,
  },
  saveButton: {
    marginRight: theme.spacing.unit,
  },
  textField: {
    marginBottom: theme.spacing.unit,
  },
  addDeviceContainer: {
    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
  },
});

const DeviceList = (props) => {
  const { classes, handleDeviceSelected, selectedDevice } = props;
  const dispatch = useDispatch();
  const devices = useSelector((state) => state.devices);
  const device = useSelector((state) => state.device);
  const profile = useSelector((state) => state.profile);

  const [settingsModalDongleId, setSettingsModalDongleId] = useState(null);

  const handleOpenedSettingsModal = useCallback((dongleId, ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    setSettingsModalDongleId(dongleId);
  }, []);

  const handleClosedSettingsModal = useCallback(() => {
    setSettingsModalDongleId(null);
  }, []);

  const onVisible = useCallback(async () => {
    if (MyCommaAuth.isAuthenticated()) {
      try {
        const devices = await Devices.listDevices();
        dispatch(updateDevices(devices));
      } catch (err) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'devicelist_visible_listdevices' });
      }
    }
  }, [dispatch]);

  const renderDevice = useCallback((device) => {
    const isSelectedCls = (selectedDevice === device.dongle_id) ? 'isSelected' : '';
    const offlineCls = !deviceIsOnline(device) ? classes.deviceOffline : '';
    return (
      <a
        key={device.dongle_id}
        className={ `${classes.device} ${isSelectedCls}` }
        onClick={ filterRegularClick(() => handleDeviceSelected(device.dongle_id)) }
        href={ `/${device.dongle_id}` }
      >
        <div className={classes.deviceInfo}>
          <div className={ `${classes.deviceOnline} ${offlineCls}` }>&nbsp;</div>
          <div className={ classes.deviceName }>
            <Typography className={classes.deviceAlias}>
              {deviceNamePretty(device)}
            </Typography>
            <Typography variant="caption" className={classes.deviceId}>
              { device.dongle_id }
            </Typography>
          </div>
        </div>
        { (device.is_owner || (profile && profile.superuser))
          && (
          <IconButton
            className={classes.settingsButton}
            aria-label="device settings"
            onClick={ (ev) => handleOpenedSettingsModal(device.dongle_id, ev) }
          >
            <SettingsIcon className={classes.settingsButtonIcon} />
          </IconButton>
          )}
      </a>
    );
  }, [classes, handleDeviceSelected, profile, selectedDevice, handleOpenedSettingsModal]);

  if (devices === null) {
    return null;
  }

  let devicesList = devices;
  const dongleId = selectedDevice;
  const found = devicesList.some((d) => d.dongle_id === dongleId);
  if (!found && device && dongleId === device.dongle_id) {
    devicesList = [{
      ...device,
      alias: emptyDevice.alias,
    }].concat(devicesList);
  } else if (!found && dongleId) {
    devicesList = [{
      ...emptyDevice,
      dongle_id: dongleId,
    }].concat(devicesList);
  }

  const addButtonStyle = {
    borderRadius: 'unset',
    backgroundColor: 'transparent',
    color: 'white',
    fontWeight: 600,
    justifyContent: 'space-between',
    padding: '16px 44px 16px 54px',
  };

  return (
    <>
      <VisibilityHandler onVisible={ onVisible } minInterval={ 10 } />
      <div
        className={`scrollstyle ${classes.deviceList}`}
        style={{ height: 'calc(100vh - 64px)' }}
      >
        {devicesList.map(renderDevice)}
        {MyCommaAuth.isAuthenticated() && (
          <div className={classes.addDeviceContainer}>
            <AddDevice buttonText="add new device" buttonStyle={addButtonStyle} buttonIcon />
          </div>
        )}
      </div>
      <DeviceSettingsModal
        isOpen={Boolean(settingsModalDongleId)}
        dongleId={settingsModalDongleId}
        onClose={handleClosedSettingsModal}
      />
    </>
  );
};

export default withStyles(styles)(DeviceList);

import { devices as Devices } from '@commaai/api';
import MyCommaAuth from '@commaai/my-comma-auth';
import { IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import SettingsIcon from '@mui/icons-material/Settings';
import * as Sentry from '@sentry/react';
import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { updateDevices } from '../../actions';
import Colors from '../../colors';
import { deviceIsOnline, deviceNamePretty, emptyDevice, filterRegularClick } from '../../utils';
import VisibilityHandler from '../VisibilityHandler';

import AddDevice from './AddDevice';
import DeviceSettingsModal from './DeviceSettingsModal';

const DeviceListContainer = styled('div')({
  overflow: 'auto',
});

const DeviceLink = styled('a')({
  textDecoration: 'none',
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'space-between',
  padding: '16px 32px',
  '&.isSelected': {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
});

const StyledSettingsButton = styled(IconButton)({
  height: 46,
  width: 46,
  color: Colors.white30,
  transition: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
  '&:hover': {
    color: Colors.white,
  },
});

const DeviceStatusIndicator = styled('div')(({ isOffline }) => ({
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: isOffline ? Colors.grey400 : Colors.green400,
}));

const DeviceInfo = styled('div')({
  display: 'flex',
  alignItems: 'center',
});

const DeviceName = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  marginLeft: 16,
});

const DeviceAlias = styled(Typography)({
  fontWeight: 600,
});

const DeviceId = styled(Typography)({
  color: '#74838e',
});

const AddDeviceContainer = styled('div')({
  '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.25)' },
});

const DeviceList = (props) => {
  const { handleDeviceSelected, selectedDevice } = props;
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

  const renderDevice = useCallback(
    (device) => {
      const isSelectedCls = selectedDevice === device.dongle_id ? 'isSelected' : '';
      const isOffline = !deviceIsOnline(device);
      return (
        <DeviceLink key={device.dongle_id} className={isSelectedCls} onClick={filterRegularClick(() => handleDeviceSelected(device.dongle_id))} href={`/${device.dongle_id}`}>
          <DeviceInfo>
            <DeviceStatusIndicator isOffline={isOffline}>&nbsp;</DeviceStatusIndicator>
            <DeviceName>
              <DeviceAlias>{deviceNamePretty(device)}</DeviceAlias>
              <DeviceId variant="caption">{device.dongle_id}</DeviceId>
            </DeviceName>
          </DeviceInfo>
          {(device.is_owner || (profile && profile.superuser)) && (
            <StyledSettingsButton aria-label="device settings" onClick={(ev) => handleOpenedSettingsModal(device.dongle_id, ev)}>
              <SettingsIcon />
            </StyledSettingsButton>
          )}
        </DeviceLink>
      );
    },
    [handleDeviceSelected, profile, selectedDevice, handleOpenedSettingsModal],
  );

  if (devices === null) {
    return null;
  }

  let devicesList = devices;
  const dongleId = selectedDevice;
  const found = devicesList.some((d) => d.dongle_id === dongleId);
  if (!found && device && dongleId === device.dongle_id) {
    devicesList = [
      {
        ...device,
        alias: emptyDevice.alias,
      },
    ].concat(devicesList);
  } else if (!found && dongleId) {
    devicesList = [
      {
        ...emptyDevice,
        dongle_id: dongleId,
      },
    ].concat(devicesList);
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
      <VisibilityHandler onVisible={onVisible} minInterval={10} />
      <DeviceListContainer className="scrollstyle" sx={{ height: 'calc(100vh - 64px)' }}>
        {devicesList.map(renderDevice)}
        {MyCommaAuth.isAuthenticated() && (
          <AddDeviceContainer>
            <AddDevice buttonText="add new device" buttonStyle={addButtonStyle} buttonIcon />
          </AddDeviceContainer>
        )}
      </DeviceListContainer>
      <DeviceSettingsModal isOpen={Boolean(settingsModalDongleId)} dongleId={settingsModalDongleId} onClose={handleClosedSettingsModal} />
    </>
  );
};

export default DeviceList;

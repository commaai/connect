import { devices as Devices } from '@commaai/api';
import { Button, CircularProgress, Divider, IconButton, Modal, Paper, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import SaveIcon from '@mui/icons-material/Save';
import ShareIcon from '@mui/icons-material/Share';
import WarningIcon from '@mui/icons-material/Warning';
import * as Sentry from '@sentry/react';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectDevice, updateDevice } from '../../actions';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { navigate } from '../../navigation';
import UploadQueue from '../Files/UploadQueue';

const StyledPaper = styled(Paper)(({ theme }) => ({
  position: 'absolute',
  padding: theme.spacing(2),
  width: theme.spacing(50),
  maxWidth: '90%',
  left: '50%',
  top: '40%',
  transform: 'translate(-50%, -50%)',
  outline: 'none',
}));

const UnpairPaper = styled(StyledPaper)(({ theme }) => ({
  width: theme.spacing(45),
  maxWidth: '80%',
}));

const TitleContainer = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 5,
});

const ButtonGroup = styled('div')(({ theme }) => ({
  textAlign: 'right',
  marginTop: theme.spacing(2),
}));

const FormContainer = styled('div')(({ theme }) => ({
  paddingTop: theme.spacing(1),
  paddingBottom: theme.spacing(1),
}));

const FormRow = styled('div')({
  minHeight: 75,
});

const FormRowError = styled('div')({
  padding: 10,
  marginBottom: 5,
  backgroundColor: Colors.red500,
});

const StyledTextField = styled(TextField)({
  maxWidth: '70%',
});

const FabProgress = styled(CircularProgress)({
  position: 'absolute',
  top: 0,
  left: 0,
  zIndex: 1,
});

const IconButtonWrapper = styled('div')(({ theme }) => ({
  margin: theme.spacing(1),
  position: 'relative',
  display: 'inline-block',
}));

const PrimeManageButton = styled(Button)({
  marginTop: 20,
  marginRight: 20,
  '&:last-child': { marginRight: 0 },
});

const TopButtonGroup = styled('div')({
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap-reverse',
  alignItems: 'baseline',
});

const CancelButton = styled(Button)({
  backgroundColor: Colors.grey200,
  color: Colors.white,
  '&:hover': {
    backgroundColor: Colors.grey400,
  },
});

const UnpairError = styled('div')({
  marginTop: 15,
  padding: 10,
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'rgba(255, 0, 0, 0.3)',
  '& p': { display: 'inline-block', marginLeft: 10 },
  color: Colors.white,
});

const UnpairWarning = styled('div')({
  marginTop: 15,
  padding: 10,
  display: 'flex',
  alignItems: 'center',
  backgroundColor: Colors.orange200,
  '& p': { display: 'inline-block', marginLeft: 10 },
  color: Colors.white,
});

const DeviceSettingsModal = ({ dongleId, isOpen, onClose }) => {
  const dispatch = useDispatch();
  const globalDongleId = useSelector((state) => state.dongleId);
  const devices = useSelector((state) => state.devices);
  const currentDevice = useSelector((state) => state.device);
  const device = devices.find((d) => d.dongle_id === dongleId) || (currentDevice && currentDevice.dongle_id === dongleId ? currentDevice : null);

  const [deviceAlias, setDeviceAlias] = useState('');
  const [loadingDeviceAlias, setLoadingDeviceAlias] = useState(false);
  const [loadingDeviceShare, setLoadingDeviceShare] = useState(false);
  const [hasSavedAlias, setHasSavedAlias] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [hasShared, setHasShared] = useState(false);
  const [unpairConfirm, setUnpairConfirm] = useState(false);
  const [unpaired, setUnpaired] = useState(false);
  const [loadingUnpair, setLoadingUnpair] = useState(false);
  const [error, setError] = useState(null);
  const [unpairError, setUnpairError] = useState(null);
  const [uploadModal, setUploadModal] = useState(false);

  // Reset state when dongleId changes
  useEffect(() => {
    const alias = device?.dongle_id === dongleId ? device.alias : '';
    setDeviceAlias(alias);
    setLoadingDeviceAlias(false);
    setLoadingDeviceShare(false);
    setHasSavedAlias(false);
    setShareEmail('');
    setHasShared(false);
    setUnpairConfirm(false);
    setUnpaired(false);
    setLoadingUnpair(false);
    setError(null);
    setUnpairError(null);
    setUploadModal(false);
  }, [dongleId, device]);

  const handleAliasChange = (e) => {
    setDeviceAlias(e.target.value);
    setHasSavedAlias(e.target.value === device.dongle_id ? hasSavedAlias : false);
  };

  const handleEmailChange = (e) => {
    setShareEmail(e.target.value);
    setHasShared(false);
    setError(null);
  };

  const callOnEnter = (method, e) => {
    if (e.key === 'Enter') {
      method();
    }
  };

  const setDeviceAliasAction = async () => {
    if (loadingDeviceAlias || !device) {
      return;
    }

    setLoadingDeviceAlias(true);
    setHasSavedAlias(false);
    try {
      const updatedDevice = await Devices.setDeviceAlias(device.dongle_id, deviceAlias.trim());
      dispatch(updateDevice(updatedDevice));
      setLoadingDeviceAlias(false);
      setHasSavedAlias(true);
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'device_settings_alias' });
      setError(err.message);
      setLoadingDeviceAlias(false);
    }
  };

  const shareDevice = async () => {
    if (loadingDeviceShare) {
      return;
    }

    setLoadingDeviceShare(true);
    setHasShared(false);
    try {
      await Devices.grantDeviceReadPermission(dongleId, shareEmail.trim());
      setLoadingDeviceShare(false);
      setShareEmail('');
      setHasShared(true);
      setError(null);
    } catch (err) {
      if (err.resp && err.resp.status === 404) {
        setError('could not find user');
        setLoadingDeviceShare(false);
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'device_settings_share' });
        setError('unable to share');
        setLoadingDeviceShare(false);
      }
    }
  };

  const onPrimeSettings = () => {
    let intv = null;
    const doPrimeNav = () => {
      if (intv) {
        clearInterval(intv);
      }
      navigate(`/${globalDongleId || dongleId}/prime`);
      onClose();
    };

    if (dongleId !== globalDongleId) {
      dispatch(selectDevice(dongleId));
      intv = setInterval(() => {
        if (dongleId === globalDongleId) {
          doPrimeNav();
        }
      }, 100);
    } else {
      doPrimeNav();
    }
  };

  const unpairDevice = async () => {
    if (!device) {
      return;
    }

    setLoadingUnpair(true);
    try {
      const resp = await Devices.unpair(device.dongle_id);
      if (resp.success) {
        setLoadingUnpair(false);
        setUnpaired(true);
      } else if (resp.error) {
        setLoadingUnpair(false);
        setUnpaired(false);
        setUnpairError(resp.error);
      } else {
        setLoadingUnpair(false);
        setUnpaired(false);
        setUnpairError('Could not successfully unpair');
      }
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'device_settings_unpair' });
      console.error(err);
      setLoadingUnpair(false);
      setUnpaired(false);
      setUnpairError('Unable to unpair');
    }
  };

  const closeUnpair = () => {
    if (unpaired) {
      window.location = window.location.origin;
    } else {
      setUnpairConfirm(false);
    }
  };

  if (!device) {
    return null;
  }

  return (
    <>
      <Modal aria-labelledby="device-settings-modal" aria-describedby="device-settings-modal-description" open={isOpen} onClose={onClose}>
        <StyledPaper>
          <TitleContainer>
            <Typography variant="h6">Device settings</Typography>
            <Typography variant="caption">{device.dongle_id}</Typography>
          </TitleContainer>
          <Divider />
          <div>
            <PrimeManageButton variant="outlined" onClick={onPrimeSettings}>
              Prime settings
            </PrimeManageButton>
            <PrimeManageButton variant="outlined" onClick={() => setUnpairConfirm(true)}>
              Unpair
            </PrimeManageButton>
          </div>
          <div>
            <PrimeManageButton variant="outlined" onClick={() => setUploadModal(true)}>
              Uploads
            </PrimeManageButton>
          </div>
          <FormContainer>
            {error && (
              <FormRowError>
                <Typography>{error}</Typography>
              </FormRowError>
            )}
            <FormRow>
              <StyledTextField
                id="device_alias"
                label="Device name"
                value={deviceAlias || ''}
                onChange={handleAliasChange}
                onKeyPress={(ev) => callOnEnter(setDeviceAliasAction, ev)}
              />
              {(device.alias !== deviceAlias || hasSavedAlias) && (
                <IconButtonWrapper>
                  <IconButton variant="fab" onClick={setDeviceAliasAction}>
                    {hasSavedAlias ? <CheckIcon /> : <SaveIcon />}
                  </IconButton>
                  {loadingDeviceAlias && <FabProgress size={48} />}
                </IconButtonWrapper>
              )}
            </FormRow>
            <FormRow>
              <StyledTextField
                id="device_share"
                label="Share by email or user id"
                value={shareEmail}
                onChange={handleEmailChange}
                variant="outlined"
                onKeyPress={(ev) => callOnEnter(shareDevice, ev)}
                helperText="give another user read access to this device"
              />
              {(shareEmail.length > 0 || hasShared) && (
                <IconButtonWrapper>
                  <IconButton variant="fab" onClick={shareDevice}>
                    {hasShared ? <CheckIcon /> : <ShareIcon />}
                  </IconButton>
                  {loadingDeviceShare && <FabProgress size={48} />}
                </IconButtonWrapper>
              )}
            </FormRow>
          </FormContainer>
          <ButtonGroup>
            <CancelButton variant="contained" onClick={onClose}>
              Close
            </CancelButton>
          </ButtonGroup>
        </StyledPaper>
      </Modal>
      <Modal aria-labelledby="device-settings-modal" aria-describedby="device-settings-modal-description" open={unpairConfirm} onClose={closeUnpair}>
        <UnpairPaper>
          <TitleContainer>
            <Typography variant="h6">Unpair device</Typography>
            <Typography variant="caption">{device.dongle_id}</Typography>
          </TitleContainer>
          <Divider />
          {unpairError && (
            <UnpairError>
              <ErrorOutline />
              <Typography>{unpairError}</Typography>
            </UnpairError>
          )}
          {device.prime && (
            <UnpairWarning>
              <WarningIcon />
              <Typography>Unpairing will also cancel the comma prime subscription for this device.</Typography>
            </UnpairWarning>
          )}
          <TopButtonGroup>
            <CancelButton variant="contained" sx={{ marginTop: '20px', marginRight: '20px' }} onClick={closeUnpair}>
              {unpaired ? 'Close' : 'Cancel'}
            </CancelButton>
            {unpaired ? (
              <Typography variant="body2">Unpaired</Typography>
            ) : (
              <PrimeManageButton variant="outlined" onClick={unpairDevice} disabled={loadingUnpair}>
                {loadingUnpair ? 'Unpairing...' : 'Confirm'}
              </PrimeManageButton>
            )}
          </TopButtonGroup>
        </UnpairPaper>
      </Modal>
      <UploadQueue open={uploadModal} update={uploadModal} onClose={() => setUploadModal(false)} device={device} />
    </>
  );
};

export default DeviceSettingsModal;

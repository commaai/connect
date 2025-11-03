import { devices as Devices } from '@commaai/api';
import { Button, CircularProgress, Divider, Modal, Paper, Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import * as Sentry from '@sentry/react';
import QrScanner from 'qr-scanner';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectDevice, updateDevice } from '../../actions';
import Colors from '../../colors';
import { pairErrorToMessage, verifyPairToken } from '../../utils';

const styles = (theme) => ({
  titleContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  addButton: {
    width: '100%',
    background: Colors.white,
    borderRadius: 18,
    color: Colors.grey900,
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
  },
  retryButton: {
    marginTop: 10,
    background: Colors.white,
    borderRadius: 18,
    color: Colors.grey900,
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
  },
  modal: {
    position: 'absolute',
    padding: theme.spacing(2),
    width: theme.spacing(50),
    maxWidth: '90%',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
  },
  divider: {
    marginBottom: 10,
  },
  videoContainer: {
    position: 'relative',
    margin: '0 auto',
    '& video': {
      display: 'block',
      width: '100%',
      maxWidth: '100%',
    },
  },
  videoContainerOverlay: {
    '&::before': {
      content: "''",
      position: 'absolute',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      top: -1,
      bottom: -1,
      right: -1,
      left: -1,
      zIndex: 3,
    },
  },
  videoOverlay: {
    position: 'absolute',
    zIndex: 4,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    textAlign: 'center',
    '& p': { fontSize: '1rem' },
  },
  pairedDongleId: {
    fontWeight: 'bold',
  },
  canvas: {
    position: 'absolute',
    zIndex: 2,
    width: '100%',
    height: '100%',
  },
});

const AddDevice = ({ classes, buttonText, buttonStyle, buttonIcon }) => {
  const dispatch = useDispatch();
  const devices = useSelector((state) => state.devices);

  const [modalOpen, setModalOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState(null);
  const [pairDongleId, setPairDongleId] = useState(null);
  const [canvasWidth, setCanvasWidth] = useState(null);
  const [canvasHeight, setCanvasHeight] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const qrScannerRef = useRef(null);

  // Check for camera availability
  useEffect(() => {
    if (hasCamera === null) {
      QrScanner.hasCamera().then((hasCam) => setHasCamera(hasCam));
    }
  }, [hasCamera]);

  // QR scanner callback
  const onQrRead = useCallback(
    async (result) => {
      if (pairLoading || pairError || pairDongleId || !result) {
        return;
      }

      Sentry.captureMessage('qr scanned', { extra: { result } });
      const fromUrl = result.startsWith('https://');
      let pairToken;
      if (fromUrl) {
        try {
          pairToken = new URLSearchParams(result.split('?')[1]).get('pair');
          if (!pairToken) {
            throw new Error('empty pairToken from url qr code');
          }
        } catch (err) {
          setPairLoading(false);
          setPairDongleId(null);
          setPairError('Error: could not parse pair token from detected url');
          console.error(err);
          return;
        }
      } else {
        try {
          // eslint-disable-next-line prefer-destructuring
          pairToken = result.split('--')[2];
          if (!pairToken) {
            throw new Error('empty pairToken from qr code');
          }
        } catch (err) {
          setPairLoading(false);
          setPairDongleId(null);
          setPairError('Error: invalid QR code detected');
          console.error(err);
          return;
        }
      }

      if (videoRef.current) {
        videoRef.current.pause();
      }
      if (qrScannerRef.current) {
        qrScannerRef.current._active = false;
      }
      setPairLoading(true);
      setPairDongleId(null);
      setPairError(null);

      try {
        verifyPairToken(pairToken, fromUrl, 'adddevice_verify_pairtoken');
      } catch (err) {
        setPairLoading(false);
        setPairDongleId(null);
        setPairError(`Error: ${err.message}`);
        return;
      }

      try {
        const resp = await Devices.pilotPair(pairToken);
        if (resp.dongle_id) {
          const device = await Devices.fetchDevice(resp.dongle_id);
          if (devices.length > 0) {
            // state change from no device to a device requires reload.
            dispatch(updateDevice(device));
          }
          setPairLoading(false);
          setPairDongleId(resp.dongle_id);
          setPairError(null);
        } else {
          setPairLoading(false);
          setPairDongleId(null);
          setPairError('Error: could not pair');
          Sentry.captureMessage('qr scan failed', { extra: { resp } });
        }
      } catch (err) {
        const msg = pairErrorToMessage(err, 'adddevice_pair_qr');
        setPairLoading(false);
        setPairDongleId(null);
        setPairError(`Error: ${msg}`);
      }
    },
    [pairLoading, pairError, pairDongleId, devices, dispatch],
  );

  // Setup and cleanup QR scanner
  useEffect(() => {
    if (modalOpen && videoRef.current && !qrScannerRef.current && hasCamera && !pairDongleId) {
      qrScannerRef.current = new QrScanner(videoRef.current, onQrRead);
    }

    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current._active = true;
        qrScannerRef.current.stop();
        qrScannerRef.current.destroy();
        qrScannerRef.current = null;
      }
    };
  }, [modalOpen, hasCamera, pairDongleId, onQrRead]);

  // Draw canvas overlay
  useEffect(() => {
    if (canvasRef.current && videoRef.current && videoRef.current.srcObject) {
      const { width, height } = canvasRef.current.getBoundingClientRect();
      if (canvasWidth !== width || canvasHeight !== height) {
        setCanvasWidth(width);
        setCanvasHeight(height);
        const size = Math.min(width, height);
        const x = (width - size) / 2 + size / 6;
        const y = (height - size) / 2 + size / 6;
        const rect = size * (2 / 3);
        const stroke = size / 6;

        canvasRef.current.width = width;
        canvasRef.current.height = height;

        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = 'white';

        ctx.beginPath();
        ctx.moveTo(x, y + stroke);
        ctx.lineTo(x, y);
        ctx.lineTo(x + stroke, y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + rect - stroke, y);
        ctx.lineTo(x + rect, y);
        ctx.lineTo(x + rect, y + stroke);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + rect, y + rect - stroke);
        ctx.lineTo(x + rect, y + rect);
        ctx.lineTo(x + rect - stroke, y + rect);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + stroke, y + rect);
        ctx.lineTo(x, y + rect);
        ctx.lineTo(x, y + rect - stroke);
        ctx.stroke();
      }
    }
  }, [canvasWidth, canvasHeight]);

  // Start QR scanner
  useEffect(() => {
    const startScanner = async () => {
      if (!pairLoading && !pairError && !pairDongleId && qrScannerRef.current && modalOpen && hasCamera) {
        try {
          await qrScannerRef.current.start();
        } catch (err) {
          if (err === 'Camera not found.') {
            setHasCamera(false);
          } else {
            console.error(err);
          }
        }
      }
    };

    startScanner();
  }, [modalOpen, hasCamera, pairLoading, pairError, pairDongleId]);

  const restart = () => {
    setPairLoading(false);
    setPairError(null);
    setPairDongleId(null);
    if (videoRef.current) {
      videoRef.current.play();
    }
    if (qrScannerRef.current) {
      qrScannerRef.current.start();
    }
  };

  const modalClose = () => {
    if (qrScannerRef.current) {
      qrScannerRef.current._active = true;
      qrScannerRef.current.stop();
      qrScannerRef.current.destroy();
      qrScannerRef.current = null;
    }

    if (pairDongleId && devices.length === 0) {
      window.location = `${window.location.origin}/${pairDongleId}`;
      return;
    }

    setModalOpen(false);
    setPairLoading(false);
    setPairError(null);
    setPairDongleId(null);
    if (pairDongleId) {
      dispatch(selectDevice(pairDongleId));
    }
  };

  const onOpenModal = () => {
    setModalOpen(true);
  };

  const videoContainerOverlay = pairLoading || pairDongleId || pairError ? classes.videoContainerOverlay : '';

  return (
    <>
      <Button onClick={onOpenModal} className={classes.addButton} style={buttonStyle}>
        {buttonText}
        {buttonIcon && <AddCircleOutlineIcon style={{ color: 'rgba(255, 255, 255, 0.3)' }} />}
      </Button>
      <Modal aria-labelledby="add-device-modal" open={modalOpen} onClose={modalClose}>
        <Paper className={classes.modal}>
          <div className={classes.titleContainer}>
            <Typography variant="title">Pair device</Typography>
            <Typography variant="caption">scan QR code</Typography>
          </div>
          <Divider className={classes.divider} />
          {hasCamera === false ? (
            <>
              <Typography style={{ marginBottom: 5 }}>Camera not found, please enable camera access.</Typography>
              <Typography>You can also scan the QR code on your comma device using any other QR code reader application.</Typography>
            </>
          ) : (
            <div className={`${classes.videoContainer} ${videoContainerOverlay}`}>
              <canvas className={classes.canvas} ref={canvasRef} />
              <div className={classes.videoOverlay}>
                {pairLoading && <CircularProgress size="10vw" style={{ color: '#525E66' }} />}
                {pairError && (
                  <>
                    <Typography>{pairError}</Typography>
                    <Button className={classes.retryButton} onClick={restart}>
                      try again
                    </Button>
                  </>
                )}
                {pairDongleId && (
                  <>
                    <Typography>
                      {'Successfully paired device '}
                      <span className={classes.pairedDongleId}>{pairDongleId}</span>
                    </Typography>
                    <Button className={classes.retryButton} onClick={modalClose}>
                      close
                    </Button>
                  </>
                )}
              </div>
              <video className={classes.video} ref={videoRef} />
            </div>
          )}
        </Paper>
      </Modal>
    </>
  );
};

export default withStyles(styles)(AddDevice);

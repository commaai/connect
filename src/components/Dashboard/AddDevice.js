import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import qs from 'query-string';
import QrScanner from 'qr-scanner';
import QrScannerWorkerPath from '!!file-loader!../../../node_modules/qr-scanner/qr-scanner-worker.min.js';
import { withStyles, Typography, Button, Modal, Paper, Divider, CircularProgress } from '@material-ui/core';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import * as Sentry from '@sentry/react';

import { devices as DevicesApi } from '@commaai/comma-api';
import { selectDevice, updateDevice } from '../../actions';
import { verifyPairToken, pairErrorToMessage } from '../../utils';
import Colors from '../../colors';

QrScanner.WORKER_PATH = QrScannerWorkerPath;

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
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
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
      content: '\'\'',
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

class AddDevice extends Component {
  constructor(props) {
    super(props);

    this.state = {
      modalOpen: false,
      hasCamera: null,
      pairLoading: false,
      pairError: null,
      pairDongleId: null,
      canvasWidth: null,
      canvasHeight: null,
    };

    this.videoRef = null;
    this.qrScanner = null;

    this.componentDidUpdate = this.componentDidUpdate.bind(this);
    this.onVideoRef = this.onVideoRef.bind(this);
    this.onCanvasRef = this.onCanvasRef.bind(this);
    this.modalClose = this.modalClose.bind(this);
    this.onQrRead = this.onQrRead.bind(this);
    this.restart = this.restart.bind(this);
  }

  async componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  async componentDidUpdate(prevProps, prevState) {
    const { modalOpen, hasCamera, pairLoading, pairError, pairDongleId } = this.state;
    if (hasCamera === null) {
      const hasCamera = await QrScanner.hasCamera();
      this.setState({ hasCamera });
    }

    if (modalOpen && this.videoRef && !this.qrScanner && hasCamera && !pairDongleId) {
      this.videoRef.addEventListener('play', this.componentDidUpdate);
      this.videoRef.addEventListener('loadeddata', this.componentDidUpdate);
      this.qrScanner = new QrScanner(this.videoRef, this.onQrRead);
    }

    if (this.canvasRef && this.videoRef && this.videoRef.srcObject) {
      const { width, height } = this.canvasRef.getBoundingClientRect();
      if (this.state.canvasWidth !== width || this.state.canvasHeight !== height) {
        this.setState({ canvasWidth: width, canvasHeight: height });
        const size = Math.min(width, height);
        const x = (width - size)/2 + (size / 6);
        const y = (height - size)/2 + (size / 6);
        const rect = size * (2 / 3);
        const stroke = size / 6;

        this.canvasRef.width = width;
        this.canvasRef.height = height;

        const ctx = this.canvasRef.getContext('2d');
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

    if (!pairLoading && !pairError && !pairDongleId && this.qrScanner && modalOpen && hasCamera !== false) {
      try {
        await this.qrScanner.start();
      }
      catch (err) {
        if (err === 'Camera not found.') {
          this.setState({ hasCamera: false });
        } else {
          console.log(err);
        }
      }
    }
  }

  async componentWillUnmount() {
    if (this.videoRef) {
      this.videoRef.removeEventListener('play', this.componentDidUpdate);
      this.videoRef.removeEventListener('loadeddata', this.componentDidUpdate);
    }
  }

  async onVideoRef(ref) {
    this.videoRef = ref;
    this.componentDidUpdate();
  }

  async onCanvasRef(ref) {
    this.canvasRef = ref;
    this.componentDidUpdate();
  }

  restart() {
    this.setState({ pairLoading: false, pairError: null, pairDongleId: null });
    if (this.videoRef) {
      this.videoRef.play();
    }
    if (this.qrScanner) {
      this.qrScanner.start();
    }
  }

  modalClose() {
    const { pairDongleId } = this.state;
    if (this.qrScanner) {
      this.qrScanner._active = true;
      this.qrScanner.stop();
      this.qrScanner.destroy();
      this.qrScanner = null;
    }

    if (pairDongleId && this.props.devices.length === 0) {
      this.props.dispatch(analyticsEvent('pair_device', {method: 'add_device_new'}));
      window.location = window.location.origin + '/' + pairDongleId;
      return;
    }

    this.setState({ modalOpen: false, pairLoading: false, pairError: null, pairDongleId: null });
    if (pairDongleId) {
      this.props.dispatch(selectDevice(pairDongleId));
    }
  }

  async onQrRead(result) {
    if (this.state.pairLoading || this.state.pairError || this.state.pairDongleId || !result) {
      return;
    }

    Sentry.captureMessage("qr scanned", { extra: { result } });
    const from_url = result.startsWith('https://');
    let pairToken;
    if (from_url) {
      try {
        pairToken = qs.parse(result.split('?')[1]).pair;
        if (!pairToken) {
          throw new Error('empty pairToken from url qr code');
        }
      }
      catch (err) {
        this.setState({ pairLoading: false, pairDongleId: null, pairError: 'Error: could not parse pair token from detected url' });
        console.log(err);
        return;
      }
    } else {
      try {
        pairToken = result.split('--')[2];
        if (!pairToken) {
          throw new Error('empty pairToken from qr code');
        }
      }
      catch (err) {
        this.setState({ pairLoading: false, pairDongleId: null, pairError: 'Error: invalid QR code detected' });
        console.log(err);
        return;
      }
    }

    if (this.videoRef) {
      this.videoRef.pause();
    }
    if (this.qrScanner) {
      this.qrScanner._active = false;
    }
    this.setState({ pairLoading: true, pairDongleId: null, pairError: null });

    try {
      verifyPairToken(pairToken, from_url, 'adddevice_verify_pairtoken');
    } catch (err) {
      this.setState({ pairLoading: false, pairDongleId: null, pairError: `Error: ${err.message}` });
      return;
    }

    try {
      const resp = await DevicesApi.pilotPair(pairToken);
      if (resp.dongle_id) {
        const device = await DevicesApi.fetchDevice(resp.dongle_id);
        if (this.props.devices.length > 0) { // state change from no device to a device requires reload.
          this.props.dispatch(updateDevice(device));
          this.props.dispatch(analyticsEvent('pair_device', {method: 'add_device_sidebar'}));
        }
        this.setState({ pairLoading: false, pairDongleId: resp.dongle_id, pairError: null });
      } else {
        console.log(resp);
        this.setState({ pairLoading: false, pairDongleId: null, pairError: 'Error: could not pair' });
        Sentry.captureMessage("qr scan failed", { extra: { resp } });
      }
    } catch(err) {
      const msg = pairErrorToMessage(err, 'adddevice_pair_qr');
      this.setState({ pairLoading: false, pairDongleId: null, pairError: `Error: ${msg}` });
    }
  }

  render() {
    const { classes, buttonText, buttonStyle, buttonIcon } = this.props;
    const { modalOpen, hasCamera, pairLoading, pairDongleId, pairError } = this.state;

    const videoContainerOverlay = (pairLoading || pairDongleId || pairError) ? classes.videoContainerOverlay : '';

    return (
      <>
        <Button onClick={ () => this.setState({ modalOpen: true }) } className={ classes.addButton } style={ buttonStyle }>
          { buttonText }
          { buttonIcon && <AddCircleOutlineIcon style={{ color: 'rgba(255, 255, 255, 0.3)' }} /> }
        </Button>
        <Modal aria-labelledby="add-device-modal" open={ modalOpen } onClose={ this.modalClose }>
          <Paper className={ classes.modal }>
            <div className={ classes.titleContainer }>
              <Typography variant="title">Pair device</Typography>
              <Typography variant="caption">
                scan QR code
              </Typography>
            </div>
            <Divider className={ classes.divider } />
            { hasCamera === false ?
              <>
                <Typography style={{ marginBottom: 5 }}>
                  Camera not found, please enable camera access.
                </Typography>
                <Typography>
                  You can also scan the QR code on your comma device using any other QR code reader application.
                </Typography>
              </>
            :
              <div className={ `${classes.videoContainer} ${videoContainerOverlay}` }>
                <canvas className={ classes.canvas } ref={ this.onCanvasRef } />
                <div className={ classes.videoOverlay }>
                  { pairLoading && <CircularProgress size="10vw" style={{ color: '#525E66' }} /> }
                  { pairError && <>
                    <Typography>{ pairError }</Typography>
                    <Button className={ classes.retryButton } onClick={ this.restart }>try again</Button>
                  </> }
                  { pairDongleId && <>
                    <Typography>
                      Successfully paired device <span className={ classes.pairedDongleId }>{ pairDongleId }</span>
                    </Typography>
                    <Button className={ classes.retryButton } onClick={ this.modalClose }>close</Button>
                  </> }
                </div>
                <video className={ classes.video } ref={ this.onVideoRef } />
              </div>
            }
          </Paper>
        </Modal>
      </>
    );
  }
}

const stateToProps = Obstruction({
  profile: 'profile',
  devices: 'devices',
});

export default connect(stateToProps)(withStyles(styles)(AddDevice));

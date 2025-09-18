// AddDevice.jsx
import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import qs from 'query-string';
import { withStyles, Typography, Button, Modal, Paper, Divider, CircularProgress } from '@material-ui/core';
import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline';
import * as Sentry from '@sentry/react';

import { devices as Devices } from '@commaai/api';
import { selectDevice, updateDevice, analyticsEvent } from '../../actions';
import { verifyPairToken, pairErrorToMessage } from '../../utils';
import Colors from '../../colors';

// NEW: zxing-wasm reader APIs
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';

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
    this.canvasRef = null;

    // scanning loop state
    this._frameCanvas = null;
    this._frameCtx = null;
    this._scanActive = false;
    this._stopRequested = false;
    this._lastTick = 0;        // throttle decode calls

    this.componentDidUpdate = this.componentDidUpdate.bind(this);
    this.onVideoRef = this.onVideoRef.bind(this);
    this.onCanvasRef = this.onCanvasRef.bind(this);
    this.modalClose = this.modalClose.bind(this);
    this.onCodeRead = this.onCodeRead.bind(this);
    this.restart = this.restart.bind(this);
    this.onOpenModal = this.onOpenModal.bind(this);
  }

  async componentDidMount() {
    // If you need to serve WASM from your own server (offline/private net),
    // copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to /static/
    // and uncomment this override:
    //
    // prepareZXingModule({
    //   overrides: {
    //     locateFile: (path, prefix) => path.endsWith('.wasm')
    //       ? '/static/zxing_reader.wasm'
    //       : prefix + path,
    //   },
    // });
    this.componentDidUpdate({}, {});
  }

  async componentDidUpdate() {
    const { modalOpen, pairLoading, pairError, pairDongleId } = this.state;
    let { hasCamera } = this.state;

    // detect camera once
    if (hasCamera === null) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        hasCamera = devs.some((d) => d.kind === 'videoinput');
      } catch {
        hasCamera = false;
      }
      this.setState({ hasCamera });
    }

    // draw overlay corners
    if (this.canvasRef && this.videoRef && this.videoRef.srcObject) {
      const { canvasWidth, canvasHeight } = this.state;
      const { width, height } = this.canvasRef.getBoundingClientRect();
      if (canvasWidth !== width || canvasHeight !== height) {
        this.setState({ canvasWidth: width, canvasHeight: height });
        const size = Math.min(width, height);
        const x = (width - size) / 2 + (size / 6);
        const y = (height - size) / 2 + (size / 6);
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

    // start scanning when modal open & ready
    if (modalOpen && hasCamera && !pairDongleId && !pairLoading && !pairError) {
      if (!this._scanActive) {
        await this.startScanner();
      }
    }
  }

  async componentWillUnmount() {
    await this.stopScanner(true);
  }

  async onVideoRef(ref) {
    this.videoRef = ref;
    this.componentDidUpdate();
  }

  async onCanvasRef(ref) {
    this.canvasRef = ref;
    this.componentDidUpdate();
  }

  onOpenModal() {
    this.setState({ modalOpen: true });
  }

  async restart() {
    this.setState({ pairLoading: false, pairError: null, pairDongleId: null });
    await this.resumeScanner();
  }

  async modalClose() {
    const { pairDongleId } = this.state;
    await this.stopScanner(true);

    if (pairDongleId && this.props.devices.length === 0) {
      this.props.dispatch(analyticsEvent('pair_device', { method: 'add_device_new' }));
      window.location = `${window.location.origin}/${pairDongleId}`;
      return;
    }

    this.setState({ modalOpen: false, pairLoading: false, pairError: null, pairDongleId: null });
    if (pairDongleId) {
      this.props.dispatch(selectDevice(pairDongleId));
    }
  }

  /** ------------------- Camera + scanning ------------------- */

  async startScanner() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!this.videoRef) return;
      this.videoRef.srcObject = stream;
      await this.videoRef.play();

      // setup offscreen canvas for frames
      const w = this.videoRef.videoWidth || 1280;
      const h = this.videoRef.videoHeight || 720;
      this._frameCanvas = document.createElement('canvas');
      this._frameCanvas.width = w;
      this._frameCanvas.height = h;
      this._frameCtx = this._frameCanvas.getContext('2d', { willReadFrequently: true });

      this._stopRequested = false;
      this._scanActive = true;
      this._lastTick = 0;
      this.scanLoop();
    } catch (err) {
      console.error(err);
      this.setState({ hasCamera: false, pairError: 'Error: camera unavailable' });
    }
  }

  async resumeScanner() {
    if (this._scanActive) return;
    if (this.videoRef && this.videoRef.srcObject) {
      try { await this.videoRef.play(); } catch {}
    } else {
      return this.startScanner();
    }
    this._stopRequested = false;
    this._scanActive = true;
    this.scanLoop();
  }

  async stopScanner(destroy = false) {
    this._stopRequested = true;
    this._scanActive = false;

    if (this.videoRef && this.videoRef.srcObject) {
      const tracks = this.videoRef.srcObject.getTracks();
      tracks.forEach((t) => t.stop());
      this.videoRef.srcObject = null;
    }
    this._frameCanvas = null;
    this._frameCtx = null;
  }

  async scanLoop() {
    if (!this.videoRef || !this._frameCtx) return;

    const step = async (ts) => {
      if (this._stopRequested) return;

      try {
        // throttle to ~12 FPS to save CPU
        if (!this._lastTick || ts - this._lastTick > 80) {
          this._lastTick = ts;

          const vw = this.videoRef.videoWidth || 0;
          const vh = this.videoRef.videoHeight || 0;
          if (vw && vh) {
            // Optional downscale for speed (keep <= 1280)
            const targetW = Math.min(1280, vw);
            const targetH = Math.floor((vh / vw) * targetW);
            if (this._frameCanvas.width !== targetW || this._frameCanvas.height !== targetH) {
              this._frameCanvas.width = targetW;
              this._frameCanvas.height = targetH;
            }
            this._frameCtx.drawImage(this.videoRef, 0, 0, targetW, targetH);
            const imageData = this._frameCtx.getImageData(0, 0, targetW, targetH);

            // Read barcodes from ImageData
            const results = await readBarcodes(imageData, {
              formats: ["PDF417", "QRCode", "Aztec", "DataMatrix", "rMQRCode"],
              maxNumberOfSymbols: 1,
              tryHarder: true,
              textMode: "Plain",
            });

            if (results && results.length) {
              const text = results[0].text || '';
              await this.onCodeRead(text);
              return; // stop loop; onCodeRead pauses scanner
            }
          }
        }
      } catch (e) {
        // decoding throws frequently when nothing is found; ignore
      }

      if (!this._stopRequested) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }

  /** ------------------- Pairing flow ------------------- */

  async onCodeRead(result) {
    const { pairDongleId, pairError, pairLoading } = this.state;
    if (pairLoading || pairError || pairDongleId || !result) return;

    Sentry.captureMessage('code scanned', { extra: { result } });

    // Accept either a URL with ?pair=... (or ?token=...) or the legacy "--" delimited token
    const fromUrl = result.startsWith('https://') || result.startsWith('http://');
    let pairToken;
    if (fromUrl) {
      try {
        const query = result.split('?')[1] || '';
        const parsed = qs.parse(query);
        pairToken = parsed.pair || parsed.token || '';
        if (!pairToken) throw new Error('empty pairToken from url code');
      } catch (err) {
        this.setState({ pairLoading: false, pairDongleId: null, pairError: 'Error: could not parse pair token from detected url' });
        console.error(err);
        return;
      }
    } else {
      try {
        pairToken = result.split('--')[2];
        if (!pairToken) throw new Error('empty pairToken from code');
      } catch (err) {
        this.setState({ pairLoading: false, pairDongleId: null, pairError: 'Error: invalid code detected' });
        console.error(err);
        return;
      }
    }

    // pause scanning while verifying/pairing
    this._stopRequested = true;
    this._scanActive = false;
    if (this.videoRef) {
      try { await this.videoRef.pause(); } catch {}
    }

    this.setState({ pairLoading: true, pairDongleId: null, pairError: null });

    try {
      verifyPairToken(pairToken, fromUrl, 'adddevice_verify_pairtoken');
    } catch (err) {
      this.setState({ pairLoading: false, pairDongleId: null, pairError: `Error: ${err.message}` });
      return;
    }

    const { devices, dispatch } = this.props;
    try {
      const resp = await Devices.pilotPair(pairToken);
      if (resp.dongle_id) {
        const device = await Devices.fetchDevice(resp.dongle_id);
        if (devices.length > 0) {
          dispatch(updateDevice(device));
          dispatch(analyticsEvent('pair_device', { method: 'add_device_sidebar' }));
        }
        this.setState({ pairLoading: false, pairDongleId: resp.dongle_id, pairError: null });
      } else {
        this.setState({ pairLoading: false, pairDongleId: null, pairError: 'Error: could not pair' });
        Sentry.captureMessage('scan failed', { extra: { resp } });
      }
    } catch (err) {
      const msg = pairErrorToMessage(err, 'adddevice_pair_code');
      this.setState({ pairLoading: false, pairDongleId: null, pairError: `Error: ${msg}` });
    }
  }

  render() {
    const { classes, buttonText, buttonStyle, buttonIcon } = this.props;
    const { modalOpen, hasCamera, pairLoading, pairDongleId, pairError } = this.state;

    const videoContainerOverlay = (pairLoading || pairDongleId || pairError) ? classes.videoContainerOverlay : '';

    return (
      <>
        <Button onClick={this.onOpenModal} className={ classes.addButton } style={ buttonStyle }>
          { buttonText }
          { buttonIcon && <AddCircleOutlineIcon style={{ color: 'rgba(255, 255, 255, 0.3)' }} /> }
        </Button>
        <Modal aria-labelledby="add-device-modal" open={ modalOpen } onClose={ this.modalClose }>
          <Paper className={ classes.modal }>
            <div className={ classes.titleContainer }>
              <Typography variant="title">Pair device</Typography>
              <Typography variant="caption">
                scan code (PDF417 / QR / Aztec / Data Matrix)
              </Typography>
            </div>
            <Divider className={ classes.divider } />
            { hasCamera === false
              ? (
                <>
                  <Typography style={{ marginBottom: 5 }}>
                    Camera not found, please enable camera access.
                  </Typography>
                  <Typography>
                    You can also scan the code on your comma device using any other code reader application.
                  </Typography>
                </>
              )
              : (
                <div className={ `${classes.videoContainer} ${videoContainerOverlay}` }>
                  <canvas className={ classes.canvas } ref={ this.onCanvasRef } />
                  <div className={ classes.videoOverlay }>
                    { pairLoading && <CircularProgress size="10vw" style={{ color: '#525E66' }} /> }
                    { pairError && (
                    <>
                      <Typography>{ pairError }</Typography>
                      <Button className={ classes.retryButton } onClick={ this.restart }>
                        try again
                      </Button>
                    </>
                    ) }
                    { pairDongleId && (
                    <>
                      <Typography>
                        {'Successfully paired device '}
                        <span className={ classes.pairedDongleId }>{ pairDongleId }</span>
                      </Typography>
                      <Button className={ classes.retryButton } onClick={ this.modalClose }>
                        close
                      </Button>
                    </>
                    ) }
                  </div>
                  <video className={ classes.video } ref={ this.onVideoRef } />
                </div>
              )}
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

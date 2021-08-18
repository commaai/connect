import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import qs from 'query-string';
import QrScanner from 'qr-scanner';
import QrScannerWorkerPath from '!!file-loader!../../../node_modules/qr-scanner/qr-scanner-worker.min.js';
import { withStyles, Typography, Button, Modal, Paper, Divider, CircularProgress } from '@material-ui/core';

import { devices as DevicesApi } from '@commaai/comma-api';
import { selectDevice } from '../../actions';
import { pairErrorToMessage } from '../../utils';
import Timelineworker from '../../timeline';
import Colors from '../../colors';

QrScanner.WORKER_PATH = QrScannerWorkerPath;

const styles = (theme) => ({
  addButton: {
    width: '100%',
    background: Colors.white,
    borderRadius: 18,
    color: '#404B4F',
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
    },
  },
  retryButton: {
    marginTop: 10,
    background: Colors.white,
    borderRadius: 18,
    color: '#404B4F',
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
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
      top: 0,
      bottom: 0,
      right: -1,
      left: -1,
      zIndex: 2,
    },
  },
  videoOverlay: {
    position: 'absolute',
    zIndex: 3,
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
    };

    this.videoRef = null;
    this.qrScanner = null;

    this.onVideoRef = this.onVideoRef.bind(this);
    this.modalClose = this.modalClose.bind(this);
    this.onQrRead = this.onQrRead.bind(this);
    this.restart = this.restart.bind(this);
  }

  async componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  async componentDidUpdate(prevProps, prevState) {
    if (this.state.hasCamera === null) {
      const hasCamera = await QrScanner.hasCamera();
      this.setState({ hasCamera });
    }

    if (this.videoRef && !this.qrScanner && this.state.hasCamera) {
      this.qrScanner = new QrScanner(this.videoRef, this.onQrRead);
    }

    if (this.qrScanner && this.state.modalOpen && this.state.hasCamera !== false) {
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

  async onVideoRef(ref) {
    this.videoRef = ref;
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
      this.qrScanner.stop();
      this.qrScanner.destroy();
      this.qrScanner = null;
    }
    let newState = { modalOpen: false, pairError: null, pairDongleId: null, hasCamera: null };
    if (pairDongleId) {
      if (this.props.devices.length > 0) {
        this.props.dispatch(selectDevice(pairDongleId));
      } else {
        window.location = window.location.origin;
        newState.modalOpen = true;
        newState.pairDongleId = pairDongleId;
        newState.hasCamera = true;
      }
    }
    this.setState(newState);
  }

  async onQrRead(result) {
    if (this.state.pairLoading || this.state.pairError || this.state.pairDongleId) {
      return;
    }

    this.setState({ msg: result })
    if (result.startsWith('https://')) {
      let pairToken;
      try {
        pairToken = qs.parse(result.split('?')[1]).pair;
      }
      catch (err) {
        console.log(err);
        return;
      }

      this.videoRef.pause();
      this.setState({ pairLoading: true, pairDongleId: null, pairError: null });
      try {
        const resp = await DevicesApi.pilotPair(pairToken);
        if (resp.dongle_id) {
          const device = await DevicesApi.fetchDevice(resp.dongle_id);
          if (this.props.devices.length > 0) { // state change from no device to a device requires reload.
            Timelineworker.updateDevice(device);
          }
          this.setState({ pairLoading: false, pairDongleId: resp.dongle_id, pairError: null });
        } else {
          console.log(resp);
          this.setState({ pairLoading: false, pairDongleId: null, pairError: 'Error: could not pair' });
        }
      } catch(err) {
        const msg = pairErrorToMessage(err, true);
        this.setState({ pairLoading: false, pairDongleId: null, pairError: `Error: ${msg}` });
      }
    }
  }

  render() {
    const { classes, buttonText } = this.props;
    const { modalOpen, hasCamera, pairLoading, pairDongleId, pairError } = this.state;

    const videoContainerOverlay = (pairLoading || pairDongleId || pairError) ? classes.videoContainerOverlay : '';

    return (
      <>
        <Button onClick={ () => this.setState({ modalOpen: true }) } className={ classes.addButton }>
          { buttonText }
        </Button>
        <Modal aria-labelledby="add-device-modal" open={ modalOpen } onClose={ this.modalClose }>
          <Paper className={ classes.modal }>
            <div className={ classes.titleContainer }>
              <Typography variant="title">Pair device</Typography>
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
                <div className={ classes.videoOverlay }>
                  { pairLoading && <CircularProgress size="20vw" style={{ color: '#525E66' }} /> }
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
  devices: 'workerState.devices',
});

export default connect(stateToProps)(withStyles(styles)(AddDevice));

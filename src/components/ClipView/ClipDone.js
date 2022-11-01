import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { Viewer } from 'photo-sphere-viewer';
import { EquirectangularVideoAdapter } from 'photo-sphere-viewer/dist/adapters/equirectangular-video';
import { VideoPlugin } from 'photo-sphere-viewer/dist/plugins/video';

import { clips as Clips } from '@commaai/api';
import { withStyles, Button, CircularProgress, Modal, Paper, Popper, Typography } from '@material-ui/core';
import CropOriginalIcon from '@material-ui/icons/CropOriginal';
import DeleteIcon from '@material-ui/icons/Delete';
import FileDownloadIcon from '@material-ui/icons/FileDownload';
import ShareIcon from '@material-ui/icons/Share';

import { selectRange } from '../../actions';
import { clipsDelete, clipsUpdateIsPublic } from '../../actions/clips';
import Colors from '../../colors';
import { Video360Icon } from '../../icons';
import { filterRegularClick } from '../../utils';
import SwitchLoading from '../utils/SwitchLoading';
import ResizeHandler from '../ResizeHandler';

const styles = (theme) => ({
  clipOption: {
    marginBottom: 12,
    width: '100%',
  },
  clipHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    '& h4': {
      color: Colors.white,
      margin: 0,
      fontSize: '1rem',
    },
    minHeight: '32px',
  },
  publicSwitch: {
    marginTop: '-16px',
  },
  buttonView: {
    display: 'flex',
    flexWrap: 'wrap',
    '& button': {
      marginBottom: 8,
    },
  },
  shareIcon: {
    display: 'inline',
    verticalAlign: 'text-bottom',
    margin: '0 3px',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    height: 26,
    minHeight: 26,
    fontSize: '0.8rem',
    padding: '4px 10px',
    borderRadius: 4,
    backgroundColor: Colors.white08,
    marginRight: 12,
    '&:hover': {
      backgroundColor: Colors.white10,
    },
    '& svg': {
      marginLeft: 2,
      height: 18,
      width: 18,
    },
  },
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    maxWidth: '90%',
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
  },
  deleteError: {
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    marginBottom: 10,
    padding: 10,
    '& p': { margin: 0 },
  },
  deleteSuccess: {
    backgroundColor: 'rgba(0, 255, 0, 0.3)',
    marginBottom: 10,
    padding: 10,
    '& p': { margin: 0 },
  },
  modalButtons: {
    marginTop: 10,
    display: 'flex',
    justifyContent: 'space-between',
    '& button': {
      backgroundColor: Colors.grey200,
      color: Colors.white,
      '&:hover': {
        backgroundColor: Colors.grey400,
      },
      '&:disabled': {
        backgroundColor: Colors.grey400,
      },
      '&:disabled:hover': {
        backgroundColor: Colors.grey400,
      },
    },
  },
  popover: {
    borderRadius: 16,
    padding: '8px 16px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    marginTop: 12,
    zIndex: 5000,
    maxWidth: '95%',
    '& p': {
      maxWidth: 400,
      fontSize: '0.9rem',
      color: Colors.white,
      margin: 0,
    },
  },
  videoOverlay360: {
    position: 'absolute',
    height: 32,
    width: 32,
    top: 10,
    left: 10,
    zIndex: 50,
  },
});

class ClipDone extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      copiedPopover: null,
      errorPopover: null,
      errorMessage: '',
      deleteModal: null,
    };

    this.copiedPopoverTimeout = null;
    this.errorPopoverTimeout = null;

    this.video360Container = null;
    this.video360Viewer = null;
    this.videoAttributesRetries = null;

    this.onResize = this.onResize.bind(this);
    this.showCopiedPopover = this.showCopiedPopover.bind(this);
    this.showErrorPopover = this.showErrorPopover.bind(this);
    this.shareCurrentClip = this.shareCurrentClip.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.makePublic = this.makePublic.bind(this);
    this.makePrivate = this.makePrivate.bind(this);
    this.onPublicToggle = this.onPublicToggle.bind(this);
    this.deleteClip = this.deleteClip.bind(this);
    this.closeDeleteModal = this.closeDeleteModal.bind(this);
    this.video360ContainerRef = this.video360ContainerRef.bind(this);
    this.setVideoAttributes = this.setVideoAttributes.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { clips } = this.props;
    if (prevProps.clips?.url !== clips?.url && clips?.url) {
      this.video360ContainerRef(null);
    }
  }

  video360ContainerRef(ref) {
    if (ref) {
      this.video360Container = ref;
    }
    const { clips } = this.props;
    if (clips?.url && this.video360Container && this.video360Viewer === null) {
      this.video360Viewer = new Viewer({
        container: this.video360Container,
        adapter: [EquirectangularVideoAdapter, {
          autoplay: true,
          muted: true,
        }],
        defaultZoomLvl: 40,
        touchmoveTwoFingers: true,
        navbar: ['videoPlay', 'videoTime', 'caption', 'zoomOut', 'zoomIn', 'fullscreen'],
        panorama: {
          source: clips.url,
        },
        plugins: [
          [VideoPlugin, {
            progressbar: true,
          }],
        ],
      });

      this.video360Viewer.once('ready', () => {
        this.videoAttributesRetries = 0;
        this.setVideoAttributes();

        const container = document.createElement('div');
        this.video360Container.querySelector('video').parentElement.appendChild(container);
        ReactDOM.render(<Video360Icon className={this.props.classes.videoOverlay360} />, container);

        this.video360Viewer.notification.show({
          content: 'Drag video to move around',
          timeout: 2000,
        });
      });
    }
  }

  setVideoAttributes() {  // hack to ensure playsinline is set
    const video = this.video360Container.querySelector('video');
    if (video) {
      video.setAttribute('playsinline', '');
    } else if (this.videoAttributesRetries < 300) {
      this.videoAttributesRetries++;
      setTimeout(this.setVideoAttributes, 100);
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  showCopiedPopover(ev) {
    this.setState({ copiedPopover: ev.target });
    if (this.copiedPopoverTimeout) {
      clearTimeout(this.copiedPopoverTimeout);
    }
    this.copiedPopoverTimeout = setTimeout(() => {
      this.setState({ copiedPopover: null });
    }, 1500);
  }

  showErrorPopover(ev, message) {
    this.setState({
      errorPopover: ev.target,
      errorMessage: message,
    });
    if (this.errorPopoverTimeout) {
      clearTimeout(this.errorPopoverTimeout);
    }
    this.errorPopoverTimeout = setTimeout(() => {
      this.setState({ errorPopover: null });
    }, 2000);
  }

  async shareCurrentClip(ev) {
    const { clips, dongleId } = this.props;
    ev.stopPropagation();
    ev.preventDefault();

    if (!clips.is_public && !(await this.makePublic(ev))) {
      return;
    }

    try {
      const url = `${window.location.origin}/${dongleId}/clips/${clips.clip_id}`;
      if (typeof navigator.share !== 'undefined') {
        await navigator.share({
          title: 'comma connect',
          url: url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        this.showCopiedPopover(ev);
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clip_done_share' });
      this.showErrorPopover(ev, 'failed to share clip');
    }
  }

  downloadFile() {
    const { clips } = this.props;
    if (clips.url) {
      window.location.href = clips.url;
    }
  }

  async makePublic(ev) {
    const { clips, dongleId } = this.props;

    try {
      const resp = await Clips.clipsUpdate(dongleId, clips.clip_id, true);
      if (resp.success) {
        this.props.dispatch(clipsUpdateIsPublic(clips.clip_id, true));
        return true;
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clips_update_public' });
    }

    this.showErrorPopover(ev, 'failed to make clip public');
    return false;
  }

  async makePrivate(ev) {
    const { clips, dongleId } = this.props;

    try {
      const resp = await Clips.clipsUpdate(dongleId, clips.clip_id, false);
      if (resp.success) {
        this.props.dispatch(clipsUpdateIsPublic(clips.clip_id, false));
        return;
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clips_update_private' });
    }

    this.showErrorPopover(ev, 'failed to make clip private');
  }

  async onPublicToggle(ev) {
    const { clips } = this.props;
    if (clips.is_public) {
      return this.makePrivate(ev);
    } else {
      return this.makePublic(ev);
    }
  }

  async deleteClip() {
    const { dongleId, clips } = this.props;
    this.setState({ deleteModal: { ...this.state.deleteModal, loading: true } });
    try {
      const resp = await Clips.clipsDelete(dongleId, clips.clip_id);
      if (resp.success) {
        this.setState({ deleteModal: { ...this.state.deleteModal, loading: false, error: null, success: 'Clip deleted' } });
      } else {
        console.log(resp);
        this.setState({ deleteModal: { ...this.state.deleteModal, loading: false, error: 'Failed to delete clip' } });
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_delete' });
      this.setState({ deleteModal: { ...this.state.deleteModal, loading: false, error: 'Could not delete clip' } });
    }
  }

  closeDeleteModal() {
    const { clips } = this.props;
    const { deleteModal } = this.state;
    if (deleteModal.success) {
      this.props.dispatch(clipsDelete(clips.clip_id));
    } else {
      this.setState({ deleteModal: null });
    }
  }

  render() {
    const { classes, clips, dongleId, device, profile } = this.props;
    const { windowWidth, deleteModal, copiedPopover, errorPopover, errorMessage } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const videoSizeStyle = windowWidth > 1080 ?
      { maxHeight: 'calc(100vh - 224px)', width: '100%' } :
      { maxHeight: 'calc(100vh - 64px)', width: '100%' };

    const authorized = Boolean(device?.is_owner || profile?.superuser);

    return <>
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ padding: viewerPadding }}>
        <div className={ `${classes.clipOption} ${classes.clipHeader}` }>
          <h4>
            { clips.title ? clips.title : clips.route.split('|')[1] }
          </h4>
          { authorized &&
            <SwitchLoading classes={{ root: classes.publicSwitch }} checked={ clips.is_public } onChange={ this.onPublicToggle } label="Public access" />
          }
        </div>
        <div className={ classes.clipOption }
          ref={ (el) => { if (el) el.addEventListener('touchstart', (ev) => ev.stopPropagation()); }}>
          { clips.video_type === '360' ?
            <div ref={ this.video360ContainerRef } style={{ ...videoSizeStyle, height: '50vh' }} />
          :
            <video autoPlay={true} controls={true} muted={true} playsInline={true} loop={true} style={ videoSizeStyle }
              poster={clips.thumbnail}>
              { clips.url && <source src={ clips.url} /> }
            </video>
          }
        </div>
        <div className={ classes.clipOption }>
          <div className={classes.buttonView}>
            <Button onClick={ this.downloadFile } className={ classes.button }>
              Download
              <FileDownloadIcon />
            </Button>
            { authorized && <>
              <Button
                className={ classes.button } title="Copy link to clipboard"
                onClick={ (ev) => { ev.persist(); this.shareCurrentClip(ev); } }
              >
                Share
                <ShareIcon />
              </Button>
              <Button className={ classes.button } href={ `/${dongleId}/${clips.start_time}/${clips.end_time}` }
                onClick={ filterRegularClick(() => this.props.dispatch(selectRange(clips.start_time, clips.end_time))) }>
                View route
                <CropOriginalIcon />
              </Button>
              <Button className={ classes.button } onClick={ () => this.setState({ deleteModal: {} }) }>
                Delete
                <DeleteIcon />
              </Button>
            </> }
          </div>
        </div>
      </div>
      <Popper open={ Boolean(copiedPopover) } placement='bottom' anchorEl={ copiedPopover }
        className={ classes.popover }>
        <Typography>copied to clipboard</Typography>
      </Popper>
      <Popper open={ Boolean(errorPopover) } placement='bottom' anchorEl={ errorPopover }
        className={ classes.popover }>
        <Typography>{ errorMessage }</Typography>
      </Popper>
      <Modal open={ Boolean(deleteModal) } onClose={ this.closeDeleteModal }>
        <Paper className={classes.modal}>
          { Boolean(deleteModal?.error) && <div className={ classes.deleteError }>
            <Typography>{ deleteModal?.error }</Typography>
          </div> }
          { Boolean(deleteModal?.success) && <div className={ classes.deleteSuccess }>
            <Typography>{ deleteModal?.success }</Typography>
          </div> }
          <Typography>Are you sure you want to permanently delete this clip?</Typography>
          <div className={ classes.modalButtons }>
            <Button variant="contained" onClick={ this.closeDeleteModal }>
              Close
            </Button>
            <Button variant="contained" disabled={ Boolean(deleteModal?.success || deleteModal?.loading) }
              onClick={ this.deleteClip }>
              { deleteModal?.loading ? <CircularProgress size={ 19 } style={{ color: Colors.white }} /> : 'Delete clip' }
            </Button>
          </div>
        </Paper>
      </Modal>
    </>;
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  clips: 'clips',
  device: 'device',
  profile: 'profile',
});

export default connect(stateToProps)(withStyles(styles)(ClipDone));

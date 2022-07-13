import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Button, Modal, Paper, Typography, CircularProgress } from '@material-ui/core';
import ShareIcon from '@material-ui/icons/Share';
import FileDownloadIcon from '@material-ui/icons/FileDownload';
import DeleteIcon from '@material-ui/icons/Delete';
import PublishIcon from '@material-ui/icons/LockOpen';
import LockOutlineIcon from '@material-ui/icons/LockOutline';
import { clips as ClipsApi } from '@commaai/comma-api';

import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { clipsDelete, clipsUpdateIsPublic } from '../../actions/clips';

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
    minHeight: 14,
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
  shareButton: {
    marginLeft: 8,
    marginRight: 0,
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
});

class ClipDone extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      deleteModal: null,
    };

    this.onResize = this.onResize.bind(this);
    this.shareCurrentClip = this.shareCurrentClip.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.togglePublic = this.togglePublic.bind(this);
    this.deleteClip = this.deleteClip.bind(this);
    this.closeDeleteModal = this.closeDeleteModal.bind(this);
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  async shareCurrentClip() {
    try {
      await navigator.share({
        title: 'comma connect',
        url: window.location.href,
      });
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'clip_navigator_share' });
    }
  }

  downloadFile() {
    const { clips } = this.props;
    if (clips.url) {
      window.location.href = clips.url;
    }
  }

  async togglePublic() {
    const { dongleId, clips } = this.props;
    const new_is_public = !clips.is_public;
    try {
      const resp = await ClipsApi.clipsUpdate(dongleId, clips.clip_id, new_is_public);
      if (resp.success) {
        this.props.dispatch(clipsUpdateIsPublic(clips.clip_id, new_is_public));
      }
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'clips_fetch_update_public' });
    }
  }

  async deleteClip() {
    const { dongleId, clips } = this.props;
    this.setState({ deleteModal: { ...this.state.deleteModal, loading: true } });
    try {
      const resp = await ClipsApi.clipsDelete(dongleId, clips.clip_id);
      if (resp.success) {
        this.setState({ deleteModal: { ...this.state.deleteModal, loading: false, error: null, success: 'Clip deleted' } });
      } else {
        console.log(resp);
        this.setState({ deleteModal: { ...this.state.deleteModal, loading: false, error: 'Failed to delete clip' } });
      }
    } catch (err) {
      console.log(err);
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
    const { classes, clips, device, profile } = this.props;
    const { windowWidth, deleteModal } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    const videoSizeStyle = windowWidth > 1080 ?
      { maxHeight: 'calc(100vh - 224px)', width: '100%' } :
      { maxHeight: 'calc(100vh - 64px)', width: '100%' };

    return <>
      <ResizeHandler onResize={ this.onResize } />

      <div style={{ padding: viewerPadding }}>
        <div className={ `${classes.clipOption} ${classes.clipHeader}` }>
          <h4>
            { clips.title ? clips.title : clips.route.split('|')[1] }
          </h4>
          { Boolean(typeof navigator.share !== 'undefined' && clips.is_public) &&
            <Button onClick={ this.shareCurrentClip } className={ `${classes.button} ${classes.shareButton}` }>
              Share
              <ShareIcon />
            </Button>
          }
        </div>
        <div className={ classes.clipOption }>
          <video autoPlay={true} controls={true} muted={true} playsInline={true} loop={true} style={ videoSizeStyle }>
            { clips.url && <source src={ clips.url} /> }
          </video>
        </div>
        <div className={ classes.clipOption }>
          <div className={classes.buttonView}>
            <Button onClick={ this.downloadFile } className={ classes.button }>
              Download
              <FileDownloadIcon />
            </Button>
            { Boolean(device?.is_owner || profile?.superuser) && <>
              <Button onClick={ this.togglePublic } className={ classes.button }>
                { clips.is_public ? 'Make private' : 'Make public' }
                { clips.is_public ? <LockOutlineIcon /> : <PublishIcon /> }
              </Button>
              <Button className={ classes.button }
                onClick={ () => this.setState({ deleteModal: {} }) }>
                Delete
                <DeleteIcon />
              </Button>
            </> }
          </div>
        </div>
      </div>
      <Modal open={ Boolean(deleteModal) } onClose={ this.closeDeleteModal }>
        <Paper className={classes.modal}>
          { Boolean(deleteModal?.error) && <div className={ classes.deleteError }>
            <Typography>{ deleteModal?.error }</Typography>
          </div> }
          { Boolean(deleteModal?.success) && <div className={ classes.deleteSuccess }>
            <Typography>{ deleteModal?.success }</Typography>
          </div> }
          <Typography>Are you sure you want to permatently delete this clip?</Typography>
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

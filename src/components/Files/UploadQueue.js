import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Divider, Typography, CircularProgress, Button, Modal, Paper } from '@material-ui/core';
import { athena as AthenaApi } from '@commaai/comma-api';

import { fetchUploadQueue, updateFiles } from '../../actions/files';
import Colors from '../../colors';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    maxWidth: '90%',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    outline: 'none',
  },
  titleContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    '& button': {
      marginLeft: 8,
      fontWeight: 600,
      borderRadius: 13,
      fontSize: '0.8rem',
      padding: '4px 12px',
      minHeight: 19,
    },
  },
  buttonGroup: {
    textAlign: 'right'
  },
  uploadContainer: {
    margin: `${theme.spacing.unit}px 0`,
    color: Colors.white,
    textAlign: 'left',
    maxHeight: 'calc(90vh - 73px)',
    overflowY: 'auto',
  },
  uploadCell: {
    height: 25,
    padding: '0 8px',
    '& button': {
      fontWeight: 600,
      borderRadius: 13,
      fontSize: '0.8rem',
      padding: '4px 12px',
      minHeight: 19,
    },
  },
  cancelButton: {
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
});

const FILE_NAMES = {
  'qcameras': 'qcamera.ts',
  'cameras': 'fcamera.hevc',
  'dcameras': 'dcamera.hevc',
  'ecameras': 'ecamera.hevc',
  'qlogs': 'qlog.bz2',
  'logs': 'rlog.bz2',
};
const MAX_OPEN_REQUESTS = 15;
const MAX_RETRIES = 5;

class UploadQueue extends Component {
  constructor(props) {
    super(props);

    this.state = {
      cancelQueue: [],
    };

    this.cancelUpload = this.cancelUpload.bind(this);
    this.athenaCall = this.athenaCall.bind(this);
    this.uploadQueue = this.uploadQueue.bind(this);

    this.uploadQueueIntv = null;
    this.openRequests = 0;
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps) {
    if (prevProps.filesUploading !== this.props.filesUploading && this.props.filesUploading) {
      this.uploadQueue(Boolean(Object.keys(this.props.filesUploading).length));
    }

    if (prevProps.update !== this.props.update) {
      this.uploadQueue(Boolean(this.props.update));
    }
  }

  componentWillUnmount() {
    this.uploadQueue(false);
  }

  uploadQueue(enable) {
    if (enable && !this.uploadQueueIntv) {
      this.uploadQueueIntv = setInterval(() => this.props.dispatch(fetchUploadQueue()), 2000);
      this.props.dispatch(fetchUploadQueue());
    } else if (!enable && this.uploadQueueIntv) {
      clearInterval(this.uploadQueueIntv);
      this.uploadQueueIntv = null;
    }
  }

  async athenaCall(payload, sentry_fingerprint, retryCount = 0) {
    const { dongleId } = this.props;
    try {
      while (this.openRequests > MAX_OPEN_REQUESTS) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      this.openRequests += 1;
      const resp = await AthenaApi.postJsonRpcPayload(dongleId, payload);
      this.openRequests -= 1;
      if (dongleId === this.props.dongleId) {
        return resp;
      }
    } catch(err) {
      this.openRequests -= 1;
      if (!err.resp && retryCount < MAX_RETRIES) {
        setTimeout(() => this.athenaCall(payload, sentry_fingerprint, retryCount + 1), 2000);
      }
      if (dongleId === this.props.dongleId) {
        if (!err.message || err.message.indexOf('Device not registered') === -1) {
          console.log(err);
          Sentry.captureException(err, { fingerprint: sentry_fingerprint });
        }
        return { error: err.message };
      }
    }
  }

  async cancelUpload(ids) {
    if (ids === undefined) {
      ids = Object.keys(this.props.filesUploading);
    }

    this.setState((prevState) => {
      return { cancelQueue: prevState.cancelQueue.concat(ids) };
    });

    for (const id of ids) {
      if (!this.props.filesUploading[id] || this.props.filesUploading[id].current) {
        this.setState((prevState) => {
          const { cancelQueue } = prevState;
          const index = cancelQueue.indexOf(id);
          if (index !== -1) {
            cancelQueue.splice(index, 1);
          }
          return { cancelQueue };
        });
        continue;
      }
      const payload = {
        id: 0,
        jsonrpc: "2.0",
        method: "cancelUpload",
        params: { upload_id: id },
      };
      this.athenaCall(payload, 'media_athena_cancelupload').then((resp) => {
        this.uploadQueue(true);
        const { fileName } = this.props.filesUploading[id];
        const files = {};
        files[fileName] = {};
        this.props.dispatch(updateFiles(files));
      });
    }
  }

  render() {
    const { dongleId, classes, filesUploading } = this.props;
    const { cancelQueue } = this.state;

    const hasUploading = filesUploading && Object.keys(filesUploading).length > 0;

    return (
      <Modal aria-labelledby="upload-queue-modal" open={ this.props.open } onClose={ this.props.onClose }>
        <Paper className={ classes.modal }>
          <div className={ classes.titleContainer }>
            <div className={ classes.titleRow }>
              <Typography variant="title">
                Upload queue
              </Typography>
              { hasUploading &&
                <Button onClick={ () => this.cancelUpload() }>
                  cancel all
                </Button>
              }
            </div>
            <Typography variant="caption" style={{ marginLeft: 8 }}>{ dongleId }</Typography>
          </div>
          <Divider />
          <div className={ classes.uploadContainer }>
            { hasUploading ?
              <table>
                <thead>
                  <tr>
                    <th className={ classes.uploadCell }>segment</th>
                    <th className={ classes.uploadCell }>type</th>
                    <th className={ classes.uploadCell }>progress</th>
                    <th className={ classes.uploadCell }></th>
                  </tr>
                </thead>
                <tbody>
                  { Object.entries(filesUploading).reverse().map(([id, upload]) => {
                    const isCancelled = cancelQueue.includes(id);
                    const [seg, type] = upload.fileName.split('/');
                    return (
                      <tr key={ id }>
                        <td className={ classes.uploadCell }>{ seg.split('|')[1] }</td>
                        <td className={ classes.uploadCell }>{ FILE_NAMES[type].split('.')[0] }</td>
                        <td className={ classes.uploadCell }>
                          { upload.current ? `${parseInt(upload.progress * 100)}%` : 'pending' }
                        </td>
                        <td className={ classes.uploadCell }>
                          { !upload.current &&
                            <Button onClick={ !isCancelled ? () => this.cancelUpload([id]) : null }
                              disabled={ isCancelled }>
                              { isCancelled ?
                                <CircularProgress style={{ color: Colors.white }} size={ 17 } /> :
                                'cancel' }
                            </Button>
                          }
                        </td>
                      </tr>
                    );
                  }) }
                </tbody>
              </table>
            :
              filesUploading ?
                <p>no uploads</p> :
                <CircularProgress style={{ color: Colors.white, margin: 8 }} size={ 17 } />
            }
          </div>
          <div className={classes.buttonGroup}>
            <Button variant="contained" className={ classes.cancelButton } onClick={ this.props.onClose }>
              Close
            </Button>
          </div>
        </Paper>
      </Modal>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  files: 'files',
  filesUploading: 'filesUploading',
});

export default connect(stateToProps)(withStyles(styles)(UploadQueue));

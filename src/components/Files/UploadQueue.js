import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Divider, Typography, CircularProgress, Button, Modal, Paper, LinearProgress
  } from '@material-ui/core';

import { fetchUploadQueue, cancelUpload } from '../../actions/files';
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
    color: Colors.white90,
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
  uploadProgress: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.8rem',
    '& > div': {
      width: 30,
      height: 8,
      marginRight: 6,
      border: 'none',
      backgroundColor: Colors.white30,
      '& > div': {
        backgroundColor: Colors.white80,
        transition: 'transform 0.5s linear',
      },
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

class UploadQueue extends Component {
  constructor(props) {
    super(props);

    this.state = {
      cancelQueue: [],
    };

    this.cancelUploads = this.cancelUploads.bind(this);
    this.uploadQueue = this.uploadQueue.bind(this);

    this.uploadQueueIntv = null;
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps) {
    if (prevProps.update !== this.props.update) {
      this.uploadQueue(this.props.update);
    } else if (this.props.update && prevProps.filesUploading !== this.props.filesUploading) {
      this.uploadQueue(Boolean(Object.keys(this.props.filesUploading).length));
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

  async cancelUploads(ids) {
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
      this.props.dispatch(cancelUpload(id));
    }
    this.uploadQueue(true);
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
                <Button onClick={ () => this.cancelUploads() }>
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
                    const prog = parseInt(upload.progress * 100);
                    return (
                      <tr key={ id }>
                        <td className={ classes.uploadCell }>{ seg.split('|')[1] }</td>
                        <td className={ classes.uploadCell }>{ FILE_NAMES[type].split('.')[0] }</td>
                        { upload.current ?
                          <td className={ `${classes.uploadCell} ${classes.uploadProgress}` }>
                            <LinearProgress size={ 17 } variant="determinate" value={ prog } /> { prog }%
                          </td>
                        :
                          <td className={ classes.uploadCell }>pending</td>
                        }
                        <td className={ classes.uploadCell }>
                          { !upload.current &&
                            <Button onClick={ !isCancelled ? () => this.cancelUploads([id]) : null }
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

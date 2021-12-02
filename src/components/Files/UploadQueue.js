import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Divider, Typography, CircularProgress, Button, Modal, Paper, LinearProgress
  } from '@material-ui/core';

import { fetchUploadQueue, cancelUpload } from '../../actions/files';
import Colors from '../../colors';
import ResizeHandler from '../ResizeHandler';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: 'max-content',
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
      padding: '2px 10px',
      minHeight: 19,
      backgroundColor: Colors.white05,
      '&:hover': {
        backgroundColor: Colors.white10,
      },
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
  uploadTable: {
    borderCollapse: 'collapse',
  },
  uploadCell: {
    height: 25,
    padding: '0 8px',
    '& button': {
      fontWeight: 600,
      borderRadius: 13,
      fontSize: '0.8rem',
      padding: '2px 10px',
      minHeight: 19,
      backgroundColor: Colors.white05,
      '&:hover': {
        backgroundColor: Colors.white10,
      },
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
      windowWidth: window.innerWidth,
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
    } else if (this.props.update && prevProps.dongleId !== this.props.dongleId) {
      this.uploadQueue(true);
    } else if (this.props.update && prevProps.filesUploading !== this.props.filesUploading) {
      this.uploadQueue(Boolean(Object.keys(this.props.filesUploading).length));
    }
  }

  componentWillUnmount() {
    this.uploadQueue(false);
  }

  uploadQueue(enable) {
    if (enable && !this.uploadQueueIntv) {
      const { dongleId } = this.props;
      this.uploadQueueIntv = setInterval(() => this.props.dispatch(fetchUploadQueue(dongleId)), 2000);
      this.props.dispatch(fetchUploadQueue(dongleId));
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
    const { dongleId, classes, filesUploading, filesUploadingMeta } = this.props;
    const { cancelQueue, windowWidth } = this.state;

    const hasData = filesUploadingMeta.dongleId === dongleId;
    const hasUploading = hasData && Object.keys(filesUploading).length > 0;
    const logNameLength = windowWidth < 600 ? 4 : 64;

    return ( <>
      <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
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
              <table className={ classes.uploadTable }>
                <thead>
                  <tr>
                    <th className={ classes.uploadCell }>segment</th>
                    <th className={ classes.uploadCell }>type</th>
                    <th className={ classes.uploadCell }>progress</th>
                    { windowWidth >= 600 && <th className={ classes.uploadCell }></th> }
                  </tr>
                </thead>
                <tbody>
                  { Object.entries(filesUploading).map(([id, upload]) => {
                    const isCancelled = cancelQueue.includes(id);
                    const [seg, type] = upload.fileName.split('/');
                    const prog = parseInt(upload.progress * 100);
                    return (
                      <tr key={ id }>
                        <td className={ classes.uploadCell }>{ seg.split('|')[1] }</td>
                        <td className={ classes.uploadCell }>
                          { FILE_NAMES[type].split('.')[0].substring(0, logNameLength) }
                        </td>
                        { upload.current ?
                          <td className={ `${classes.uploadCell} ${classes.uploadProgress}` }>
                            <LinearProgress size={ 17 } variant="determinate" value={ prog } /> { prog }%
                          </td>
                        :
                          <>
                            { windowWidth >= 600 && <td className={ classes.uploadCell }>pending</td> }
                            <td className={ classes.uploadCell }>
                              <Button onClick={ !isCancelled ? () => this.cancelUploads([id]) : null }
                                disabled={ isCancelled }>
                                { isCancelled ?
                                  <CircularProgress style={{ color: Colors.white }} size={ 17 } /> :
                                  'cancel' }
                              </Button>
                            </td>
                          </>
                        }
                      </tr>
                    );
                  }) }
                </tbody>
              </table>
            :
              hasData ?
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
    </> );
  }
}

const stateToProps = Obstruction({
  filesUploading: 'filesUploading',
  filesUploadingMeta: 'filesUploadingMeta',
});

export default connect(stateToProps)(withStyles(styles)(UploadQueue));

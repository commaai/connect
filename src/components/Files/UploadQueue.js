import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles, Divider, Typography, CircularProgress, Button, Modal, Paper, LinearProgress,
  } from '@material-ui/core';
import HighlightOffIcon from '@material-ui/icons/HighlightOff';

import { fetchUploadQueue, cancelUpload, cancelFetchUploadQueue } from '../../actions/files';
import { deviceIsOnline } from '../../utils';
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
  buttonGroup: {
    textAlign: 'right'
  },
  uploadContainer: {
    margin: `${theme.spacing.unit}px 0`,
    color: Colors.white90,
    textAlign: 'left',
    overflowY: 'auto',
  },
  uploadTable: {
    borderCollapse: 'collapse',
  },
  uploadCell: {
    height: 25,
  },
  cancelCell: {
    textAlign: 'center',
    '& button': {
      minWidth: 'unset',
      padding: 0,
      fontWeight: 600,
      borderRadius: 13,
      minHeight: 'unset',
      '&:hover': {
        backgroundColor: 'transparent',
      },
      '& svg': {
        fontSize: 18,
      },
    },
  },
  segmentName: {
    display: 'flex',
    flexWrap: 'wrap',
    '& span': {
      whiteSpace: 'nowrap',
    },
  },
  uploadCancelled: {
    color: Colors.white,
    margin: 1.5,
  },
  uploadProgress: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    '& > div': {
      width: '80%',
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
    marginLeft: 8,
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

function sortUploads([_1, a], [_2, b]) {
  if (a.current) {
    return -1;
  } else if (b.current) {
    return 1;
  } else {
    return a.createdAt - b.createdAt;
  }
}

class UploadQueue extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      cancelQueue: [],
    };

    this.cancelUploads = this.cancelUploads.bind(this);
    this.uploadQueue = this.uploadQueue.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps) {
    if (prevProps.update !== this.props.update) {
      this.uploadQueue(this.props.update);
    } else if (this.props.update && prevProps.device.dongle_id !== this.props.device.dongle_id) {
      this.uploadQueue(true);
    } else if (this.props.update && prevProps.filesUploading !== this.props.filesUploading) {
      this.uploadQueue(Boolean(Object.keys(this.props.filesUploading).length));
    }
  }

  componentWillUnmount() {
    this.uploadQueue(false);
  }

  uploadQueue(enable) {
    if (enable) {
      this.props.dispatch(fetchUploadQueue(this.props.device.dongle_id));
    } else {
      cancelFetchUploadQueue();
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
      this.props.dispatch(cancelUpload(this.props.device.dongle_id, id));
    }
    this.uploadQueue(true);
  }

  render() {
    const { device, classes, filesUploading, filesUploadingMeta } = this.props;
    const { cancelQueue, windowWidth, windowHeight } = this.state;

    const deviceOffline = !deviceIsOnline(device);
    const hasData = filesUploadingMeta.dongleId === device.dongle_id;
    const hasUploading = !deviceOffline && hasData && Object.keys(filesUploading).length > 0;
    const logNameLength = windowWidth < 600 ? 4 : 64;
    const segmentNameStyle = windowWidth < 450 ? { fontSize: windowWidth < 400 ? '0.8rem' : '0.9rem' } : {};
    const cellStyle = { padding: windowWidth < 400 ? '0 2px' : (windowWidth < 450 ? '0 4px' : '0 8px') };

    return ( <>
      <ResizeHandler onResize={ (windowWidth, windowHeight) => this.setState({ windowWidth, windowHeight }) } />
      <Modal aria-labelledby="upload-queue-modal" open={ this.props.open } onClose={ this.props.onClose }>
        <Paper className={ classes.modal }>
          <div className={ classes.titleContainer }>
            <Typography variant="title">Upload queue</Typography>
            <Typography variant="caption" style={{ marginLeft: 8 }}>{ device.dongle_id }</Typography>
          </div>
          <Divider />
          <div className={ classes.uploadContainer } style={{ maxHeight: (windowHeight * 0.90) - 98 }}>
            { hasUploading ?
              <table className={ classes.uploadTable }>
                <thead>
                  <tr>
                    <th className={ classes.uploadCell } style={ cellStyle }>segment</th>
                    <th className={ classes.uploadCell } style={ cellStyle }>type</th>
                    <th className={ classes.uploadCell } style={ cellStyle }>progress</th>
                    { windowWidth >= 600 && <th className={ classes.uploadCell } style={ cellStyle }></th> }
                  </tr>
                </thead>
                <tbody>
                  { Object.entries(filesUploading).reverse().sort(sortUploads).map(([id, upload]) => {
                    const isCancelled = cancelQueue.includes(id);
                    const [seg, type] = upload.fileName.split('/');
                    const prog = parseInt(upload.progress * 100);
                    const segString = seg.split('|')[1];
                    return (
                      <tr key={ id }>
                        <td className={ classes.uploadCell } style={ cellStyle }>
                          <div className={ classes.segmentName } style={ segmentNameStyle }>
                            <span>{ segString.substring(0, 12) }</span>
                            <span>{ segString.substring(12)}</span>
                          </div>
                        </td>
                        <td className={ classes.uploadCell } style={ cellStyle }>
                          { FILE_NAMES[type].split('.')[0].substring(0, logNameLength) }
                        </td>
                        { upload.current ?
                          <td className={ classes.uploadCell } style={ cellStyle }>
                            <div className={ classes.uploadProgress }>
                              <LinearProgress variant="determinate" value={ prog } />
                            </div>
                          </td>
                        :
                          <>
                            { windowWidth >= 600 && <td className={ classes.uploadCell } style={ cellStyle }>pending</td> }
                            <td className={ `${classes.uploadCell} ${classes.cancelCell}` } style={ cellStyle }>
                              { isCancelled ?
                                <CircularProgress className={ classes.uploadCancelled } size={ 15 } /> :
                                <Button onClick={ () => this.cancelUploads([id]) }><HighlightOffIcon /></Button> }
                            </td>
                          </>
                        }
                      </tr>
                    );
                  }) }
                </tbody>
              </table>
            :
              deviceOffline ?
                <p>device offline</p> :
                ( hasData ?
                  <p>no uploads</p> :
                  <CircularProgress style={{ color: Colors.white, margin: 8 }} size={ 17 } /> )
            }
          </div>
          <div className={classes.buttonGroup}>
            <Button variant="contained" className={ classes.cancelButton } disabled={ !hasUploading }
              onClick={ hasUploading ? () => this.cancelUploads() : null }>
              cancel all
            </Button>
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

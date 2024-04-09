import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import {
  withStyles,
  Divider, Typography, CircularProgress, Button, Modal, Paper, LinearProgress,
} from '@material-ui/core';
import HighlightOffIcon from '@material-ui/icons/HighlightOff';
import WarningIcon from '@material-ui/icons/Warning';

import { fetchUploadQueue, cancelUploads, cancelFetchUploadQueue } from '../../actions/files';
import { deviceIsOnline, deviceOnCellular, deviceVersionAtLeast } from '../../utils';
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
    textAlign: 'right',
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
  cellularWarning: {
    backgroundColor: Colors.grey500,
    padding: `${theme.spacing.unit * 1.5}px ${theme.spacing.unit * 2}px`,
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: theme.spacing.unit,
    '& div': {
      display: 'flex',
      alignItems: 'center',
      marginBottom: 2,
      '& svg': { marginRight: 8 },
    },
  },
});

const FILE_NAMES = {
  qcameras: 'qcamera.ts',
  cameras: 'fcamera.hevc',
  dcameras: 'dcamera.hevc',
  ecameras: 'ecamera.hevc',
  qlogs: 'qlog.bz2',
  logs: 'rlog.bz2',
};

class UploadQueue extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      cancelQueue: [],
    };

    this.cancelUploading = this.cancelUploading.bind(this);
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

  async cancelUploading(ids) {
    const { device, dispatch, filesUploading } = this.props;
    if (ids === undefined) {
      ids = Object.keys(filesUploading);
    }

    ids = ids.filter((id) => filesUploading[id] && !filesUploading[id].current);
    this.setState((prevState) => ({ cancelQueue: prevState.cancelQueue.concat(ids) }));

    if (deviceVersionAtLeast(device, '0.8.13')) {
      dispatch(cancelUploads(device.dongle_id, ids));
    } else {
      ids.forEach((id) => dispatch(cancelUploads(device.dongle_id, id)));
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

    const uploadSorted = Object.entries(filesUploading);
    if (uploadSorted.length && uploadSorted[uploadSorted.length - 1][1].current) {
      const curr = uploadSorted.splice([uploadSorted.length - 1], 1);
      uploadSorted.unshift(curr[0]);
    }

    const allPaused = uploadSorted.every((upload) => upload.paused);

    return (
      <>
        <ResizeHandler onResize={ (ww, wh) => this.setState({ windowWidth: ww, windowHeight: wh }) } />
        <Modal aria-labelledby="upload-queue-modal" open={ this.props.open } onClose={ this.props.onClose }>
          <Paper className={ classes.modal }>
            <div className={ classes.titleContainer }>
              <Typography variant="title">Upload queue</Typography>
              <Typography variant="caption" style={{ marginLeft: 8 }}>{ device.dongle_id }</Typography>
            </div>
            <Divider />
            <div className={ classes.uploadContainer } style={{ maxHeight: (windowHeight * 0.90) - 98 }}>
              { hasUploading ? (
                <>
                  { deviceOnCellular(device) && allPaused
                && (
                <div className={ classes.cellularWarning }>
                  <div>
                    <WarningIcon />
                    Connect to WiFi
                  </div>
                  <span style={{ fontSize: '0.8rem' }}>uploading paused on cellular connection</span>
                </div>
                )}
                  <table className={ classes.uploadTable }>
                    <thead>
                      <tr>
                        <th className={ classes.uploadCell } style={ cellStyle }>segment</th>
                        <th className={ classes.uploadCell } style={ cellStyle }>type</th>
                        <th className={ classes.uploadCell } style={ cellStyle }>progress</th>
                        { windowWidth >= 600 && <th className={ classes.uploadCell } style={ cellStyle } /> }
                      </tr>
                    </thead>
                    <tbody>
                      { uploadSorted.map(([id, upload]) => {
                        const isCancelled = cancelQueue.includes(id);
                        const [seg, type] = upload.fileName.split('/');
                        const prog = upload.progress * 100;
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
                            { upload.current
                              ? (
                                <td className={ classes.uploadCell } style={ cellStyle }>
                                  <div className={ classes.uploadProgress }>
                                    <LinearProgress variant="determinate" value={ prog } />
                                  </div>
                                </td>
                              )
                              : (
                                <>
                                  { windowWidth >= 600
                              && (
                              <td className={ classes.uploadCell } style={ cellStyle }>
                                { upload.paused ? 'paused' : 'pending' }
                              </td>
                              )}
                                  <td className={ `${classes.uploadCell} ${classes.cancelCell}` } style={ cellStyle }>
                                    { isCancelled
                                      ? <CircularProgress className={ classes.uploadCancelled } size={ 15 } />
                                      : <Button onClick={ () => this.cancelUploading([id]) }><HighlightOffIcon /></Button> }
                                  </td>
                                </>
                              )}
                          </tr>
                        );
                      }) }
                    </tbody>
                  </table>
                </>
              )
                : deviceOffline
                  ? <p>device offline</p>
                  : (hasData
                    ? <p>no uploads</p>
                    : <CircularProgress style={{ color: Colors.white, margin: 8 }} size={ 17 } />)}
            </div>
            <div className={classes.buttonGroup}>
              <Button
                variant="contained"
                className={ classes.cancelButton }
                disabled={ !hasUploading }
                onClick={ hasUploading ? () => this.cancelUploading() : null }
              >
                Cancel All
              </Button>
              <Button variant="contained" className={ classes.cancelButton } onClick={ this.props.onClose }>
                Close
              </Button>
            </div>
          </Paper>
        </Modal>
      </>
    );
  }
}

const stateToProps = Obstruction({
  filesUploading: 'filesUploading',
  filesUploadingMeta: 'filesUploadingMeta',
});

export default connect(stateToProps)(withStyles(styles)(UploadQueue));

import { Button, CircularProgress, Divider, LinearProgress, Modal, Paper, Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import WarningIcon from '@mui/icons-material/Warning';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { cancelFetchUploadQueue, cancelUploads, FILE_NAMES, fetchUploadQueue } from '../../actions/files';
import Colors from '../../colors';
import { deviceIsOnline, deviceOnCellular, deviceVersionAtLeast } from '../../utils';
import ResizeHandler from '../ResizeHandler';

const styles = (theme) => ({
  modal: {
    position: 'absolute',
    padding: theme.spacing(2),
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
    marginTop: theme.spacing(2),
  },
  uploadContainer: {
    margin: `${theme.spacing(1)} 0`,
    color: Colors.white,
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
    padding: `${theme.spacing(1.5)} ${theme.spacing(2)}`,
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: theme.spacing(1),
    '& div': {
      display: 'flex',
      alignItems: 'center',
      marginBottom: 2,
      '& svg': { marginRight: 8 },
    },
  },
});

const UploadQueue = ({ classes, device, open, onClose, update }) => {
  const dispatch = useDispatch();
  const filesUploading = useSelector((state) => state.filesUploading);
  const filesUploadingMeta = useSelector((state) => state.filesUploadingMeta);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [cancelQueue, setCancelQueue] = useState([]);

  const uploadQueue = useCallback(
    (enable) => {
      if (enable) {
        dispatch(fetchUploadQueue(device.dongle_id));
      } else {
        cancelFetchUploadQueue();
      }
    },
    [dispatch, device.dongle_id],
  );

  const cancelUploading = async (ids) => {
    if (ids === undefined) {
      ids = Object.keys(filesUploading);
    }

    ids = ids.filter((id) => filesUploading[id] && !filesUploading[id].current);
    setCancelQueue((prevCancelQueue) => prevCancelQueue.concat(ids));

    if (deviceVersionAtLeast(device, '0.8.13')) {
      dispatch(cancelUploads(device.dongle_id, ids));
    } else {
      // biome-ignore lint/suspicious/useIterableCallbackReturn: dispatch intentionally returns an action, forEach usage is correct here
      ids.forEach((id) => dispatch(cancelUploads(device.dongle_id, id)));
    }

    uploadQueue(true);
  };

  // Initial mount and update polling
  useEffect(() => {
    if (update) {
      uploadQueue(update);
    }
  }, [update, uploadQueue]);

  // Handle device changes
  useEffect(() => {
    if (update && device.dongle_id) {
      uploadQueue(true);
    }
  }, [device.dongle_id, update, uploadQueue]);

  // Handle filesUploading changes
  useEffect(() => {
    if (update) {
      const hasUploads = Boolean(Object.keys(filesUploading).length);
      uploadQueue(hasUploads);
    }
  }, [filesUploading, update, uploadQueue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      uploadQueue(false);
    };
  }, [uploadQueue]);

  const deviceOffline = !deviceIsOnline(device);
  const hasData = filesUploadingMeta.dongleId === device.dongle_id;
  const hasUploading = !deviceOffline && hasData && Object.keys(filesUploading).length > 0;
  const logNameLength = windowWidth < 600 ? 4 : 64;
  const segmentNameStyle = windowWidth < 450 ? { fontSize: windowWidth < 400 ? '0.8rem' : '0.9rem' } : {};
  const cellStyle = { padding: windowWidth < 400 ? '0 2px' : windowWidth < 450 ? '0 4px' : '0 8px' };

  const uploadSorted = Object.entries(filesUploading);
  if (uploadSorted.length && uploadSorted[uploadSorted.length - 1][1].current) {
    const curr = uploadSorted.splice([uploadSorted.length - 1], 1);
    uploadSorted.unshift(curr[0]);
  }

  const allPaused = uploadSorted.every((upload) => upload.paused);

  return (
    <>
      <ResizeHandler
        onResize={(ww, wh) => {
          setWindowWidth(ww);
          setWindowHeight(wh);
        }}
      />
      <Modal aria-labelledby="upload-queue-modal" open={open} onClose={onClose}>
        <Paper className={classes.modal}>
          <div className={classes.titleContainer}>
            <Typography variant="h6">Upload queue</Typography>
            <Typography variant="caption" style={{ marginLeft: 8 }}>
              {device.dongle_id}
            </Typography>
          </div>
          <Divider />
          <div className={classes.uploadContainer} style={{ maxHeight: windowHeight * 0.9 - 98 }}>
            {hasUploading ? (
              <>
                {deviceOnCellular(device) && allPaused && (
                  <div className={classes.cellularWarning}>
                    <div>
                      <WarningIcon />
                      Connect to WiFi
                    </div>
                    <span style={{ fontSize: '0.8rem' }}>uploading paused on cellular connection</span>
                  </div>
                )}
                <table className={classes.uploadTable}>
                  <thead>
                    <tr>
                      <th className={classes.uploadCell} style={cellStyle}>
                        segment
                      </th>
                      <th className={classes.uploadCell} style={cellStyle}>
                        type
                      </th>
                      <th className={classes.uploadCell} style={cellStyle}>
                        progress
                      </th>
                      {windowWidth >= 600 && <th className={classes.uploadCell} style={cellStyle} />}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadSorted.map(([id, upload]) => {
                      const isCancelled = cancelQueue.includes(id);
                      const [seg, type] = upload.fileName.split('/');
                      const prog = upload.progress * 100;
                      const segString = seg.split('|')[1];
                      return (
                        <tr key={id}>
                          <td className={classes.uploadCell} style={cellStyle}>
                            <div className={classes.segmentName} style={segmentNameStyle}>
                              <span>{segString.substring(0, 12)}</span>
                              <span>{segString.substring(12)}</span>
                            </div>
                          </td>
                          <td className={classes.uploadCell} style={cellStyle}>
                            {FILE_NAMES[type][0].split('.')[0].substring(0, logNameLength)}
                          </td>
                          {upload.current ? (
                            <td className={classes.uploadCell} style={cellStyle}>
                              <div className={classes.uploadProgress}>
                                <LinearProgress variant="determinate" value={prog} />
                              </div>
                            </td>
                          ) : (
                            <>
                              {windowWidth >= 600 && (
                                <td className={classes.uploadCell} style={cellStyle}>
                                  {upload.paused ? 'paused' : 'pending'}
                                </td>
                              )}
                              <td className={`${classes.uploadCell} ${classes.cancelCell}`} style={cellStyle}>
                                {isCancelled ? (
                                  <CircularProgress className={classes.uploadCancelled} size={15} />
                                ) : (
                                  <Button onClick={() => cancelUploading([id])}>
                                    <HighlightOffIcon />
                                  </Button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : deviceOffline ? (
              <p>device offline</p>
            ) : hasData ? (
              <p>no uploads</p>
            ) : (
              <CircularProgress style={{ color: Colors.white, margin: 8 }} size={17} />
            )}
          </div>
          <div className={classes.buttonGroup}>
            <Button variant="contained" className={classes.cancelButton} disabled={!hasUploading} onClick={hasUploading ? () => cancelUploading() : null}>
              Cancel All
            </Button>
            <Button variant="contained" className={classes.cancelButton} onClick={onClose}>
              Close
            </Button>
          </div>
        </Paper>
      </Modal>
    </>
  );
};

export default withStyles(styles)(UploadQueue);

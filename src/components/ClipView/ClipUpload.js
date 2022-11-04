import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { CircularProgress, Button, withStyles } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import FileUploadIcon from '@material-ui/icons/FileUpload';

import { deviceIsOnline, deviceOnCellular } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import Colors from '../../colors';
import { checkRoutesData, fetchDeviceNetworkStatus } from '../../actions';
import UploadQueue from '../Files/UploadQueue';
import { fetchFiles, fetchAthenaQueue, fetchUploadQueue } from '../../actions/files';
import { fetchClipsDetails } from '../../actions/clips';

const FILE_TYPE_FRIENDLY = {
  qcameras: 'Road camera (low-res)',
  cameras: 'Road camera',
  ecameras: 'Road camera wide angle',
  dcameras: 'Interior camera',
  qlogs: 'Logs',
  logs: 'Raw logs',
};

const styles = () => ({
  clipOption: {
    marginBottom: 12,
    width: '100%',
    '& h4': {
      color: Colors.white,
      margin: '0 0 5px 0',
      fontSize: '1rem',
    },
  },
  clipWarning: {
    display: 'flex',
    borderRadius: 12,
    marginBottom: 12,
    padding: '8px 12px',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    color: Colors.white,
    '& div': {
      marginLeft: 12,
      display: 'flex',
      flexDirection: 'column',
    },
    '& h6': {
      margin: 0,
      fontSize: '0.9rem',
    },
    '& p': {
      margin: 0,
      fontSize: '0.8rem',
    },
  },
  uploadItem: {
    maxWidth: 500,
    display: 'flex',
    justifyContent: 'space-between',
    '& h5': {
      color: Colors.white,
      margin: '0 0 5px 0',
      fontSize: '0.8rem',
    },
  },
  uploadState: {
    minWidth: 120,
    '& p': {
      color: Colors.white,
      fontSize: '0.8rem',
      textAlign: 'right',
      margin: 0,
    },
  },
  uploadTable: {
    color: Colors.white,
    width: '100%',
    maxWidth: 640,
    '& tr': {
      textAlign: 'left',
    },
  },
  clipProgress: {
    display: 'flex',
    alignItems: 'center',
    color: Colors.white,
    '& span': {
      marginLeft: 12,
      fontSize: '0.8rem',
    },
  },
  uploadQueueButton: {
    display: 'flex',
    alignItems: 'center',
    minHeight: 14,
    fontSize: '0.8rem',
    padding: '4px 8px',
    borderRadius: 4,
    backgroundColor: Colors.white08,
    marginTop: 12,
    '& svg': {
      height: 18,
    },
    '& button': {
      marginLeft: 8,
      marginRight: -6,
      color: Colors.white,
      fontSize: '0.8rem',
      padding: '4px 0',
      minHeight: 19,
      backgroundColor: Colors.white05,
      '&:hover': {
        backgroundColor: Colors.white10,
      },
    },
  },
});

class ClipUpload extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      uploadModal: false,
      requiredSegments: null,
      requiredFileTypes: null,
      pausedUploadingError: null,
      someFileNotFound: null,
      someDCameraFileNotFound: null,
      hasRequestedAll: null,
      hasUploadedAll: null,
    };

    this.onResize = this.onResize.bind(this);
    this.onVisible = this.onVisible.bind(this);
    this.getUploadStats = this.getUploadStats.bind(this);
    this.updateUploadStates = this.updateUploadStates.bind(this);
    this.renderError = this.renderError.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { dispatch, clips, routes, files, dongleId, device } = this.props;
    const { requiredFileTypes, requiredSegments } = this.state;

    if (clips.route && (prevProps.clips?.route !== clips.route
      || (!(prevProps.dongleId && prevProps.device) && dongleId && device))) {
      dispatch(checkRoutesData());
      dispatch(fetchAthenaQueue(dongleId));
      dispatch(fetchFiles(clips.route));
    }

    if (clips.route && prevProps.device && device && !deviceIsOnline(prevProps.device) && deviceIsOnline(device)) {
      dispatch(fetchUploadQueue(dongleId));
      dispatch(fetchAthenaQueue(dongleId));
      dispatch(fetchFiles(clips.route));
    }

    if (routes && (prevProps.routes !== routes
      || prevProps.clips?.start_time !== clips.start_time || prevProps.clips?.end_time !== clips.end_time)) {
      const route = routes.find((r) => r.fullname === clips.route);
      if (route) {
        const requiredSegments = [];
        for (let i = 0; i < route.segment_start_times.length; i++) {
          if (route.segment_start_times[i] < clips.end_time && route.segment_end_times[i] > clips.start_time) {
            requiredSegments.push(`${route.fullname}--${route.segment_numbers[i]}`);
          }
        }
        this.setState({ requiredSegments });
      }
    }

    if (prevProps.clips?.video_type !== clips.video_type) {
      switch (clips.video_type) {
        case 'q':
          this.setState({ requiredFileTypes: ['qcameras'] });
          break;
        case 'f':
          this.setState({ requiredFileTypes: ['cameras'] });
          break;
        case 'e':
          this.setState({ requiredFileTypes: ['ecameras'] });
          break;
        case 'd':
          this.setState({ requiredFileTypes: ['dcameras'] });
          break;
        case '360':
          this.setState({ requiredFileTypes: ['ecameras', 'dcameras'] });
          break;
      }
    }

    if (!prevState.hasUploadedAll && this.state.hasUploadedAll) {
      this.onVisible();
    }

    if (prevProps.files !== files || prevProps.clips !== clips
      || prevState.requiredFileTypes !== requiredFileTypes || prevState.requiredSegments !== requiredSegments) {
      this.updateUploadStates();
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  async onVisible() {
    const { dispatch, clips, device, dongleId } = this.props;

    if (!deviceIsOnline(device)) {
      dispatch(fetchDeviceNetworkStatus(dongleId));
    }

    if (!this.state.hasRequestedAll) {
      dispatch(fetchUploadQueue(dongleId));
      dispatch(fetchAthenaQueue(dongleId));
      dispatch(fetchFiles(clips.route));
    }

    if (!this.state.hasRequestedAll || this.state.hasUploadedAll) {
      dispatch(fetchClipsDetails(clips.clip_id));
    }
  }

  getUploadStats(types) {
    const { files } = this.props;
    const { requiredFileTypes, requiredSegments } = this.state;

    if (!files || !requiredSegments || !(types || requiredFileTypes)) {
      return null;
    }

    if (types === undefined) {
      types = requiredFileTypes;
    }

    const res = {
      count: 0,
      requested: 0,
      uploading: 0,
      paused: 0,
      notFound: 0,
      uploaded: 0,
    };
    for (const seg of requiredSegments) {
      for (const type of types) {
        res.count += 1;
        const log = files[`${seg}/${type}`];
        if (log) {
          res.requested += Boolean(log.requested || log.progress !== undefined || log.url || log.notFound);
          res.uploading += Boolean(log.progress !== undefined);
          res.paused += Boolean(log.paused);
          res.uploaded += Boolean(log.url);
          res.notFound += Boolean(log.notFound);
        }
      }
    }

    return res;
  }

  updateUploadStates() {
    const { requiredSegments, requiredFileTypes } = this.state;

    let pausedUploadingError = false;
    let someFileNotFound = false;
    let someDCameraFileNotFound = false;
    let hasRequestedAll = Boolean(requiredSegments && requiredSegments.length
      && requiredFileTypes && requiredFileTypes.length);
    let hasUploadedAll = Boolean(requiredSegments && requiredSegments.length
      && requiredFileTypes && requiredFileTypes.length);

    if (requiredSegments && requiredFileTypes) {
      for (const type of requiredFileTypes) {
        const state = this.getUploadStats([type]);
        if (state === null) {
          hasRequestedAll = false;
          hasUploadedAll = false;
          continue;
        }

        if (state.paused > 0 && state.uploading === state.paused && deviceOnCellular(this.props.device)) {
          pausedUploadingError = true;
        }

        if (state.notFound > 0) {
          someFileNotFound = true;
          if (type === 'dcameras') {
            someDCameraFileNotFound = true;
          }
        }

        if (state.requested < state.count) {
          hasRequestedAll = false;
        }
        if (state.uploaded < state.count) {
          hasUploadedAll = false;
        }
      }
    }

    this.setState({
      pausedUploadingError,
      someFileNotFound,
      someDCameraFileNotFound,
      hasRequestedAll,
      hasUploadedAll,
    });
  }

  renderError(title, label) {
    const { classes } = this.props;
    return (
      <div className={classes.clipWarning}>
        <ErrorIcon />
        <div>
          <h6>{ title }</h6>
          <span style={{ fontSize: '0.8rem' }}>{ label }</span>
        </div>
      </div>
    );
  }

  render() {
    const { classes, device, clips, files } = this.props;
    const { windowWidth, requiredSegments, requiredFileTypes, pausedUploadingError,
      someFileNotFound, someDCameraFileNotFound, hasUploadedAll } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    if (!device) {
      return null;
    }

    const deviceIsOffline = !deviceIsOnline(device);
    const uploadingStates = [];
    if (files && requiredSegments && requiredFileTypes) {
      for (const segment of requiredSegments) {
        for (const type of requiredFileTypes) {
          let progress;
          const file = files[`${segment}/${type}`] || {};
          if (file.url) {
            progress = 'uploaded';
          } else if (file.progress !== undefined) {
            progress = file.current
              ? `${Math.floor(file.progress * 100)}%`
              : (file.paused ? 'paused' : 'pending');
          } else if (file.notFound) {
            progress = 'file not found';
          } else {
            progress = 'requesting';
          }

          uploadingStates.push({
            segment,
            type,
            progress,
          });
        }
      }
    }

    let statusTitle = 'Preparing export';
    let statusProgress = null;
    if (clips.pending_status === 'waiting_jobs') {
      statusTitle = 'Export in queue';
    } else if (clips.pending_status === 'processing') {
      statusTitle = 'Export in progress';
      statusProgress = clips.pending_progress
        ? Math.floor(parseFloat(clips.pending_progress) * 100)
        : null;
    }

    const segmentNameStyle = windowWidth < 450 ? { fontSize: windowWidth < 400 ? '0.8rem' : '0.9rem' } : {};
    const cellStyle = { padding: windowWidth < 400 ? '0 2px' : (windowWidth < 450 ? '0 4px' : '0 8px') };

    return (
      <>
        <ResizeHandler onResize={ this.onResize } />
        <VisibilityHandler onVisible={ this.onVisible } onInterval={ 10 } />

        { !hasUploadedAll
        && (
        <div style={{ padding: viewerPadding }}>
          <div className={ classes.clipOption }>
            <h4>Uploading files</h4>
            { Boolean(deviceIsOffline && clips.video_type !== 'q')
              && this.renderError('Device offline', 'uploading will resume when device is online') }
            { pausedUploadingError && this.renderError('Connect to WiFi', 'uploading paused on cellular connection') }
            { someFileNotFound && this.renderError('Not Found', `not all files are available on the device${
              someDCameraFileNotFound ? ', make sure the "Record and Upload Driver Camera" toggle is enabled' : ''}`) }
            { uploadingStates.length === 0
              && <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 24 } /> }
          </div>
          { Boolean(uploadingStates.length && clips.video_type !== 'q') && (
          <>
            <table className={ classes.uploadTable } style={ segmentNameStyle }>
              <thead>
                <tr>
                  <th className={ classes.uploadCell } style={ cellStyle }>Segment</th>
                  <th className={ classes.uploadCell } style={ cellStyle }>File type</th>
                  <th className={ classes.uploadCell } style={ cellStyle }>Progress</th>
                </tr>
              </thead>
              <tbody>
                { uploadingStates.map(({ segment, type, progress }, i) => {
                  const segNum = segment.split('--')[2];
                  return (
                    <tr key={ i }>
                      <td className={ classes.uploadCell } style={ cellStyle }>{ segNum }</td>
                      <td className={ classes.uploadCell } style={ cellStyle }>{ FILE_TYPE_FRIENDLY[type] }</td>
                      <td className={ classes.uploadCell } style={ cellStyle }>{ progress }</td>
                    </tr>
                  );
                }) }
              </tbody>
            </table>
            <div className={ classes.clipOption }>
              <Button onClick={ () => this.setState({ uploadModal: true }) } className={ classes.uploadQueueButton }>
                view upload queue
                <FileUploadIcon />
              </Button>
            </div>
          </>
          ) }
        </div>
        )}
        { hasUploadedAll && (
          <div style={{ padding: viewerPadding }}>
            <div className={ classes.clipOption }>
              <h4>{ statusTitle }</h4>
              <div className={ classes.clipProgress }>
                <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 24 } />
                { statusProgress !== null && (
                <span>
                  { statusProgress }
                  %
                </span>
                ) }
              </div>
            </div>
          </div>
        )}
        <UploadQueue
          open={ this.state.uploadModal }
          onClose={ () => this.setState({ uploadModal: false }) }
          update={ !hasUploadedAll }
          store={ this.props.store }
          device={ device }
        />
        <div style={{ padding: `0 ${viewerPadding}px ${viewerPadding}px ${viewerPadding}px` }}>
          <typography>
            This may take some time. You can leave this page and your clip will continue processing.
          </typography>
        </div>
      </>
    );
  }
}

const stateToProps = Obstruction({
  routes: 'routes',
  dongleId: 'dongleId',
  device: 'device',
  clips: 'clips',
  files: 'files',
});

export default connect(stateToProps)(withStyles(styles)(ClipUpload));

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
import { checkSegmentMetadata } from '../../actions';
import UploadQueue from '../Files/UploadQueue';
import { fetchFiles, fetchAthenaQueue, fetchUploadQueue } from '../../actions/files';
import { fetchClipsDetails } from '../../actions/clips';

const FILE_TYPE_FRIENDLY = {
  'qcameras': 'Road camera (low-res)',
  'cameras': 'Road camera (HD)',
  'ecameras': 'Road camera wide angle (HD)',
  'dcameras': 'Interior camera (driver, HD)',
  'qlogs': 'Logs',
  'logs': 'Raw logs',
};

const styles = (theme) => ({
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
      required_segments: null,
      required_file_types: null,
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
    const { clips, segmentData, files, dongleId, device } = this.props;
    const { required_file_types, required_segments } = this.state;

    if (clips.route && (prevProps.clips?.route !== clips.route ||
      (!(prevProps.dongleId && prevProps.device) && dongleId && device)))
    {
      this.props.dispatch(checkSegmentMetadata());
      this.props.dispatch(fetchAthenaQueue(dongleId));
      this.props.dispatch(fetchFiles(clips.route));
    }

    if (segmentData?.segments && (prevProps.segmentData?.segments !== segmentData?.segments ||
      prevProps.clips?.start_time !== clips.start_time || prevProps.clips?.end_time !== clips.end_time))
    {
      let required_segments = [];
      for (const segment of segmentData.segments) {
        if (segment.start_time_utc_millis < clips.end_time && segment.end_time_utc_millis > clips.start_time) {
          required_segments.push(segment.canonical_name);
        }
      }
      this.setState({ required_segments });
    }

    if (prevProps.clips?.video_type !== clips.video_type) {
      switch (clips.video_type) {
      case 'q':
        this.setState({ required_file_types: ['qcameras'] });
        break;
      case 'f':
        this.setState({ required_file_types: ['cameras'] });
        break;
      case 'e':
        this.setState({ required_file_types: ['ecameras'] });
        break;
      case 'd':
        this.setState({ required_file_types: ['dcameras'] });
        break;
      }
    }

    if (!prevState.hasUploadedAll && this.state.hasUploadedAll) {
      this.onVisible();
    }

    if (prevProps.files !== files || prevProps.clips !== clips ||
      prevState.required_file_types !== required_file_types || prevState.required_segments !== required_segments)
    {
      this.updateUploadStates();
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  async onVisible() {
    const { clips } = this.props;

    if (!this.state.hasRequestedAll) {
      this.props.dispatch(fetchUploadQueue(this.props.dongleId));
      this.props.dispatch(fetchAthenaQueue(this.props.dongleId));
      this.props.dispatch(fetchFiles(clips.route));
    }

    if (!this.state.hasRequestedAll || this.state.hasUploadedAll) {
      this.props.dispatch(fetchClipsDetails(clips.clip_id));
    }
  }

  getUploadStats(types) {
    const { files } = this.props;
    const { required_file_types, required_segments } = this.state;

    if (!files || !required_segments || !(types || required_file_types)) {
      return null;
    }

    if (types === undefined) {
      types = required_file_types;
    }

    const res = {
      count: 0,
      requested: 0,
      uploading: 0,
      paused: 0,
      notFound: 0,
      uploaded: 0,
    };
    for (const seg of required_segments) {
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
    const { required_segments, required_file_types } = this.state;

    let pausedUploadingError = false;
    let someFileNotFound = false;
    let someDCameraFileNotFound = false;
    let hasRequestedAll = Boolean(required_segments && required_segments.length &&
      required_file_types && required_file_types.length);
    let hasUploadedAll = Boolean(required_segments && required_segments.length &&
      required_file_types && required_file_types.length);

    if (required_segments && required_file_types) {
      for (const type of required_file_types) {
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

  render() {
    const { classes, device, clips } = this.props;
    const { windowWidth, required_segments, required_file_types, pausedUploadingError, someFileNotFound,
      someDCameraFileNotFound, hasUploadedAll } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    if (!device) {
      return null;
    }

    let deviceIsOffline = !deviceIsOnline(device);
    let uploadingStates = [];
    if (required_segments && required_file_types) {
      for (const type of required_file_types) {
        const state = this.getUploadStats([type]);
        if (state) {
          uploadingStates.push(
            <div key={uploadingStates.length} className={classes.uploadItem}>
              <div>
                <h5>{ FILE_TYPE_FRIENDLY[type] }:</h5>
              </div>
              <div className={classes.uploadState}>
                <p>uploaded: {state.uploaded} / {state.count}</p>
              </div>
            </div>
          );
        }
      }
    }

    let statusTitle = 'Preparing export';
    let statusProgress = null;
    if (clips.pending_status === 'waiting_jobs') {
      statusTitle = 'Export in queue';
    } else if (clips.pending_status === 'processing') {
      statusTitle = 'Export in progress';
      statusProgress = clips.pending_progress ? parseInt(parseFloat(clips.pending_progress) * 100) : null;
    }

    return <>
      <ResizeHandler onResize={ this.onResize } />
      <VisibilityHandler onVisible={ this.onVisible } onInterval={ 10 } />

      { !hasUploadedAll &&
        <div style={{ padding: viewerPadding }}>
          <div className={ classes.clipOption }>
            <h4>Uploading files</h4>
            { deviceIsOffline && this.renderError('Device offline', 'uploading will resume when device is online') }
            { pausedUploadingError && this.renderError('Connect to WiFi', 'uploading paused on cellular connection') }
            { someFileNotFound && this.renderError('Not Found', 'not all files are available on the device' +
              (someDCameraFileNotFound ? ', make sure the "Record and Upload Driver Camera" toggle is enabled' : '')) }
            { uploadingStates.length === 0 &&
              <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 24 } /> }
            { uploadingStates }
          </div>
          <div className={ classes.clipOption }>
            <Button onClick={ () => this.setState({ uploadModal: true }) } className={ classes.uploadQueueButton }>
              view upload queue
              <FileUploadIcon />
            </Button>
          </div>
       </div>
      }
      { hasUploadedAll &&
        <div style={{ padding: viewerPadding }}>
          <div className={ classes.clipOption }>
            <h4>{ statusTitle }</h4>
              <div className={ classes.clipProgress }>
                <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 24 } />
                { statusProgress !== null && <span>{ statusProgress}%</span> }
              </div>
          </div>
        </div>
      }

      <UploadQueue open={ this.state.uploadModal } onClose={ () => this.setState({ uploadModal: false }) }
        update={ !hasUploadedAll } store={ this.props.store } device={ device } />
    </>;
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
}

const stateToProps = Obstruction({
  segmentData: 'segmentData',
  dongleId: 'dongleId',
  device: 'device',
  clips: 'clips',
  files: 'files',
});

export default connect(stateToProps)(withStyles(styles)(ClipUpload));

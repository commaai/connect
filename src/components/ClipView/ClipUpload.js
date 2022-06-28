import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { CircularProgress, withStyles } from '@material-ui/core';
import ErrorIcon from '@material-ui/icons/ErrorOutline';

import { deviceIsOnline, deviceOnCellular } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import Colors from '../../colors';
import { checkSegmentMetadata } from '../../actions';
import { fetchFiles, fetchAthenaQueue, updateFiles, doUpload, fetchUploadUrls, fetchUploadQueue } from '../../actions/files';
import { fetchClipsDetails } from '../../actions/clips';

const FILE_NAMES = {
  'qcameras': 'qcamera.ts',
  'cameras': 'fcamera.hevc',
  'dcameras': 'dcamera.hevc',
  'ecameras': 'ecamera.hevc',
  'qlogs': 'qlog.bz2',
  'logs': 'rlog.bz2',
};
const FILE_TYPE_FRIENDLY = {
  'qcameras': 'Road camera (low-res)',
  'cameras': 'Road camera (HD)',
  'ecameras': 'Road camera wide angle (HD)',
  'dcameras': 'Cabin camera (driver, HD)',
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
});

class ClipUpload extends Component {
  constructor(props) {
    super(props);

    this.state = {
      windowWidth: window.innerWidth,
      required_segments: null,
      required_file_types: null,
      hasUploadedAll: false,
    };

    this.onResize = this.onResize.bind(this);
    this.onVisible = this.onVisible.bind(this);
    this.getUploadStats = this.getUploadStats.bind(this);
    this.uploadFiles = this.uploadFiles.bind(this);
    this.renderError = this.renderError.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { clips, segmentData, files } = this.props;
    const { required_file_types, required_segments } = this.state;

    if (prevProps.clips?.route !== clips.route && clips.route) {
      this.props.dispatch(checkSegmentMetadata());
      this.props.dispatch(fetchAthenaQueue(this.props.dongleId));
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

    if (!(prevProps.files && prevState.required_segments && prevState.required_file_types) &&
      files && required_segments && required_file_types)
    {
      this.uploadFiles();
    }

    if (!prevState.hasUploadedAll && this.state.hasUploadedAll) {
      this.onVisible();
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  async onVisible() {
    if (!this.state.hasUploadedAll) {
      return;
    }

    const { clips } = this.props;
    this.props.dispatch(fetchClipsDetails(clips.clip_id));
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

  async uploadFiles() {
    const { dongleId, files } = this.props;
    const { required_file_types, required_segments } = this.state;

    if (!files || !required_segments || !required_file_types) {
      return;
    }

    const uploading = {}
    for (const seg of required_segments) {
      for (const type of required_file_types) {
        const fileName = `${seg}/${type}`;
        if (!files[fileName]) {
          uploading[fileName] = { requested: true };
        }
      }
    }
    this.props.dispatch(updateFiles(uploading));

    const paths = Object.keys(uploading).map((fileName) => {
      const [seg, type] = fileName.split('/');
      return `${seg.split('|')[1]}/${FILE_NAMES[type]}`;
    });

    const urls = await fetchUploadUrls(dongleId, paths);
    if (urls) {
      this.props.dispatch(doUpload(dongleId, Object.keys(uploading), paths, urls));
    }
    this.props.dispatch(fetchUploadQueue(dongleId));
  }

  render() {
    const { classes, device, clips } = this.props;
    const { windowWidth, required_segments, required_file_types } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    let uploadingStates = [];

    let deviceIsOffline = !deviceIsOnline(device);
    let pausedUploadingError = false;
    let someFileNotFound = false;
    let someDCameraFileNotFound = false;
    let hasUploadedAll = Boolean(required_segments && required_segments.length && required_file_types && required_file_types.length);

    if (required_segments && required_file_types) {
      for (const type of required_file_types) {
        const state = this.getUploadStats([type]);
        if (state === null) {
          continue;
        }

        if (state.paused > 0 && state.uploading === state.paused && deviceOnCellular(device)) {
          pausedUploadingError = true;
        }

        if (state.notFound > 0) {
          someFileNotFound = true;
          if (type === 'dcameras') {
            someDCameraFileNotFound = true;
          }
        }

        if (state.uploaded < state.count) {
          hasUploadedAll = false;
        }

        uploadingStates.push(
          <div key={uploadingStates.length} className={classes.uploadItem}>
            <div>
              <h5>{ FILE_TYPE_FRIENDLY[type] }:</h5>
            </div>
            <div className={classes.uploadState}>
              <p>requested: {state.requested} / {state.count}</p>
              <p>uploaded: {state.uploaded} / {state.count}</p>
            </div>
          </div>
        );
      }
    }

    if (hasUploadedAll && !this.state.hasUploadedAll) {
      this.setState({ hasUploadedAll });
    }

    let statusTitle = 'Initializing job';
    if (clips.pending_status === 'processing') {
      statusTitle = 'Processing files';
    }

    return <>
      <ResizeHandler onResize={ this.onResize } />
      <VisibilityHandler onVisible={ this.onVisible } onInterval={ 10 } />

      { !this.state.hasUploadedAll &&
        <div style={{ padding: viewerPadding }}>
          <div className={ classes.clipOption }>
            <h4>Uploading files</h4>
            { deviceIsOffline && this.renderError('Device offline', 'uploading will resume when device is online') }
            { pausedUploadingError && this.renderError('Connect to WiFi', 'uploading paused on cellular connection') }
            { someFileNotFound && this.renderError('Not Found', 'not all files are available on the device' +
              (someDCameraFileNotFound ? ', make sure the "Record and Upload Driver Camera" toggle is enabled' : '')) }
            { uploadingStates.length === 0 &&
              <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 20 } /> }
            { uploadingStates }
          </div>
       </div>
      }
      { this.state.hasUploadedAll &&
        <div style={{ padding: viewerPadding }}>
          <div className={ classes.clipOption }>
            <h4>{ statusTitle }</h4>
            <CircularProgress style={{ margin: 12, color: Colors.white }} size={ 20 } />
          </div>
        </div>
      }
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

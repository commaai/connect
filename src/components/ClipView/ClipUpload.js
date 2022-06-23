import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { CircularProgress, withStyles } from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';
import ErrorIcon from '@material-ui/icons/ErrorOutline';

import { deviceOnCellular } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { fetchFiles, fetchAthenaQueue, updateFiles, doUpload, fetchUploadUrls } from '../../actions/files';

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
    color: Colors.white,
    fontSize: '1rem',
    display: 'flex',
    flexDirection: 'column',
    '& div': {
      display: 'flex',
      alignItems: 'center',
    },
    '& span': {
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
    };

    this.onResize = this.onResize.bind(this);
    this.getUploadStats = this.getUploadStats.bind(this);
    this.uploadFiles = this.uploadFiles.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { clip, segmentData, files } = this.props;
    const { required_file_types, required_segments } = this.state;

    if (prevProps.clip?.route !== clip.route) {
      this.props.dispatch(fetchAthenaQueue(this.props.dongleId));
      this.props.dispatch(fetchFiles(clip.route));
    }

    if ((!prevProps.segmentData?.segments && segmentData?.segments) || (segmentData?.segments &&
      (prevProps.clip?.start_time !== clip.start_time || prevProps.clip?.end_time !== clip.end_time)))
    {
      let required_segments = [];
      for (const segment of segmentData.segments) {
        if (segment.start_time_utc_millis < clip.end_time && segment.end_time_utc_millis > clip.start_time) {
          required_segments.push(segment.canonical_name);
        }
      }
      this.setState({ required_segments });
    }

    if (prevProps.clip?.video_type !== clip.video_type) {
      switch (clip.video_type) {
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
      // this.uploadFiles();
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
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
  }

  render() {
    const { classes } = this.props;
    const { windowWidth, required_segments, required_file_types } = this.state;
    const viewerPadding = windowWidth < 768 ? 12 : 32;

    let uploadItems = {};
    if (required_segments && required_file_types) {
      for (const type of required_file_types) {
        uploadItems[type] = this.getUploadStats([type]);
      }
    }

    return <>
      <ResizeHandler onResize={ this.onResize } />
      <div style={{ padding: viewerPadding }}>
        <div className={ classes.clipOption }>
          <h4>Uploading files</h4>
          { Object.keys(uploadItems).length === 0 && <CircularProgress style={{ color: Colors.white }} size={ 20 } /> }
          { Object.entries(uploadItems).map(([type, state], i) => {
            return <div key={i} className={classes.uploadItem}>
              <div>
                <h5>{ FILE_TYPE_FRIENDLY[type] }:</h5>
                { Boolean(state.paused > 0 && state.uploading === state.paused && deviceOnCellular(device)) &&
                  <div className={classes.clipWarning}>
                    <WarningIcon /> Connect to WiFi
                    <span style={{ fontSize: '0.8rem' }}>uploading paused on cellular connection</span>
                  </div>
                }
                { Boolean(state.notFound > 0 || true/*TODO remove*/) &&
                  <div className={classes.clipWarning}>
                    <div><ErrorIcon /> Not Found<br /></div>
                    <span style={{ fontSize: '0.8rem' }}>
                      not all files are available on the device
                      { type === 'dcameras' && ', make sure the "Record and Upload Driver Camera" toggle is enabled' }
                    </span>
                  </div>
                }
              </div>
              <div>
                <p>requested: {state.requested} / {state.count}</p>
                <p>uploaded: {state.uploaded} / {state.count}</p>
              </div>
            </div>;
          }) }
        </div>

        <div className={ classes.clipOption }>
          <h4>Processing</h4>
        </div>
      </div>
    </>;
  }
}

const stateToProps = Obstruction({
  segmentData: 'segmentData',
  dongleId: 'dongleId',
  device: 'device',
  clip: 'clip',
  files: 'files',
});

export default connect(stateToProps)(withStyles(styles)(ClipUpload));

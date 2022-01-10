import React, { Component } from 'react';
import qs from 'query-string';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Divider, Typography, Menu, MenuItem, CircularProgress, Button, Popper } from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';
import ContentCopyIcon from '@material-ui/icons/ContentCopy';
import InfoOutlineIcon from '@material-ui/icons/InfoOutline';
import { raw as RawApi, athena as AthenaApi } from '@commaai/comma-api';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import ResizeHandler from '../ResizeHandler';
import * as Demo from '../../demo';
import TimeDisplay from '../TimeDisplay';
import UploadQueue from '../Files/UploadQueue';
import { currentOffset } from '../../timeline/playback';
import Colors from '../../colors';
import { deviceIsOnline, deviceVersionAtLeast } from '../../utils';
import { updateDeviceOnline } from '../../actions';
import { fetchFiles, fetchUploadQueue, fetchAthenaQueue, updateFiles } from '../../actions/files';

const styles = (theme) => ({
  root: {
    display: 'flex',
  },
  mediaOptionsRoot: {
    maxWidth: 964,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  mediaOptions: {
    marginBottom: 12,
    display: 'flex',
    width: 'max-content',
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 50,
    display: 'flex',
  },
  mediaOption: {
    alignItems: 'center',
    borderRight: '1px solid rgba(255,255,255,.1)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    cursor: 'pointer',
    minHeight: 32,
    minWidth: 44,
    paddingLeft: 15,
    paddingRight: 15,
    '&.disabled': {
      cursor: 'default',
    },
    '&:last-child': {
      borderRight: 'none',
    },
  },
  mediaOptionDisabled: {
    cursor: 'auto',
  },
  mediaOptionIcon: {
    backgroundColor: '#fff',
    borderRadius: 3,
    height: 20,
    margin: '2px 0',
    width: 30,
  },
  mediaOptionText: {
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'center',
  },
  mediaSource: {
    width: '100%',
  },
  mediaSourceSelect: {
    width: '100%',
  },
  timeDisplay: {
    marginTop: 12,
  },
  menuLoading: {
    position: 'absolute',
    outline: 'none',
    zIndex: 5,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  filesItem: {
    justifyContent: 'space-between',
    opacity: 1,
  },
  offlineMenuItem: {
    height: 'unset',
    flexDirection: 'column',
    alignItems: 'flex-start',
    '& div': {
      display: 'flex',
    },
    '& svg': { marginRight: 8 },
  },
  uploadButton: {
    marginLeft: 12,
    color: Colors.white,
    borderRadius: 13,
    fontSize: '0.8rem',
    padding: '4px 12px',
    minHeight: 19,
    backgroundColor: Colors.white05,
    '&:hover': {
      backgroundColor: Colors.white10,
    },
  },
  fakeUploadButton: {
    marginLeft: 12,
    color: Colors.white,
    fontSize: '0.8rem',
    padding: '4px 12px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  copySegment: {
    pointerEvents: 'auto',
    opacity: 1,
    '& div': {
      whiteSpace: 'normal',
      padding: '0 6px',
      borderRadius: 4,
      backgroundColor: Colors.white08,
      marginRight: 4,
    },
  },
  viewCabanaUploads: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.8rem',
    padding: '0 6px 0 2px',
    borderRadius: 4,
    backgroundColor: Colors.white08,
    marginLeft: 8,
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
  viewCabanaFakeUploads: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 25,
    backgroundColor: Colors.white08,
    borderRadius: 4,
    marginLeft: 8,
  },
  dcameraUploadIcon: {
    fontSize: '1rem',
    marginLeft: 4,
  },
  dcameraUploadInfo: {
    zIndex: 2000,
    textAlign: 'center',
    borderRadius: 14,
    fontSize: '0.8em',
    padding: '6px 8px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    '& p': { fontSize: '0.8rem' },
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

const MediaType = {
  VIDEO: 'video',
  MAP: 'map'
};

class Media extends Component {
  constructor(props) {
    super(props);

    this.state = {
      inView: MediaType.VIDEO,
      windowWidth: window.innerWidth,
      downloadMenu: null,
      moreInfoMenu: null,
      uploadModal: false,
      dcamUploadInfo: null,
    };

    this.renderMediaOptions = this.renderMediaOptions.bind(this);
    this.renderMenus = this.renderMenus.bind(this);
    this.copySegmentName = this.copySegmentName.bind(this);
    this.openInCabana = this.openInCabana.bind(this);
    this.openInUseradmin = this.openInUseradmin.bind(this);
    this.routesInLoop = this.routesInLoop.bind(this);
    this.currentSegmentNum = this.currentSegmentNum.bind(this);
    this.uploadFile = this.uploadFile.bind(this);
    this.uploadFilesAll = this.uploadFilesAll.bind(this);
    this.fetchUploadUrls = this.fetchUploadUrls.bind(this);
    this.doUpload = this.doUpload.bind(this);
    this.athenaCall = this.athenaCall.bind(this);
    this.getUploadStats = this.getUploadStats.bind(this);
    this._uploadStats = this._uploadStats.bind(this);

    this.openRequests = 0;
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(_, prevState) {
    const { windowWidth, inView, downloadMenu, moreInfoMenu } = this.state;
    const showMapAlways = windowWidth >= 1536;
    if (showMapAlways && inView === MediaType.MAP) {
      this.setState({ inView: MediaType.VIDEO });
    }

    if ((!prevState.downloadMenu && downloadMenu) || (!this.props.files && !prevState.moreInfoMenu && moreInfoMenu)) {
      if (Demo.isDemo()) {
        this.props.dispatch(fetchFiles('3533c53bb29502d1|2019-12-10--01-13-27'));
      } else {
        this.props.dispatch(fetchAthenaQueue(this.props.dongleId));
        for (const routeName of this.routesInLoop()) {
          this.props.dispatch(fetchFiles(routeName));
        }
      }
    }
  }

  async copySegmentName() {
    const { currentSegment } = this.props;
    if (!currentSegment || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${currentSegment.route}--${this.currentSegmentNum()}`);
    this.setState({ moreInfoMenu: null });
  }

  currentSegmentNum() {
    const offset = currentOffset();
    return Math.floor((offset - this.props.currentSegment.routeOffset) / 60000);
  }

  openInCabana() {
    const { currentSegment, loop, filter } = this.props;
    if (!currentSegment) {
      return;
    }
    const offset = currentOffset();
    const params = {
      route: currentSegment.route,
      url: currentSegment.url,
      seekTime: Math.floor((offset - currentSegment.routeOffset) / 1000)
    };
    const routeStartTime = (filter.start + currentSegment.routeOffset);

    if (loop.startTime && loop.startTime > routeStartTime && loop.duration < 180000) {
      const startTime = Math.floor((loop.startTime - routeStartTime) / 1000);
      params.segments = [startTime, Math.floor(startTime + (loop.duration / 1000))].join(',');
    }

    const win = window.open(`${window.CABANA_URL_ROOT}?${qs.stringify(params)}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  openInUseradmin() {
    const { currentSegment } = this.props;
    if (!currentSegment) {
      return;
    }

    const params = { onebox: currentSegment.route };
    const win = window.open(`${window.USERADMIN_URL_ROOT}?${qs.stringify(params)}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  routesInLoop() {
    const { segments, loop } = this.props;
    return segments
      .filter((route) =>
        route.startTime < loop.startTime + loop.duration && route.startTime + route.duration > loop.startTime)
      .map((route) => route.route);
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
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return await this.athenaCall(payload, sentry_fingerprint, retryCount + 1);
      }
      if (dongleId === this.props.dongleId) {
        if (err.message && (err.message.indexOf('Timed out') === -1 ||
          err.message.indexOf('Device not registered') === -1))
        {
          this.props.dispatch(updateDeviceOnline(dongleId, 0));
        } else {
          console.log(err);
          Sentry.captureException(err, { fingerprint: sentry_fingerprint });
        }
        return { error: err.message };
      }
    }
  }

  async uploadFile(type) {
    const { dongleId, currentSegment } = this.props;
    if (!currentSegment) {
      return;
    }
    const routeNoDongleId = currentSegment.route.split('|')[1];
    const path = `${routeNoDongleId}--${this.currentSegmentNum()}/${FILE_NAMES[type]}`;
    const fileName = `${dongleId}|${routeNoDongleId}--${this.currentSegmentNum()}/${type}`;

    const uploading = {};
    uploading[fileName] = { requested: true };
    this.props.dispatch(updateFiles(uploading));

    const urls = await this.fetchUploadUrls(dongleId, [path]);
    if (urls) {
      this.doUpload(dongleId, [fileName], [path], urls);
    }
  }

  async uploadFilesAll(types) {
    const { dongleId, device, segmentData, loop, files } = this.props;
    if (types === undefined) {
      types = ['logs', 'cameras', 'dcameras'];
      if (device.device_type === 'three') {
        types.push('ecameras');
      };
    }

    if (!segmentData.segments || !files) {
      return;
    }

    const uploading = {}
    for (const segment of segmentData.segments) {
      if (segment.start_time_utc_millis < loop.startTime + loop.duration &&
        segment.start_time_utc_millis + segment.duration > loop.startTime)
      {
        for (const type of types) {
          const fileName = `${segment.canonical_name}/${type}`;
          if (!files[fileName]) {
            uploading[fileName] = { requested: true };
          }
        }
      }
    }
    this.props.dispatch(updateFiles(uploading));

    const paths = Object.keys(uploading).map((fileName) => {
      const [seg, type] = fileName.split('/');
      return `${seg.split('|')[1]}/${FILE_NAMES[type]}`;
    });

    const urls = await this.fetchUploadUrls(dongleId, paths);
    if (urls) {
      this.doUpload(dongleId, Object.keys(uploading), paths, urls);
    }
  }

  async fetchUploadUrls(dongleId, paths) {
    try {
      const resp = await RawApi.getUploadUrls(dongleId, paths, 7);
      if (resp && !resp.error) {
        return resp.map((r) => r.url);
      }
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'media_upload_geturls' });
    }
  }

  async doUpload(dongleId, fileNames, paths, urls) {
    if (deviceVersionAtLeast(this.props.device, "0.8.13")) {
      const files_data = paths.map((path, i) => {
        return [path, urls[i], { "x-ms-blob-type": "BlockBlob" }];
      });
      const payload = {
        id: 0,
        jsonrpc: "2.0",
        method: "uploadFilesToUrls",
        params: { files_data },
        expiry: parseInt(Date.now()/1000) + (86400*7),
      };
      const resp = await this.athenaCall(payload, 'media_athena_uploads');
      if (!resp || resp.error) {
        const newUploading = {};
        for (const fileName of fileNames) {
          newUploading[fileName] = {};
        }
        this.props.dispatch(updateDeviceOnline(dongleId, parseInt(Date.now() / 1000)));
        this.props.dispatch(updateFiles(newUploading));
      } else if (resp.result === 'Device offline, message queued') {
        const newUploading = {};
        for (const fileName of fileNames) {
          newUploading[fileName] = { progress: 0, current: false };
        }
        this.props.dispatch(updateFiles(newUploading));
      } else if (resp.result) {
        if (resp.result.failed) {
          const uploading = {};
          for (const path of resp.result.failed) {
            const idx = paths.indexOf(path);
            if (idx !== -1) {
              uploading[fileNames[idx]] = { notFound: true };
            }
          }
          this.props.dispatch(updateFiles(uploading));
        }
        this.props.dispatch(fetchUploadQueue(dongleId));
      }
    } else {
      for (let i=0; i<fileNames.length; i++) {
        const payload = {
          id: 0,
          jsonrpc: "2.0",
          method: "uploadFileToUrl",
          params: [paths[i], urls[i], { "x-ms-blob-type": "BlockBlob" }],
          expiry: parseInt(Date.now()/1000) + (86400*7),
        };
        const resp = await this.athenaCall(payload, 'media_athena_upload');
        if (!resp || resp.error) {
          const uploading = {};
          uploading[fileNames[i]] = {};
          this.props.dispatch(updateDeviceOnline(dongleId, parseInt(Date.now() / 1000)));
          this.props.dispatch(updateFiles(uploading));
        } else if (resp.result === 'Device offline, message queued') {
          const uploading = {};
          uploading[fileNames[i]] = { progress: 0, current: false };
          this.props.dispatch(updateFiles(uploading));
        } else if (resp.result === 404 || (resp.result && resp.result.failed && resp.result.failed[0] === paths[i])) {
          const uploading = {};
          uploading[fileNames[i]] = { notFound: true };
          this.props.dispatch(updateFiles(uploading));
        } else if (resp.result) {
          this.props.dispatch(fetchUploadQueue(dongleId));
        }
      }
    }
  }

  _uploadStats(types, count, uploaded, uploading, requested) {
    const { segmentData, loop, files } = this.props;
    for (const segment of segmentData.segments) {
      if (segment.start_time_utc_millis < loop.startTime + loop.duration &&
        segment.start_time_utc_millis + segment.duration > loop.startTime)
      {
        for (const type of types) {
          count += 1;
          const log = files[`${segment.canonical_name}/${type}`];
          if (log) {
            uploaded += Boolean(log.url || log.notFound);
            uploading += Boolean(log.progress !== undefined);
            requested += Boolean(log.requested);
          }
        }
      }
    }

    return [ count, uploaded, uploading, requested ];
  }

  getUploadStats() {
    const { device, segmentData, files } = this.props;
    if (!files || !segmentData || !segmentData.segments) {
      return null;
    }

    const [ countRlog, uploadedRlog, uploadingRlog, requestedRlog ] = this._uploadStats(['logs'], 0, 0, 0, 0);

    const camTypes = ['cameras', 'dcameras'].concat(device.device_type === 'three' ? ['ecameras'] : []);
    const [ countAll, uploadedAll, uploadingAll, requestedAll ] =
      this._uploadStats(camTypes, countRlog, uploadedRlog, uploadingRlog, requestedRlog);

    return {
      canRequestAll: countAll - uploadedAll - uploadingAll - requestedAll,
      canRequestRlog: countRlog - uploadedRlog - uploadingRlog - requestedRlog,
      isUploadingAll: !Boolean(countAll - uploadedAll - uploadingAll),
      isUploadingRlog: !Boolean(countRlog - uploadedRlog - uploadingRlog),
      isUploadedAll: !Boolean(countAll - uploadedAll),
      isUploadedRlog: !Boolean(countRlog - uploadedRlog),
    };
  }

  render() {
    const { classes } = this.props;
    const { inView, windowWidth } = this.state;

    if (this.props.menusOnly) {  // for test
      return this.renderMenus(true);
    }

    const showMapAlways = windowWidth >= 1536;
    const mediaContainerStyle = showMapAlways ? { width: '60%' } : { width: '100%' };
    const mapContainerStyle = showMapAlways ?
      { width: '40%', marginBottom: 62, marginTop: 46, paddingLeft: 24 } :
      { width: '100%' };

    return (
      <div className={ classes.root }>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <div style={ mediaContainerStyle }>
          { this.renderMediaOptions(showMapAlways) }
          { inView !== MediaType.MAP &&
            <DriveVideo />
          }
          { (inView === MediaType.MAP && !showMapAlways) &&
            <div style={ mapContainerStyle }>
              <DriveMap />
            </div>
          }
          <div className={ classes.timeDisplay }>
            <TimeDisplay isThin />
          </div>
        </div>
        { (inView !== MediaType.MAP && showMapAlways) &&
          <div style={ mapContainerStyle }>
            <DriveMap />
          </div>
        }
      </div>
    );
  }

  renderMediaOptions(showMapAlways) {
    const { classes } = this.props;
    const { inView } = this.state;
    return (
      <>
        <div className={classes.mediaOptionsRoot}>
          { showMapAlways ?
            <div></div>
          :
            <div className={classes.mediaOptions}>
              <div className={classes.mediaOption} style={inView !== MediaType.VIDEO ? { opacity: 0.6 } : {}}
                onClick={() => this.setState({ inView: MediaType.VIDEO })}>
                <Typography className={classes.mediaOptionText}>Video</Typography>
              </div>
              <div className={classes.mediaOption} style={inView !== MediaType.MAP ? { opacity: 0.6 } : { }}
                onClick={() => this.setState({ inView: MediaType.MAP })}>
                <Typography className={classes.mediaOptionText}>Map</Typography>
              </div>
            </div>
          }
          <div className={classes.mediaOptions}>
            <div className={classes.mediaOption} aria-haspopup="true"
              onClick={ (ev) => this.setState({ downloadMenu: ev.target }) }>
              <Typography className={classes.mediaOptionText}>Files</Typography>
            </div>
            <div className={classes.mediaOption} aria-haspopup="true"
              onClick={ (ev) => this.setState({ moreInfoMenu: ev.target }) }>
              <Typography className={classes.mediaOptionText}>More info</Typography>
            </div>
          </div>
        </div>
        { this.renderMenus() }
      </>
    );
  }

  renderMenus(alwaysOpen = false) {
    const { currentSegment, device, classes, files, profile } = this.props;
    const { downloadMenu, moreInfoMenu, uploadModal, windowWidth, dcamUploadInfo } = this.state;

    if (!device) {
      return;
    }

    let fcam = {}, ecam = {}, dcam = {}, rlog = {};
    if (files && currentSegment) {
      const seg = `${currentSegment.route}--${this.currentSegmentNum()}`;
      fcam = files[`${seg}/cameras`] || {};
      ecam = files[`${seg}/ecameras`] || {};
      dcam = files[`${seg}/dcameras`] || {};
      rlog = files[`${seg}/logs`] || {};
    }

    const canUpload = device.is_owner || (profile && profile.superuser);
    const online = deviceIsOnline(device);
    const uploadButtonWidth = windowWidth < 425 ? 80 : 120;
    const buttons = [
      [fcam, `Road camera`, 'cameras'],
      device && device.device_type === 'three' ? [ecam, 'Wide road camera', 'ecameras'] : null,
      [dcam, 'Driver camera', 'dcameras'],
      [rlog, 'Log data', 'logs'],
    ];

    const stats = this.getUploadStats();
    const rlogUploadDisabled = !stats || stats.isUploadedRlog || stats.isUploadingRlog || !stats.canRequestRlog;
    const allUploadDisabled = !stats || stats.isUploadedAll || stats.isUploadingAll || !stats.canRequestAll;

    return ( <>
      <Menu id="menu-download" open={ Boolean(alwaysOpen || downloadMenu) }
        anchorEl={ downloadMenu } onClose={ () => this.setState({ downloadMenu: null }) }
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        { !files &&
          <div className={ classes.menuLoading }>
            <CircularProgress size={ 36 } style={{ color: Colors.white }} />
          </div>
        }
        { buttons.filter((b) => Boolean(b)).map(([file, name, type]) => (
          <MenuItem key={ type } disabled={ true } className={ classes.filesItem }
            style={ Boolean(files) ? { pointerEvents: 'auto' } : { color: Colors.white60 } }>
            { name }
            { Boolean(files && file.url) &&
              <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }}
                onClick={ () => window.location.href = file.url }>
                download
              </Button>
            }
            { Boolean(files && canUpload && !file.url && file.progress === undefined && !file.requested && !file.notFound) &&
              <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }}
                onClick={ () => this.uploadFile(type) }>
                { windowWidth < 425 ? 'upload' : 'request upload' }
              </Button>
            }
            { Boolean(files && !file.url && file.progress !== undefined) &&
              <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
                { file.current ? `${parseInt(file.progress * 100)}%` : 'pending' }
              </div>
            }
            { Boolean(files && !file.url && file.requested) &&
              <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
                <CircularProgress style={{ color: Colors.white }} size={ 17 } />
              </div>
            }
            { Boolean(files && !file.url && file.notFound) &&
              <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}
                onMouseEnter={ type === 'dcameras' ? (ev) => this.setState({ dcamUploadInfo: ev.target }) : null }
                onMouseLeave={ type === 'dcameras' ? () => this.setState({ dcamUploadInfo: null }) : null }>
                not found
                { type === 'dcameras' && <InfoOutlineIcon className={ classes.dcameraUploadIcon } /> }
              </div>
            }
          </MenuItem>
        )) }
        <Divider />
        <MenuItem className={ classes.filesItem } disabled={ true }
          style={ Boolean(files && stats) ? { pointerEvents: 'auto' } : { color: Colors.white60 } }>
          All logs
          { Boolean(files && canUpload && !rlogUploadDisabled) &&
            <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }}
              onClick={ () => this.uploadFilesAll(['logs']) }>
              upload { stats.canRequestRlog } logs
            </Button>
          }
          { Boolean(canUpload && rlogUploadDisabled && stats) &&
            <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
              { stats.isUploadedRlog ?
                'uploaded' :
                (stats.isUploadingRlog ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={ 17 } /> )}
            </div>
          }
        </MenuItem>
        <MenuItem className={ classes.filesItem } disabled={ true }
          style={ Boolean(files && stats) ? { pointerEvents: 'auto' } : { color: Colors.white60 } }>
          All files
          { Boolean(files && canUpload && !allUploadDisabled) &&
            <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }}
              onClick={ () => this.uploadFilesAll() }>
              upload { stats.canRequestAll } files
            </Button>
          }
          { Boolean(canUpload && allUploadDisabled && stats) &&
            <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
              { stats.isUploadedAll ?
                'uploaded' :
                (stats.isUploadingAll ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={ 17 } /> )}
            </div>
          }
        </MenuItem>
        <Divider />
        { Boolean(online || !files) ?
          <MenuItem onClick={ files ? () => this.setState({ uploadModal: true, downloadMenu: null }) : null }
            style={ Boolean(files) ? { pointerEvents: 'auto' } : { color: Colors.white60 } }
            className={ classes.filesItem } disabled={ !files }>
            View upload queue
          </MenuItem>
        :
          <MenuItem className={ classes.offlineMenuItem } disabled={ true }>
            <div><WarningIcon /> Device offline</div>
            <span style={{ fontSize: '0.8rem' }}>uploading will resume when device is online</span>
          </MenuItem>
        }
      </Menu>
      <Menu id="menu-info" open={ Boolean(alwaysOpen || moreInfoMenu) }
        anchorEl={ moreInfoMenu } onClose={ () => this.setState({ moreInfoMenu: null }) }
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem className={ classes.copySegment } onClick={ this.copySegmentName }
          style={{ fontSize: windowWidth > 400 ? '0.8rem' : '0.7rem' }}>
          <div>{ currentSegment ? `${currentSegment.route}--${this.currentSegmentNum()}` : '---' }</div>
          <ContentCopyIcon />
        </MenuItem>
        <MenuItem onClick={ this.openInCabana } id="openInCabana" >
          View in cabana
          { Boolean(files && stats && stats.canRequestRlog) &&
            <div className={ classes.viewCabanaUploads }>
              <WarningIcon /> missing { stats.canRequestRlog } logs
              <Button onClick={ (ev) => { this.uploadFilesAll(['logs']); ev.stopPropagation(); } }>upload</Button>
            </div>
          }
          { Boolean(rlogUploadDisabled && stats && !stats.isUploadedRlog && !stats.isUploadingRlog) &&
            <div className={ classes.viewCabanaFakeUploads }>
              <CircularProgress style={{ color: Colors.white }} size={ 15 } />
            </div>
          }
        </MenuItem>
        <MenuItem onClick={ this.openInUseradmin }>
          View in useradmin
        </MenuItem>
      </Menu>
      <UploadQueue open={ uploadModal } onClose={ () => this.setState({ uploadModal: false }) }
        update={ Boolean(moreInfoMenu || uploadModal || downloadMenu) } store={ this.props.store } device={ device } />
      <Popper open={ Boolean(dcamUploadInfo) } placement="bottom"
        anchorEl={ dcamUploadInfo } className={ classes.dcameraUploadInfo }>
        <Typography>make sure to enable the "Record and Upload Driver Camera" toggle</Typography>
      </Popper>
    </> );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
  currentSegment: 'currentSegment',
  segments: 'segments',
  segmentData: 'segmentData',
  loop: 'loop',
  filter: 'filter',
  files: 'files',
  profile: 'profile',
});

export default connect(stateToProps)(withStyles(styles)(Media));

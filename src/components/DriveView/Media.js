import React, { Component } from 'react';
import qs from 'query-string';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';

import { withStyles, Divider, Typography, Menu, MenuItem, CircularProgress, Button, Popper, ListItem,
  Popover } from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';
import ContentCopyIcon from '@material-ui/icons/ContentCopy';
import ShareIcon from '@material-ui/icons/Share';
import InfoOutlineIcon from '@material-ui/icons/InfoOutline';

import { drives as DrivesApi } from '@commaai/comma-api';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import ResizeHandler from '../ResizeHandler';
import TimeDisplay from '../TimeDisplay';
import UploadQueue from '../Files/UploadQueue';
import SwitchLoading from '../utils/SwitchLoading';
import { bufferVideo, currentOffset } from '../../timeline/playback';
import Colors from '../../colors';
import { deviceIsOnline, deviceOnCellular, getSegmentNumber } from '../../utils';
import { analyticsEvent, primeNav, updateRoute } from '../../actions';
import { fetchEvents } from '../../actions/cached';
import { attachRelTime } from '../../analytics';
import { fetchFiles, doUpload, fetchUploadUrls, fetchAthenaQueue, updateFiles } from '../../actions/files';
import { clipsInit } from '../../actions/clips';

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
  switchListItem: {
    padding: '12px 16px',
    boxSizing: 'content-box',
    height: 24,
    lineHeight: 1,
    '& span': { fontSize: '1rem' },
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
  shareButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  noPrimePopover: {
    borderRadius: 16,
    padding: 16,
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    marginTop: 12,
    zIndex: 5,
    '& p': {
      fontSize: '0.9rem',
      color: Colors.white,
      margin: 0,
    },
  },
  noPrimeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    '& p': {
      fontSize: '1rem',
      fontWeight: 500,
    },
  },
  noPrimeButton: {
    padding: '6px 24px',
    borderRadius: 15,
    textTransform: 'none',
    minHeight: 'unset',
    color: Colors.white,
    backgroundColor: Colors.primeBlue50,
    '&:disabled': {
      background: '#ddd',
      color: Colors.grey900,
    },
    '&:hover': {
      color: Colors.white,
      backgroundColor: Colors.primeBlue200,
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
      createClipNoPrime: null,
      routePreserved: null,
    };

    this.renderMediaOptions = this.renderMediaOptions.bind(this);
    this.renderMenus = this.renderMenus.bind(this);
    this.renderUploadMenuItem = this.renderUploadMenuItem.bind(this);
    this.copySegmentName = this.copySegmentName.bind(this);
    this.openInCabana = this.openInCabana.bind(this);
    this.openInUseradmin = this.openInUseradmin.bind(this);
    this.shareCurrentRoute = this.shareCurrentRoute.bind(this);
    this.uploadFile = this.uploadFile.bind(this);
    this.uploadFilesAll = this.uploadFilesAll.bind(this);
    this.getUploadStats = this.getUploadStats.bind(this);
    this._uploadStats = this._uploadStats.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.initCreateClip = this.initCreateClip.bind(this);
    this.onPublicToggle = this.onPublicToggle.bind(this);
    this.fetchRoutePreserved = this.fetchRoutePreserved.bind(this);
    this.onPreserveToggle = this.onPreserveToggle.bind(this);

    this.openRequests = 0;
  }

  componentDidMount() {
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { windowWidth, inView, downloadMenu, moreInfoMenu, routePreserved } = this.state;
    const showMapAlways = windowWidth >= 1536;
    if (showMapAlways && inView === MediaType.MAP) {
      this.setState({ inView: MediaType.VIDEO });
    }

    if (!showMapAlways && inView === MediaType.MAP && this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(false));
    }

    if (prevProps.currentRoute !== this.props.currentRoute && this.props.currentRoute) {
      this.props.dispatch(fetchEvents(this.props.currentRoute));
    }

    if (prevState.inView && prevState.inView !== this.state.inView) {
      this.props.dispatch(analyticsEvent('media_switch_view', { in_view: this.state.inView }));
    }

    if (this.props.currentRoute && ((!prevState.downloadMenu && downloadMenu) ||
      (!this.props.files && !prevState.moreInfoMenu && moreInfoMenu) ||
      (!prevProps.currentRoute && (downloadMenu || moreInfoMenu))))
    {
      if ((this.props.device && !this.props.device.shared) || this.props.profile?.superuser) {
        this.props.dispatch(fetchAthenaQueue(this.props.dongleId));
      }
      this.props.dispatch(fetchFiles(this.props.currentRoute.fullname));
    }

    if (routePreserved === null && (this.props.device?.is_owner || this.props.profile?.superuser) &&
      (!prevState.moreInfoMenu && !prevProps.currentRoute) !== (moreInfoMenu && this.props.currentRoute))
    {
      this.fetchRoutePreserved();
    }
  }

  async copySegmentName() {
    const { currentRoute } = this.props;
    if (!currentRoute || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${currentRoute.fullname}--${getSegmentNumber(currentRoute)}`);
    this.setState({ moreInfoMenu: null });
  }

  openInCabana() {
    const { currentRoute, loop } = this.props;
    if (!currentRoute) {
      return;
    }
    const offset = currentOffset();
    const params = {
      route: currentRoute.fullname,
      url: currentRoute.url,
      seekTime: Math.floor((offset - currentRoute.offset) / 1000)
    };

    if (loop.startTime && loop.startTime > currentRoute.start_time_utc_millis && loop.duration < 180000) {
      const startTime = Math.floor((loop.startTime - currentRoute.start_time_utc_millis) / 1000);
      params.segments = [startTime, Math.floor(startTime + (loop.duration / 1000))].join(',');
    }

    const event_parameters = {
      route_start_time: currentRoute.start_time_utc_millis,
    };
    attachRelTime(event_parameters, 'route_start_time', true, 'h');
    this.props.dispatch(analyticsEvent('open_in_cabana', event_parameters));

    const win = window.open(`${window.CABANA_URL_ROOT}?${qs.stringify(params)}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  openInUseradmin() {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      return;
    }

    const event_parameters = {
      route_start_time: currentRoute.start_time_utc_millis,
    };
    attachRelTime(event_parameters, 'route_start_time', true, 'h');
    this.props.dispatch(analyticsEvent('open_in_cabana', event_parameters));

    const params = { onebox: currentRoute.fullname };
    const win = window.open(`${window.USERADMIN_URL_ROOT}?${qs.stringify(params)}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  }

  async shareCurrentRoute() {
    try {
      await navigator.share({
        title: 'comma connect',
        url: window.location.href,
      });
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'media_navigator_share' });
    }
  }

  async uploadFile(type) {
    const { dongleId, currentRoute } = this.props;
    if (!currentRoute) {
      return;
    }

    this.props.dispatch(analyticsEvent('files_upload', {
      type: type,
    }));

    const routeNoDongleId = currentRoute.fullname.split('|')[1];
    const path = `${routeNoDongleId}--${getSegmentNumber(currentRoute)}/${FILE_NAMES[type]}`;
    const fileName = `${dongleId}|${routeNoDongleId}--${getSegmentNumber(currentRoute)}/${type}`;

    const uploading = {};
    uploading[fileName] = { requested: true };
    this.props.dispatch(updateFiles(uploading));

    const urls = await fetchUploadUrls(dongleId, [path]);
    if (urls) {
      this.props.dispatch(doUpload(dongleId, [fileName], [path], urls));
    }
  }

  async uploadFilesAll(types) {
    const { dongleId, device, currentRoute, loop, files } = this.props;
    if (types === undefined) {
      types = ['logs', 'cameras', 'dcameras'];
      if (device.device_type === 'three') {
        types.push('ecameras');
      };
    }

    if (!currentRoute || !files) {
      return;
    }

    this.props.dispatch(analyticsEvent('files_upload_all', {
      types: types.length === 1 && types[0] === 'logs' ? 'logs' : 'all',
    }));

    const uploading = {}
    for (let i = 0; i < currentRoute.segment_numbers.length; i++) {
      if (currentRoute.segment_start_times[i] < loop.startTime + loop.duration &&
        currentRoute.segment_end_times[i] > loop.startTime)
      {
        for (const type of types) {
          const fileName = `${currentRoute.fullname}--${currentRoute.segment_numbers[i]}/${type}`;
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

    const urls = await fetchUploadUrls(dongleId, paths);
    if (urls) {
      this.props.dispatch(doUpload(dongleId, Object.keys(uploading), paths, urls));
    }
  }

  _uploadStats(types, count, uploaded, uploading, paused, requested) {
    const { currentRoute, loop, files } = this.props;
    for (let i = 0; i < currentRoute.segment_numbers.length; i++) {
      if (currentRoute.segment_start_times[i] < loop.startTime + loop.duration &&
        currentRoute.segment_end_times[i] > loop.startTime)
      {
        for (const type of types) {
          count += 1;
          const log = files[`${currentRoute.fullname}--${currentRoute.segment_numbers[i]}/${type}`];
          if (log) {
            uploaded += Boolean(log.url || log.notFound);
            uploading += Boolean(log.progress !== undefined);
            paused += Boolean(log.paused);
            requested += Boolean(log.requested);
          }
        }
      }
    }

    return [ count, uploaded, uploading, paused, requested ];
  }

  getUploadStats() {
    const { device, currentRoute, files } = this.props;
    if (!files || !currentRoute) {
      return null;
    }

    const [ countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog ]
      = this._uploadStats(['logs'], 0, 0, 0, 0, 0);

    const camTypes = ['cameras', 'dcameras'].concat(device.device_type === 'three' ? ['ecameras'] : []);
    const [ countAll, uploadedAll, uploadingAll, pausedAll, requestedAll ] =
      this._uploadStats(camTypes, countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog);

    return {
      canRequestAll: countAll - uploadedAll - uploadingAll - requestedAll,
      canRequestRlog: countRlog - uploadedRlog - uploadingRlog - requestedRlog,
      isUploadingAll: !Boolean(countAll - uploadedAll - uploadingAll),
      isUploadingRlog: !Boolean(countRlog - uploadedRlog - uploadingRlog),
      isUploadedAll: !Boolean(countAll - uploadedAll),
      isUploadedRlog: !Boolean(countRlog - uploadedRlog),
      isPausedAll: Boolean(pausedAll > 0 && pausedAll === uploadingAll),
    };
  }

  downloadFile(file, type) {
    const { currentRoute } = this.props;

    const event_parameters = {
      type,
      route_start_time: currentRoute.start_time_utc_millis,
    };
    attachRelTime(event_parameters, 'route_start_time', true, 'h');
    this.props.dispatch(analyticsEvent('download_file', event_parameters));

    window.location.href = file.url
  }

  initCreateClip(ev) {
    const { device, profile, currentRoute } = this.props;
    if (!currentRoute) {
      return;
    }

    if (device.prime || profile?.superuser) {
      this.props.dispatch(clipsInit());
    } else {
      this.setState({ createClipNoPrime: ev.target });
    }
  }

  async onPublicToggle(ev) {
    const is_public = ev.target.checked;
    try {
      const resp = await DrivesApi.setRoutePublic(this.props.currentRoute.fullname, is_public);
      if (resp && resp.fullname === this.props.currentRoute.fullname) {
        this.props.dispatch(updateRoute(this.props.currentRoute.fullname, { is_public: resp.is_public }));
        if (resp.is_public !== is_public) {
          return { error: 'unable to update' };
        }
      }
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'media_toggle_public' });
      return { error: 'could not update' };
    }
  }

  async fetchRoutePreserved() {
    try {
      const resp = await DrivesApi.getPreservedRoutes(this.props.dongleId);
      if (resp && Array.isArray(resp) && this.props.currentRoute) {
        for (const r of resp) {
          if (this.props.currentRoute.fullname === r.fullname) {
            this.setState({ routePreserved: true });
            return;
          }
        }
        this.setState({ routePreserved: false });
      }
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'media_fetch_preserved' });
    }
  }

  async onPreserveToggle(ev) {
    const preserved = ev.target.checked;
    try {
      const resp = await DrivesApi.setRoutePreserved(this.props.currentRoute.fullname, preserved);
      if (resp && resp.success) {
        this.setState({ routePreserved: preserved });
        return;
      }
      this.fetchRoutePreserved();
      return { error: 'unable to update' };
    } catch (err) {
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'media_toggle_preserved' });
      this.fetchRoutePreserved();
      return { error: 'could not update' };
    }
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
    const { classes, device, profile } = this.props;
    const { inView, createClipNoPrime } = this.state;
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
            { Boolean(device?.is_owner || (profile && profile.superuser)) &&
              <div className={classes.mediaOption} aria-haspopup="true" onClick={ this.initCreateClip }>
                <Typography className={classes.mediaOptionText}>Create clip</Typography>
              </div>
            }
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
        <Popover open={ Boolean(createClipNoPrime) } anchorEl={ createClipNoPrime }
          onClose={ () => this.setState({ createClipNoPrime: null }) } classes={{ paper: classes.noPrimePopover }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <div className={ classes.noPrimeHeader }>
            <p>comma prime</p>
            <Button onClick={ () => this.props.dispatch(primeNav(true)) } className={ classes.noPrimeButton }>
              sign up
            </Button>
          </div>
          <p>clip export is a prime only feature</p>
        </Popover>
      </>
    );
  }

  renderMenus(alwaysOpen = false) {
    const { currentRoute, device, classes, files, profile } = this.props;
    const { downloadMenu, moreInfoMenu, uploadModal, windowWidth, dcamUploadInfo, routePreserved } = this.state;

    if (!device) {
      return;
    }

    let fcam = {}, ecam = {}, dcam = {}, rlog = {};
    if (files && currentRoute) {
      const seg = `${currentRoute.fullname}--${getSegmentNumber(currentRoute)}`;
      fcam = files[`${seg}/cameras`] || {};
      ecam = files[`${seg}/ecameras`] || {};
      dcam = files[`${seg}/dcameras`] || {};
      rlog = files[`${seg}/logs`] || {};
    }

    const canUpload = device.is_owner || (profile && profile.superuser);
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
        { buttons.filter((b) => Boolean(b)).map(this.renderUploadMenuItem)}
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
        { Boolean(deviceIsOnline(device) || !files) ?
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
        { stats && stats.isPausedAll && deviceOnCellular(device) &&
          <MenuItem className={ classes.offlineMenuItem } disabled={ true }>
            <div><WarningIcon /> Connect to WiFi</div>
            <span style={{ fontSize: '0.8rem' }}>uploading paused on cellular connection</span>
          </MenuItem>
        }
      </Menu>
      <Menu id="menu-info" open={ Boolean(alwaysOpen || moreInfoMenu) }
        anchorEl={ moreInfoMenu } onClose={ () => this.setState({ moreInfoMenu: null }) }
        transformOrigin={{ vertical: 'top', horizontal: windowWidth > 400 ? 260 : 300 }}>
        <MenuItem className={ classes.copySegment } onClick={ this.copySegmentName }
          style={{ fontSize: windowWidth > 400 ? '0.8rem' : '0.7rem' }}>
          <div>{ currentRoute ? `${currentRoute.fullname}--${getSegmentNumber(currentRoute)}` : '---' }</div>
          <ContentCopyIcon />
        </MenuItem>
        { typeof navigator.share !== 'undefined' &&
          <MenuItem onClick={ this.shareCurrentRoute } className={ classes.shareButton }>
            Share this route
            <ShareIcon />
          </MenuItem>
        }
        <Divider />
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
        { Boolean(device?.is_owner || (profile && profile.superuser)) && [
          <Divider key="1" />,
          <ListItem key="2" className={ classes.switchListItem }>
            <SwitchLoading checked={ currentRoute?.is_public } onChange={ this.onPublicToggle } label="Public access" />
          </ListItem>,
          <ListItem key="3" className={ classes.switchListItem }>
            <SwitchLoading checked={ Boolean(routePreserved) } loading={ routePreserved === null }
              onChange={ this.onPreserveToggle } label="Preserved" />
          </ListItem>,
        ] }
      </Menu>
      <UploadQueue open={ uploadModal } onClose={ () => this.setState({ uploadModal: false }) }
        update={ Boolean(moreInfoMenu || uploadModal || downloadMenu) } store={ this.props.store } device={ device } />
      <Popper open={ Boolean(dcamUploadInfo) } placement="bottom"
        anchorEl={ dcamUploadInfo } className={ classes.dcameraUploadInfo }>
        <Typography>make sure to enable the "Record and Upload Driver Camera" toggle</Typography>
      </Popper>
    </> );
  }

  renderUploadMenuItem([file, name, type]) {
    const { device, classes, files, profile } = this.props;
    const { windowWidth } = this.state;

    const canUpload = device.is_owner || (profile && profile.superuser);
    const uploadButtonWidth = windowWidth < 425 ? 80 : 120;

    let button;
    if (!files) {
      button = null;
    } else if (file.url) {
      button = (
        <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }}
          onClick={ () => this.downloadFile(file, type) }>
          download
        </Button>
      );
    } else if (file.progress !== undefined) {
      button = (
        <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
          { file.current ?
            `${parseInt(file.progress * 100)}%` :
            (file.paused ? 'paused' : 'pending') }
        </div>
      );
    } else if (file.requested) {
      button = (
        <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
          <CircularProgress style={{ color: Colors.white }} size={ 17 } />
        </div>
      );
    } else if (file.notFound) {
      button = (
        <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}
          onMouseEnter={ type === 'dcameras' ? (ev) => this.setState({ dcamUploadInfo: ev.target }) : null }
          onMouseLeave={ type === 'dcameras' ? () => this.setState({ dcamUploadInfo: null }) : null }>
          not found
          { type === 'dcameras' && <InfoOutlineIcon className={ classes.dcameraUploadIcon } /> }
        </div>
      );
    } else if (!canUpload) {
      button = (
        <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }} disabled={ true }>
          download
        </Button>
      );
    } else {
      button = (
        <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }}
          onClick={ () => this.uploadFile(type) }>
          { windowWidth < 425 ? 'upload' : 'request upload' }
        </Button>
      );
    }

    return (
      <MenuItem key={ type } disabled={ true } className={ classes.filesItem }
        style={ Boolean(files) ? { pointerEvents: 'auto' } : { color: Colors.white60 } }>
        { name }
        { button }
      </MenuItem>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
  routes: 'routes',
  currentRoute: 'currentRoute',
  loop: 'loop',
  filter: 'filter',
  files: 'files',
  profile: 'profile',
  isBufferingVideo: 'isBufferingVideo',
});

export default connect(stateToProps)(withStyles(styles)(Media));

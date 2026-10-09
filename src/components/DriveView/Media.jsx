import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';

import { withStyles, Typography, Menu, MenuItem, CircularProgress, Button, Popper, ListItem, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions } from '@material-ui/core';

import { USERADMIN_URL_ROOT } from '../../api';
import { api } from '../../api/backend';
import { deviceSupportsClips } from '../../api/clips';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import TimeDisplay from '../TimeDisplay';
import { subscribeWindowSize } from '../../hooks/window';
import UploadQueue from '../Files/UploadQueue';
import ClipMenu from './ClipMenu';
import SwitchLoading from '../utils/SwitchLoading';
import { bufferVideo } from '../../timeline/playback';
import Colors from '../../colors';
import { ContentCopy, InfoOutline, ShareIcon, WarningIcon } from '../../icons';
import { deviceIsOnline, deviceOnCellular, getSegmentNumber } from '../../utils';
import { stringifyQuery } from '../../utils/query';
import { analyticsEvent, updateRoute } from '../../actions';
import { fetchEvents } from '../../actions/cached';
import { openDialog, closeDialog } from '../../actions/navigation';
import { attachRelTime } from '../../analytics';
import { setRouteViewed, fetchFiles, doUpload, fetchUploadUrls, fetchAthenaQueue, updateFiles, FILE_NAMES } from '../../actions/files';

const publicTooltip = 'Making a route public allows anyone with the route name or link to access it.';
const preservedTooltip = 'Preserving a route will prevent it from being deleted. You can preserve up to 10 routes, or 100 if you have comma prime.';

const styles = () => ({
  mediaOptions: {
    display: 'flex',
    width: 'max-content',
    alignItems: 'center',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 50,
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
  shareButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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

const MediaType = {
  VIDEO: 'video',
  MAP: 'map',
};

class Media extends Component {
  constructor(props) {
    super(props);

    this.state = {
      inView: MediaType.VIDEO,
      windowWidth: window.innerWidth,
      downloadMenu: null,
      clipMenu: null,
      moreInfoMenu: null,
      dcamUploadInfo: null,
      routePreserved: null,
      isMuted: true,
      hasAudio: false,
      clipsSupported: false,
      clipsSupportChecked: false,
    };

    this.handleMuteToggle = this.handleMuteToggle.bind(this);
    this.handleAudioStatusChange = this.handleAudioStatusChange.bind(this);
    this.renderMediaOptions = this.renderMediaOptions.bind(this);
    this.renderMenus = this.renderMenus.bind(this);
    this.renderUploadMenuItem = this.renderUploadMenuItem.bind(this);
    this.copySegmentName = this.copySegmentName.bind(this);
    this.openInUseradmin = this.openInUseradmin.bind(this);
    this.shareCurrentRoute = this.shareCurrentRoute.bind(this);
    this.uploadFile = this.uploadFile.bind(this);
    this.uploadFilesAll = this.uploadFilesAll.bind(this);
    this.getUploadStats = this.getUploadStats.bind(this);
    this._uploadStats = this._uploadStats.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.onPublicToggle = this.onPublicToggle.bind(this);
    this.fetchRoutePreserved = this.fetchRoutePreserved.bind(this);
    this.onPreserveToggle = this.onPreserveToggle.bind(this);

    this.routeViewed = false;
    this.clipSupportRequest = 0;
    this.downloadButton = React.createRef();
    this.clipButton = React.createRef();
    this.moreInfoButton = React.createRef();
  }

  handleMuteToggle() {
    this.setState(prevState => ({ isMuted: !prevState.isMuted }));
  }

  handleAudioStatusChange(hasAudio) {
    this.setState({ hasAudio });
  }

  componentDidMount() {
    this.mounted = true;
    this.unsubscribeWindowSize = subscribeWindowSize(({ width }) => {
      this.setState({ windowWidth: width });
    });
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { windowWidth, inView, routePreserved } = this.state;
    const { dialog, settingsDongleId, currentRoute } = this.props;
    const routeChanged = prevProps.currentRoute?.fullname !== currentRoute?.fullname;
    const dialogChanged = prevProps.dialog !== dialog || prevProps.settingsDongleId !== settingsDongleId;
    const needsFiles = dialog === 'downloads' || dialog === 'info';
    const showMapAlways = windowWidth >= 1536;
    if (prevProps.dongleId !== this.props.dongleId) {
      this.setState({ clipsSupported: false, clipsSupportChecked: false, clipMenu: null });
      this.checkClipsSupport();
    } else if (!deviceIsOnline(prevProps.device) && deviceIsOnline(this.props.device)) {
      this.setState({ clipsSupported: false, clipsSupportChecked: false });
      this.checkClipsSupport();
    } else if (deviceIsOnline(prevProps.device) && !deviceIsOnline(this.props.device)) {
      this.clipSupportRequest += 1;
    }
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

    if (currentRoute && needsFiles && (dialogChanged || routeChanged)) {
      if ((this.props.device && !this.props.device.shared) || this.props.profile?.superuser) {
        this.props.dispatch(fetchAthenaQueue(this.props.dongleId));
      }
      this.props.dispatch(fetchFiles(this.props.currentRoute.fullname));
    }

    if (routeChanged) {
      this.setState({ routePreserved: null });
    }
    if (currentRoute && dialog === 'info' && (routePreserved === null || routeChanged)
      && (this.props.device?.is_owner || this.props.profile?.superuser)
      && (dialogChanged || routeChanged || (!prevProps.device?.is_owner && this.props.device?.is_owner)
        || (!prevProps.profile?.superuser && this.props.profile?.superuser))) {
      this.fetchRoutePreserved();
    }

    if (!this.routeViewed && this.props.currentRoute && ((this.props.device && !this.props.device.shared) || this.props.profile?.superuser)) {
      this.props.dispatch(setRouteViewed(this.props.dongleId, this.props.currentRoute.fullname));
      this.routeViewed = true;
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribeWindowSize?.();
  }

  async checkClipsSupport() {
    const { device, dongleId } = this.props;
    this.clipSupportRequest += 1;
    const request = this.clipSupportRequest;
    if (!deviceIsOnline(device)) return;
    try {
      const clipsSupported = await deviceSupportsClips(device);
      if (this.mounted && request === this.clipSupportRequest && dongleId === this.props.dongleId) {
        this.setState({ clipsSupported, clipsSupportChecked: true });
      }
    } catch (error) {
      if (this.mounted && request === this.clipSupportRequest && dongleId === this.props.dongleId) {
        this.setState({ clipsSupported: false, clipsSupportChecked: true });
      }
    }
  }

  async copySegmentName() {
    const { currentRoute } = this.props;
    if (!currentRoute || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${currentRoute.fullname.replace('|', '/')}/${getSegmentNumber(currentRoute)}`);
    this.props.dispatch(closeDialog());
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
    this.props.dispatch(analyticsEvent('open_in_useradmin', event_parameters));

    const params = { onebox: currentRoute.fullname };
    const win = window.open(`${USERADMIN_URL_ROOT}?${stringifyQuery(params)}`, '_blank');
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
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_navigator_share' });
    }
  }

  async uploadFile(type) {
    const { dongleId, currentRoute } = this.props;
    if (!currentRoute) {
      return;
    }

    this.props.dispatch(analyticsEvent('files_upload', {
      type,
    }));

    const routeNoDongleId = currentRoute.fullname.split('|')[1];
    const fileName = `${dongleId}|${routeNoDongleId}--${getSegmentNumber(currentRoute)}/${type}`;

    const uploading = {};
    uploading[fileName] = { requested: true };
    this.props.dispatch(updateFiles(uploading));

    let paths = [];
    let url_promises = [];

    // request all possible file names
    for (const fn of FILE_NAMES[type]) {
      const path = `${routeNoDongleId}--${getSegmentNumber(currentRoute)}/${fn}`;
      paths.push(path);
      url_promises.push(fetchUploadUrls(dongleId, [path]).then(urls => urls[0]));
    }

    const urls = await Promise.all(url_promises);
    if (urls) {
      this.props.dispatch(doUpload(dongleId, paths, urls));
    }
  }

  async uploadFilesAll(types) {
    const { dongleId, currentRoute, loop, files } = this.props;
    if (types === undefined) {
      types = ['logs', 'cameras', 'dcameras', 'ecameras'];
    }

    if (!currentRoute || !files) {
      return;
    }

    this.props.dispatch(analyticsEvent('files_upload_all', {
      types: types.length === 1 && types[0] === 'logs' ? 'logs' : 'all',
    }));

    const uploading = {};
    const adjusted_start_time = currentRoute.start_time_utc_millis + loop.startTime;
    for (let i = 0; i < currentRoute.segment_numbers.length; i++) {
      if (currentRoute.segment_start_times[i] < adjusted_start_time + loop.duration
        && currentRoute.segment_end_times[i] > adjusted_start_time) {
        types.forEach((type) => {
          const fileName = `${currentRoute.fullname}--${currentRoute.segment_numbers[i]}/${type}`;
          if (!files[fileName]) {
            uploading[fileName] = { requested: true };
          }
        });
      }
    }
    this.props.dispatch(updateFiles(uploading));

    const paths = Object.keys(uploading).flatMap((fileName) => {
      const [seg, type] = fileName.split('/');
      return FILE_NAMES[type].map(file => `${seg.split('|')[1]}/${file}`);
    });

    const urls = await fetchUploadUrls(dongleId, paths);
    if (urls) {
      this.props.dispatch(doUpload(dongleId, paths, urls));
    }
  }

  _uploadStats(types, count, uploaded, uploading, paused, requested) {
    const { currentRoute, loop, files } = this.props;
    const adjusted_start_time = currentRoute.start_time_utc_millis + loop.startTime;

    for (let i = 0; i < currentRoute.segment_numbers.length; i++) {
      if (currentRoute.segment_start_times[i] < adjusted_start_time + loop.duration
        && currentRoute.segment_end_times[i] > adjusted_start_time) {
        for (let j = 0; j < types.length; j++) {
          count += 1;
          const log = files[`${currentRoute.fullname}--${currentRoute.segment_numbers[i]}/${types[j]}`];
          if (log) {
            uploaded += Boolean(log.url || log.notFound);
            uploading += Boolean(log.progress !== undefined);
            paused += Boolean(log.paused);
            requested += Boolean(log.requested);
          }
        }
      }
    }

    return [count, uploaded, uploading, paused, requested];
  }

  getUploadStats() {
    const { currentRoute, files } = this.props;
    if (!files || !currentRoute) {
      return null;
    }
    const [countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog] = this._uploadStats(['logs'], 0, 0, 0, 0, 0);

    const camTypes = ['cameras', 'dcameras', 'ecameras'];
    const [countAll, uploadedAll, uploadingAll, pausedAll, requestedAll] = this._uploadStats(camTypes, countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog);

    return {
      canRequestAll: countAll - uploadedAll - uploadingAll - requestedAll,
      canRequestRlog: countRlog - uploadedRlog - uploadingRlog - requestedRlog,
      isUploadingAll: !(countAll - uploadedAll - uploadingAll),
      isUploadingRlog: !(countRlog - uploadedRlog - uploadingRlog),
      isUploadedAll: !(countAll - uploadedAll),
      isUploadedRlog: !(countRlog - uploadedRlog),
      isPausedAll: Boolean(pausedAll > 0 && pausedAll === uploadingAll),
    };
  }

  downloadFile(file, type) {
    const { currentRoute } = this.props;

    const eventParameters = {
      type,
      route_start_time: currentRoute.start_time_utc_millis,
    };
    attachRelTime(eventParameters, 'route_start_time', true, 'h');
    this.props.dispatch(analyticsEvent('download_file', eventParameters));

    window.location.href = file.url;
  }

  async onPublicToggle(ev) {
    const isPublic = ev.target.checked;
    try {
      const resp = await api.routes.setRoutePublic(this.props.currentRoute.fullname, isPublic);
      if (resp && resp.fullname === this.props.currentRoute.fullname) {
        this.props.dispatch(updateRoute(this.props.currentRoute.fullname, { is_public: resp.is_public }));
        if (resp.is_public !== isPublic) {
          return { error: 'unable to update' };
        }
      }
      return null;
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_toggle_public' });
      return { error: 'could not update' };
    }
  }

  async fetchRoutePreserved() {
    const { dongleId, currentRoute } = this.props;
    try {
      const resp = await api.routes.getPreservedRoutes(dongleId);
      if (this.mounted && dongleId === this.props.dongleId && currentRoute
        && currentRoute.fullname === this.props.currentRoute?.fullname && Array.isArray(resp)) {
        if (resp.find((r) => r.fullname === currentRoute.fullname)) {
          this.setState({ routePreserved: true });
          return;
        }
        this.setState({ routePreserved: false });
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_fetch_preserved' });
    }
  }

  async onPreserveToggle(ev) {
    const preserved = ev.target.checked;
    try {
      const resp = await api.routes.setRoutePreserved(this.props.currentRoute.fullname, preserved);
      if (resp && resp.success) {
        this.setState({ routePreserved: preserved });
        return null;
      }
      this.fetchRoutePreserved();
      return { error: 'unable to update' };
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_toggle_preserved' });
      this.fetchRoutePreserved();
      return { error: 'could not update' };
    }
  }

  render() {
    const { inView, windowWidth, isMuted, hasAudio } = this.state;

    if (this.props.menusOnly) { // for test
      return this.renderMenus(true);
    }

    const showMapAlways = windowWidth >= 1536;

    return (
      <div className="flex flex-col gap-4">
        {this.renderMediaOptions(showMapAlways)}
        <div className="flex flex-row gap-5">
          <div className={showMapAlways ? 'w-[60%]' : 'w-full'}>
            {inView === MediaType.VIDEO && (
              <DriveVideo
                isMuted={isMuted}
                onAudioStatusChange={this.handleAudioStatusChange}
              />
            )}
            {(inView === MediaType.MAP && !showMapAlways) && (
              <div className="w-full">
                <DriveMap />
              </div>
            )}
          </div>
          {(inView === MediaType.VIDEO && showMapAlways) &&
            <div className="w-[40%]">
              <DriveMap />
            </div>
          }
        </div>
        <div className={`${showMapAlways ? 'w-[60%]' : 'w-full'} self-start flex justify-center`}>
          <TimeDisplay
            isThin
            isMuted={isMuted}
            hasAudio={hasAudio}
            onMuteToggle={this.handleMuteToggle}
          />
        </div>
      </div>
    );
  }

  renderMediaOptions(showMapAlways) {
    const { classes, device } = this.props;
    const { inView, clipsSupported } = this.state;
    return (
      <>
        <div className="flex flex-wrap">
          { !showMapAlways && (
            <div className={classes.mediaOptions}>
              <div
                className={classes.mediaOption}
                style={inView !== MediaType.VIDEO ? { opacity: 0.6 } : {}}
                onClick={() => this.setState({ inView: MediaType.VIDEO })}
              >
                <Typography className={classes.mediaOptionText}>Video</Typography>
              </div>
              <div
                className={classes.mediaOption}
                style={inView !== MediaType.MAP ? { opacity: 0.6 } : { }}
                onClick={() => this.setState({ inView: MediaType.MAP })}
              >
                <Typography className={classes.mediaOptionText}>Map</Typography>
              </div>
            </div>
          )}
          <div className={`${classes.mediaOptions} ml-auto`}>
            {clipsSupported && <Tooltip title={deviceIsOnline(device) ? '' : 'Device offline'} placement="top">
              <div
                ref={this.clipButton}
                className={classes.mediaOption}
                style={deviceIsOnline(device) ? {} : { opacity: 0.7 }}
                aria-haspopup="true"
                onClick={(ev) => {
                  if (deviceIsOnline(device)) {
                    this.setState({ clipMenu: ev.currentTarget });
                    this.props.dispatch(openDialog('clips'));
                  }
                }}
              >
                <Typography className={classes.mediaOptionText}>Clip</Typography>
              </div>
            </Tooltip>}
            <div
              ref={this.downloadButton}
              className={classes.mediaOption}
              aria-haspopup="true"
              onClick={ (ev) => {
                this.setState({ downloadMenu: ev.currentTarget });
                this.props.dispatch(openDialog('downloads'));
              } }
            >
              <Typography className={classes.mediaOptionText}>Files</Typography>
            </div>
            <div
              ref={this.moreInfoButton}
              className={classes.mediaOption}
              aria-haspopup="true"
              onClick={ (ev) => {
                this.setState({ moreInfoMenu: ev.currentTarget });
                this.props.dispatch(openDialog('info'));
              } }
            >
              <Typography className={classes.mediaOptionText}>More info</Typography>
            </div>
          </div>
        </div>
        { this.renderMenus() }
      </>
    );
  }

  renderMenus(alwaysOpen = false) {
    const { currentRoute, device, classes, files, profile, dialog, settingsDongleId, clipFilename } = this.props;
    const { downloadMenu, clipMenu, moreInfoMenu, clipsSupported, clipsSupportChecked, windowWidth, dcamUploadInfo, routePreserved } = this.state;

    if (!device) {
      return null;
    }
    const clipDialogOpen = ['clips', 'clip-preview', 'clip-delete'].includes(dialog);
    const clipsAvailable = clipsSupported && deviceIsOnline(device);

    let fcam = {}; let ecam = {}; let dcam = {}; let
      rlog = {};
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
      [fcam, 'Road camera', 'cameras'],
      [ecam, 'Wide road camera', 'ecameras'],
      [dcam, 'Driver camera', 'dcameras'],
      [rlog, 'Log data', 'logs'],
    ];

    const stats = this.getUploadStats();
    const rlogUploadDisabled = !stats || stats.isUploadedRlog || stats.isUploadingRlog || !stats.canRequestRlog;
    const allUploadDisabled = !stats || stats.isUploadedAll || stats.isUploadingAll || !stats.canRequestAll;

    return (
      <>
        <ClipMenu
          open={Boolean(alwaysOpen || (clipDialogOpen && clipsAvailable))}
          dongleId={this.props.dongleId}
          anchorEl={() => clipMenu || this.clipButton.current || this.downloadButton.current}
          onClose={() => this.props.dispatch(closeDialog())}
          dialog={dialog}
          clipFilename={clipFilename}
          onOpenPreview={(clip) => this.props.dispatch(openDialog('clip-preview', { clipFilename: clip.filename }))}
          onOpenDelete={(clip) => this.props.dispatch(openDialog('clip-delete', { clipFilename: clip.filename }))}
          onCloseClip={() => this.props.dispatch(closeDialog('clips'))}
          route={currentRoute}
          routes={this.props.routes}
          zoom={this.props.zoom}
          deviceOnline={deviceIsOnline(device)}
        />
        <Dialog open={Boolean(!alwaysOpen && clipDialogOpen && !clipsAvailable)} aria-labelledby="clip-unavailable-title" onClose={() => this.props.dispatch(closeDialog())}>
          <DialogTitle id="clip-unavailable-title">Clips unavailable</DialogTitle>
          <DialogContent>
            <Typography>
              {!deviceIsOnline(device) ? 'Device offline. Connect your device to access clips.'
                : (clipsSupportChecked ? 'Clips are not available on this device.' : 'Checking clip availability…')}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => this.props.dispatch(closeDialog())}>Close</Button>
          </DialogActions>
        </Dialog>
        <Menu
          id="menu-download"
          open={ Boolean(alwaysOpen || dialog === 'downloads') }
          anchorEl={ () => downloadMenu || this.downloadButton.current }
          onClose={ () => this.props.dispatch(closeDialog()) }
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          { !files
          && (
          <div className={ classes.menuLoading }>
            <CircularProgress size={ 36 } style={{ color: Colors.white }} />
          </div>
          )}
          { buttons.filter((b) => Boolean(b)).map(this.renderUploadMenuItem)}
          <hr />
          <MenuItem
            className={ classes.filesItem }
            disabled
            style={ files && stats ? { pointerEvents: 'auto' } : { color: Colors.white60 } }
          >
            All logs
            { Boolean(files && canUpload && !rlogUploadDisabled)
            && (
            <Button
              className={ classes.uploadButton }
              style={{ minWidth: uploadButtonWidth }}
              onClick={ () => this.uploadFilesAll(['logs']) }
            >
              {`upload ${stats.canRequestRlog} logs`}
            </Button>
            )}
            { Boolean(canUpload && rlogUploadDisabled && stats)
            && (
            <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
              { stats.isUploadedRlog
                ? 'uploaded'
                : (stats.isUploadingRlog ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={ 17 } />)}
            </div>
            )}
          </MenuItem>
          <MenuItem
            className={ classes.filesItem }
            disabled
            style={ files && stats ? { pointerEvents: 'auto' } : { color: Colors.white60 } }
          >
            All files
            { Boolean(files && canUpload && !allUploadDisabled)
            && (
            <Button
              className={ classes.uploadButton }
              style={{ minWidth: uploadButtonWidth }}
              onClick={ () => this.uploadFilesAll() }
            >
              {`upload ${stats.canRequestAll} files`}
            </Button>
            )}
            { Boolean(canUpload && allUploadDisabled && stats)
            && (
            <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
              { stats.isUploadedAll
                ? 'uploaded'
                : (stats.isUploadingAll ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={ 17 } />)}
            </div>
            )}
          </MenuItem>
          <hr />
          { deviceIsOnline(device) || !files ? (
            <MenuItem
              onClick={ files ? () => this.props.dispatch(openDialog('uploads')) : null }
              style={ files ? { pointerEvents: 'auto' } : { color: Colors.white60 } }
              className={ classes.filesItem }
              disabled={ !files }
            >
              View upload queue
            </MenuItem>
          )
            : (
              <MenuItem className={ classes.offlineMenuItem } disabled>
                <div>
                  <WarningIcon />
                  Device offline
                </div>
                <span style={{ fontSize: '0.8rem' }}>uploading will resume when device is online</span>
              </MenuItem>
            )}
          { stats && stats.isPausedAll && deviceOnCellular(device)
          && (
          <MenuItem className={ classes.offlineMenuItem } disabled>
            <div>
              <WarningIcon />
              Connect to WiFi
            </div>
            <span style={{ fontSize: '0.8rem' }}>uploading paused on cellular connection</span>
          </MenuItem>
          )}
        </Menu>
        <Menu
          id="menu-info"
          open={ Boolean(alwaysOpen || dialog === 'info') }
          anchorEl={ () => moreInfoMenu || this.moreInfoButton.current }
          onClose={ () => this.props.dispatch(closeDialog()) }
          transformOrigin={{ vertical: 'top', horizontal: windowWidth > 400 ? 260 : 300 }}
        >
          <MenuItem
            className={ classes.copySegment }
            onClick={ this.copySegmentName }
            style={{ fontSize: windowWidth > 400 ? '0.8rem' : '0.7rem' }}
          >
            <div>{ currentRoute ? `${currentRoute.fullname.replace('|', '/')}/${getSegmentNumber(currentRoute)}` : '---' }</div>
            <ContentCopy />
          </MenuItem>
          { typeof navigator.share !== 'undefined'
          && (
          <MenuItem onClick={ this.shareCurrentRoute } className={ classes.shareButton }>
            Share this route
            <ShareIcon />
          </MenuItem>
          )}
          <hr />
          <MenuItem onClick={ this.openInUseradmin }>
            View in useradmin
          </MenuItem>
          { Boolean(device?.is_owner || (profile && profile.superuser)) && [
            <hr key="1" />,
            <ListItem key="2" className={ classes.switchListItem }>
              <SwitchLoading
                checked={ currentRoute?.is_public }
                onChange={ this.onPublicToggle }
                label="Public access"
                tooltip={publicTooltip}
              />
            </ListItem>,
            <ListItem key="3" className={ classes.switchListItem }>
              <SwitchLoading
                checked={ Boolean(routePreserved) }
                loading={ routePreserved === null }
                onChange={ this.onPreserveToggle }
                label="Preserved"
                tooltip={preservedTooltip}
              />
            </ListItem>,
          ] }
        </Menu>
        { !settingsDongleId && <UploadQueue
          open={ dialog === 'uploads' }
          onClose={ () => this.props.dispatch(closeDialog('downloads')) }
          update={ ['info', 'uploads', 'downloads'].includes(dialog) }
          store={ this.props.store }
          device={ device }
        /> }
        <Popper
          open={ Boolean(dcamUploadInfo) }
          placement="bottom"
          anchorEl={ dcamUploadInfo }
          className={ classes.dcameraUploadInfo }
        >
          <Typography>make sure to enable the &ldquo;Record and Upload Driver Camera&rdquo; toggle</Typography>
        </Popper>
      </>
    );
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
        <Button
          className={ classes.uploadButton }
          style={{ minWidth: uploadButtonWidth }}
          onClick={ () => this.downloadFile(file, type) }
        >
          download
        </Button>
      );
    } else if (file.progress !== undefined) {
      button = (
        <div className={ classes.fakeUploadButton } style={{ minWidth: (uploadButtonWidth - 24) }}>
          { file.current
            ? `${Math.floor(file.progress * 100)}%`
            : (file.paused ? 'paused' : 'pending') }
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
        <div
          className={ classes.fakeUploadButton }
          style={{ minWidth: (uploadButtonWidth - 24) }}
          onMouseEnter={ type === 'dcameras' ? (ev) => this.setState({ dcamUploadInfo: ev.target }) : null }
          onMouseLeave={ type === 'dcameras' ? () => this.setState({ dcamUploadInfo: null }) : null }
        >
          not found
          { type === 'dcameras' && <InfoOutline className={ classes.dcameraUploadIcon } /> }
        </div>
      );
    } else if (!canUpload) {
      button = (
        <Button className={ classes.uploadButton } style={{ minWidth: uploadButtonWidth }} disabled>
          download
        </Button>
      );
    } else {
      button = (
        <Button
          className={ classes.uploadButton }
          style={{ minWidth: uploadButtonWidth }}
          onClick={ () => this.uploadFile(type) }
        >
          { windowWidth < 425 ? 'upload' : 'request upload' }
        </Button>
      );
    }

    return (
      <MenuItem
        key={ type }
        disabled
        className={ classes.filesItem }
        style={ files ? { pointerEvents: 'auto' } : { color: Colors.white60 } }
      >
        { name }
        { button }
      </MenuItem>
    );
  }
}

const stateToProps = (state) => ({
  dialog: state.navigation?.dialog,
  settingsDongleId: state.navigation?.settingsDongleId,
  clipFilename: state.navigation?.clipFilename,
  dongleId: state.dongleId,
  device: state.device,
  routes: state.routes,
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  loop: state.loop,
  filter: state.filter,
  files: state.files,
  profile: state.profile,
  isBufferingVideo: state.isBufferingVideo,
});

export default connect(stateToProps)(withStyles(styles)(Media));

import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as Sentry from '@sentry/react';

import { withStyles, Typography, Menu, MenuItem, Button, IconButton, Popper, ListItem, Tooltip } from '@material-ui/core';

import { USERADMIN_URL_ROOT } from '../../api';
import { api } from '../../api/backend';
import { deviceSupportsClips } from '../../api/clips';

import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import TimeDisplay from '../TimeDisplay';
import Timeline from '../Timeline';
import PlayerBox from './PlayerBox';
import { subscribeWindowSize } from '../../hooks/window';
import UploadQueue from '../Files/UploadQueue';
import ClipMenu from './ClipMenu';
import SwitchLoading from '../utils/SwitchLoading';
import StepSpinner from '../utils/StepSpinner';
import Colors from '../../colors';
import { CollapseIcon, ContentCopy, DownloadIcon, ExpandIcon, InfoOutline, MoreVert, ShareIcon, WarningIcon } from '../../icons';
import { deviceIsOnline, deviceOnCellular, getSegmentNumber } from '../../utils';
import { stringifyQuery } from '../../utils/query';
import { analyticsEvent, updateRoute } from '../../actions';
import { fetchEvents } from '../../actions/cached';
import { attachRelTime } from '../../analytics';
import { setRouteViewed, fetchFiles, doUpload, fetchUploadUrls, fetchAthenaQueue, updateFiles, FILE_NAMES } from '../../actions/files';

const downloadIconButton = 'ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-200 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 motion-reduce:transition-none';
const publicTooltip = 'Making a route public allows anyone with the route name or link to access it.';
const preservedTooltip = 'Preserving a route will prevent it from being deleted. You can preserve up to 10 routes, or 100 if you have comma prime.';

// same highlight the clickable rows get, so every row in the menu answers the pointer
const rowHover = { transition: 'background-color 200ms', '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' } };

const styles = () => ({
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
    ...rowHover,
  },
  switchListItem: {
    ...rowHover,
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

class Media extends Component {
  constructor(props) {
    super(props);

    this.state = {
      expanded: false, // the map covers the video instead of floating in the corner
      windowWidth: window.innerWidth,
      moreMenu: null,
      clipMenu: null,
      uploadModal: false,
      dcamUploadInfo: null,
      routePreserved: null,
      isMuted: true,
      hasAudio: false,
      clipsSupported: false,
    };

    this.handleMuteToggle = this.handleMuteToggle.bind(this);
    this.handleAudioStatusChange = this.handleAudioStatusChange.bind(this);
    this.renderActions = this.renderActions.bind(this);
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
    this.prefetchedFor = null;
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
      // the window also reports height changes (iOS toolbars sliding in and out): those must not re-render the page
      if (width !== this.state.windowWidth) this.setState({ windowWidth: width });
    });
    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    const { moreMenu } = this.state;
    if (prevProps.dongleId !== this.props.dongleId) {
      this.setState({ clipsSupported: false, clipMenu: null });
      this.checkClipsSupport();
    } else if (!deviceIsOnline(prevProps.device) && deviceIsOnline(this.props.device)) {
      this.checkClipsSupport();
    }
    if (prevProps.currentRoute !== this.props.currentRoute && this.props.currentRoute) {
      this.props.dispatch(fetchEvents(this.props.currentRoute));
    }

    if (prevState.expanded !== this.state.expanded) {
      this.props.dispatch(analyticsEvent('media_switch_view', { in_view: this.state.expanded ? 'map' : 'video' }));
    }

    // load what the menu lists as soon as the drive opens, so the menu itself opens instantly
    const { currentRoute, device } = this.props;
    if (currentRoute && device && this.prefetchedFor !== currentRoute.fullname) {
      this.prefetchedFor = currentRoute.fullname;
      this.setState({ routePreserved: null });
      this.refreshMenuData(false);
    }
    // `files` is cleared when the zoom range changes: bring it back quietly
    if (currentRoute && prevProps.files && !this.props.files) {
      this.props.dispatch(fetchFiles(currentRoute.fullname));
    }
    // upload status can change while watching, refresh it on open (the old data stays visible meanwhile)
    if (currentRoute && !prevState.moreMenu && moreMenu) {
      this.refreshMenuData(true);
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

  refreshMenuData(withQueue) {
    const { dispatch, dongleId, currentRoute, device, profile } = this.props;
    if (withQueue && ((device && !device.shared) || profile?.superuser)) {
      dispatch(fetchAthenaQueue(dongleId));
    }
    dispatch(fetchFiles(currentRoute.fullname));
    if (device?.is_owner || profile?.superuser) {
      this.fetchRoutePreserved();
    }
  }

  async checkClipsSupport() {
    const { device, dongleId } = this.props;
    try {
      const clipsSupported = await deviceSupportsClips(device);
      if (this.mounted && dongleId === this.props.dongleId) this.setState({ clipsSupported });
    } catch (error) {
      // The button stays hidden when Athena is unavailable or too old.
    }
  }

  async copySegmentName() {
    const { currentRoute } = this.props;
    if (!currentRoute || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${currentRoute.fullname.replace('|', '/')}/${getSegmentNumber(currentRoute)}`);
    this.setState({ moreMenu: null });
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
    try {
      const resp = await api.routes.getPreservedRoutes(this.props.dongleId);
      if (resp && Array.isArray(resp) && this.props.currentRoute) {
        if (resp.find((r) => r.fullname === this.props.currentRoute.fullname)) {
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
    const { currentRoute, renderHeader } = this.props;
    const { expanded, isMuted, hasAudio, windowWidth } = this.state;

    if (this.props.menusOnly) { // for test
      return this.renderMenus(true);
    }

    // The map is a full-size layer that never resizes. Collapsed, it is a small window cut into that layer
    // (clip-path) and slid into the corner, so expanding is only a clip and a slide: no map resize or
    // redraw while it moves, and the map's text stays at full size.
    const mapLayer = expanded
      ? '[clip-path:inset(0%_0%_0%_0%_round_0px)]'
      : 'pointer-events-none translate-x-[calc(33%-12px)] translate-y-[calc(-33%+12px)] [clip-path:inset(33%_33%_33%_33%_round_12px)] md:translate-x-[calc(36%-12px)] md:translate-y-[calc(-36%+12px)] md:[clip-path:inset(36%_36%_36%_36%_round_12px)]';
    const toggle = () => this.setState((state) => ({ expanded: !state.expanded }));
    // a phone held upright puts the map under the video; on its side it behaves like a desktop, the map floating over the video
    const stacked = windowWidth < 768 && !window.matchMedia?.('(orientation: landscape)').matches;
    // the route's coordinates have loaded and there are none (e.g. no GPS fix)
    const noGps = Boolean(currentRoute?.driveCoords) && Object.keys(currentRoute.driveCoords).length === 0;

    return (
      <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-4">
        {renderHeader?.(this.renderActions())}
        <PlayerBox
          controls={(
            <div className="pointer-events-none bg-[linear-gradient(to_top,rgba(0,0,0,0.75),rgba(0,0,0,0.35)_55%,transparent)] px-3 pb-2 pt-12">
              <div className="pointer-events-auto">
                {currentRoute && <Timeline overlay hasRuler route={currentRoute} />}
                <TimeDisplay
                  isMuted={isMuted}
                  hasAudio={hasAudio}
                  onMuteToggle={this.handleMuteToggle}
                />
              </div>
            </div>
          )}
        >
          <div className="absolute inset-0 z-0">
            <DriveVideo
              isMuted={isMuted}
              onAudioStatusChange={this.handleAudioStatusChange}
            />
          </div>
          {!stacked && (
            <>
            <div className={`absolute inset-0 z-20 bg-black transition-[clip-path,translate] duration-[250ms] ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none ${mapLayer}`}>
              <DriveMap />
            </div>
            {noGps && (
              <div
                className={`pointer-events-none flex items-center justify-center bg-black/55 text-center text-white/80 ${expanded
                  ? 'absolute inset-0 z-[24] text-sm'
                  : 'absolute right-3 top-3 z-[24] h-[34%] w-[34%] rounded-xl px-1 text-[11px] leading-tight md:h-[28%] md:w-[28%]'}`}
              >
                {expanded ? 'No GPS data for this drive' : 'No GPS'}
              </div>
            )}
            {expanded ? (
              <button
                key="collapse"
                type="button"
                aria-label="Collapse map"
                onClick={toggle}
                className="absolute right-3 top-3 z-[25] flex h-9 w-9 items-center justify-center rounded-full bg-glass-dark text-white transition-[opacity,background-color] delay-100 duration-200 ease-out hover:bg-black/60 starting:opacity-0 motion-reduce:transition-none before:absolute before:left-1/2 before:top-1/2 before:h-[44px] before:w-[44px] before:-translate-x-1/2 before:-translate-y-1/2"
              >
                <CollapseIcon className="h-5 w-5" />
              </button>
            ) : (
              <div
                key="tile"
                role="presentation"
                className="absolute right-3 top-3 z-[25] h-[34%] w-[34%] cursor-pointer rounded-xl shadow-2xl ring-1 ring-white/30 transition-opacity delay-100 duration-200 ease-out starting:opacity-0 motion-reduce:transition-none md:h-[28%] md:w-[28%]"
                onClick={toggle}
              >
                <button
                  type="button"
                  aria-label="Expand map"
                  className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-glass-dark text-white transition-colors duration-200 hover:bg-black/60 motion-reduce:transition-none"
                >
                  <ExpandIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            </>
          )}
        </PlayerBox>
        {stacked && (
          // phones: the map gets the space under the video instead of floating over it
          <div className="relative aspect-[1.593] w-full overflow-hidden rounded-xl bg-black">
            <DriveMap />
            {noGps && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-center text-sm text-white/80">
                No GPS data for this drive
              </div>
            )}
          </div>
        )}
        {this.renderMenus()}
      </div>
    );
  }

  renderActions() {
    const { device } = this.props;
    const { clipsSupported } = this.state;
    const online = deviceIsOnline(device);
    return (
      <div className="flex shrink-0 items-center gap-1">
        {clipsSupported && (
          <Tooltip title={online ? '' : 'Device offline'} placement="top">
            <span>
              <button
                type="button"
                disabled={!online}
                aria-haspopup="true"
                className="h-9 rounded-full bg-white/10 px-4 text-sm font-medium text-white cursor-pointer transition-colors duration-200 hover:bg-white/20 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-white/10 motion-reduce:transition-none"
                onClick={(ev) => this.setState({ clipMenu: ev.currentTarget })}
              >
                Clip
              </button>
            </span>
          </Tooltip>
        )}
        <IconButton
          aria-label="More options"
          aria-haspopup="true"
          onClick={(ev) => this.setState({ moreMenu: ev.currentTarget })}
        >
          <MoreVert />
        </IconButton>
      </div>
    );
  }

  renderMenus(alwaysOpen = false) {
    const { currentRoute, device, classes, files, profile } = this.props;
    const { moreMenu, clipMenu, uploadModal, windowWidth, dcamUploadInfo, routePreserved } = this.state;

    if (!device) {
      return null;
    }

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
          open={Boolean(alwaysOpen || clipMenu)}
          dongleId={this.props.dongleId}
          anchorEl={clipMenu}
          onClose={() => this.setState({ clipMenu: null })}
          route={currentRoute}
          routes={this.props.routes}
          zoom={this.props.zoom}
          deviceOnline={deviceIsOnline(device)}
        />
        <Menu
          id="menu-more"
          open={ Boolean(alwaysOpen || moreMenu) }
          anchorEl={ moreMenu }
          onClose={ () => this.setState({ moreMenu: null }) }
          getContentAnchorEl={ null }
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ style: { maxHeight: 'calc(100svh - 120px)' } }}
        >
          { !files
          && (
          <div className={ classes.menuLoading }>
            <StepSpinner label="Loading files" className="h-9 w-9" />
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
                : (stats.isUploadingRlog ? 'pending' : <StepSpinner label="Uploading" className="h-[17px] w-[17px]" />)}
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
                : (stats.isUploadingAll ? 'pending' : <StepSpinner label="Uploading" className="h-[17px] w-[17px]" />)}
            </div>
            )}
          </MenuItem>
          <hr />
          { deviceIsOnline(device) || !files ? (
            <MenuItem
              onClick={ files ? () => this.setState({ uploadModal: true, moreMenu: null }) : null }
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
          <hr />
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
        <UploadQueue
          open={ uploadModal }
          onClose={ () => this.setState({ uploadModal: false }) }
          update={ Boolean(moreMenu || uploadModal) }
          store={ this.props.store }
          device={ device }
        />
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
        <button
          type="button"
          className={ downloadIconButton }
          aria-label={`Download ${name}`}
          title={`Download ${name}`}
          onClick={ () => this.downloadFile(file, type) }
        >
          <DownloadIcon className="h-5 w-5" />
        </button>
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
          <StepSpinner label="Requested" className="h-[17px] w-[17px]" />
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
        <button type="button" className={ downloadIconButton } aria-label={`Download ${name}`} disabled>
          <DownloadIcon className="h-5 w-5" />
        </button>
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
  dongleId: state.dongleId,
  device: state.device,
  routes: state.routes,
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  loop: state.loop,
  filter: state.filter,
  files: state.files,
  profile: state.profile,
});

export default connect(stateToProps)(withStyles(styles)(Media));

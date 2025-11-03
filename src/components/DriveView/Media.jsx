import { drives as Drives } from '@commaai/api';
import { Button, CircularProgress, Divider, ListItem, Menu, MenuItem, Popper, Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import WarningIcon from '@mui/icons-material/Warning';
import * as Sentry from '@sentry/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateRoute } from '../../actions';
import { fetchEvents } from '../../actions/cached';
import { doUpload, FILE_NAMES, fetchAthenaQueue, fetchFiles, fetchUploadUrls, setRouteViewed, updateFiles } from '../../actions/files';
import Colors from '../../colors';
import { InfoOutline } from '../../icons';
import { selectCurrentRoute } from '../../selectors/route';
import { bufferVideo } from '../../timeline/playback';
import { deviceIsOnline, deviceOnCellular, getSegmentNumber } from '../../utils';
import DriveMap from '../DriveMap';
import DriveVideo from '../DriveVideo';
import UploadQueue from '../Files/UploadQueue';
import ResizeHandler from '../ResizeHandler';
import TimeDisplay from '../TimeDisplay';
import SwitchLoading from '../utils/SwitchLoading';

const publicTooltip = 'Making a route public allows anyone with the route name or link to access it.';
const preservedTooltip = 'Preserving a route will prevent it from being deleted. You can preserve up to 10 routes, or 100 if you have comma prime.';

const styles = () => ({
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

const Media = ({ classes, menusOnly }) => {
  // Redux state
  const dispatch = useDispatch();
  const dongleId = useSelector((state) => state.dongleId);
  const device = useSelector((state) => state.device);
  const currentRoute = useSelector(selectCurrentRoute);
  const loop = useSelector((state) => state.loop);
  const files = useSelector((state) => state.files);
  const profile = useSelector((state) => state.profile);
  const isBufferingVideo = useSelector((state) => state.isBufferingVideo);

  // State
  const [inView, setInView] = useState(MediaType.VIDEO);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [downloadMenu, setDownloadMenu] = useState(null);
  const [moreInfoMenu, setMoreInfoMenu] = useState(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [dcamUploadInfo, setDcamUploadInfo] = useState(null);
  const [routePreserved, setRoutePreserved] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [hasAudio, setHasAudio] = useState(false);

  // Refs
  const routeViewed = useRef(false);
  const prevCurrentRoute = useRef(null);

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
  };

  const handleAudioStatusChange = (audio) => {
    setHasAudio(audio);
  };

  const copySegmentName = async () => {
    if (!currentRoute || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(`${currentRoute.fullname.replace('|', '/')}/${getSegmentNumber(currentRoute)}`);
    setMoreInfoMenu(null);
  };

  const openInUseradmin = () => {
    if (!currentRoute) {
      return;
    }

    const params = { onebox: currentRoute.fullname };
    const win = window.open(`${window.USERADMIN_URL_ROOT}?${new URLSearchParams(params).toString()}`, '_blank');
    if (win.focus) {
      win.focus();
    }
  };

  const shareCurrentRoute = async () => {
    try {
      await navigator.share({
        title: 'comma connect',
        url: window.location.href,
      });
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_navigator_share' });
    }
  };

  const uploadFile = async (type) => {
    if (!currentRoute) {
      return;
    }

    const routeNoDongleId = currentRoute.fullname.split('|')[1];
    const fileName = `${dongleId}|${routeNoDongleId}--${getSegmentNumber(currentRoute)}/${type}`;

    const uploading = {};
    uploading[fileName] = { requested: true };
    dispatch(updateFiles(uploading));

    const paths = [];
    const url_promises = [];

    // request all possible file names
    for (const fn of FILE_NAMES[type]) {
      const path = `${routeNoDongleId}--${getSegmentNumber(currentRoute)}/${fn}`;
      paths.push(path);
      url_promises.push(fetchUploadUrls(dongleId, [path]).then((urls) => urls[0]));
    }

    const urls = await Promise.all(url_promises);
    if (urls) {
      dispatch(doUpload(dongleId, paths, urls));
    }
  };

  const uploadFilesAll = async (types) => {
    if (types === undefined) {
      types = ['logs', 'cameras', 'dcameras', 'ecameras'];
    }

    if (!currentRoute || !files) {
      return;
    }

    const uploading = {};
    const adjusted_start_time = currentRoute.start_time_utc_millis + loop.startTime;
    for (let i = 0; i < currentRoute.segment_numbers.length; i++) {
      if (currentRoute.segment_start_times[i] < adjusted_start_time + loop.duration && currentRoute.segment_end_times[i] > adjusted_start_time) {
        types.forEach((type) => {
          const fileName = `${currentRoute.fullname}--${currentRoute.segment_numbers[i]}/${type}`;
          if (!files[fileName]) {
            uploading[fileName] = { requested: true };
          }
        });
      }
    }
    dispatch(updateFiles(uploading));

    const paths = Object.keys(uploading).flatMap((fileName) => {
      const [seg, type] = fileName.split('/');
      return FILE_NAMES[type].map((file) => `${seg.split('|')[1]}/${file}`);
    });

    const urls = await fetchUploadUrls(dongleId, paths);
    if (urls) {
      dispatch(doUpload(dongleId, paths, urls));
    }
  };

  const _uploadStats = useCallback(
    (types, count, uploaded, uploading, paused, requested) => {
      if (!currentRoute || !files) {
        return [count, uploaded, uploading, paused, requested];
      }

      const adjusted_start_time = currentRoute.start_time_utc_millis + loop.startTime;

      for (let i = 0; i < currentRoute.segment_numbers.length; i++) {
        if (currentRoute.segment_start_times[i] < adjusted_start_time + loop.duration && currentRoute.segment_end_times[i] > adjusted_start_time) {
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
    },
    [currentRoute, loop, files],
  );

  const getUploadStats = useCallback(() => {
    if (!files || !currentRoute) {
      return null;
    }
    const [countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog] = _uploadStats(['logs'], 0, 0, 0, 0, 0);

    const camTypes = ['cameras', 'dcameras', 'ecameras'];
    const [countAll, uploadedAll, uploadingAll, pausedAll, requestedAll] = _uploadStats(camTypes, countRlog, uploadedRlog, uploadingRlog, pausedRlog, requestedRlog);

    return {
      canRequestAll: countAll - uploadedAll - uploadingAll - requestedAll,
      canRequestRlog: countRlog - uploadedRlog - uploadingRlog - requestedRlog,
      isUploadingAll: !(countAll - uploadedAll - uploadingAll),
      isUploadingRlog: !(countRlog - uploadedRlog - uploadingRlog),
      isUploadedAll: !(countAll - uploadedAll),
      isUploadedRlog: !(countRlog - uploadedRlog),
      isPausedAll: Boolean(pausedAll > 0 && pausedAll === uploadingAll),
    };
  }, [files, currentRoute, _uploadStats]);

  const downloadFile = (file, type) => {
    window.location.href = file.url;
  };

  const onPublicToggle = async (ev) => {
    const isPublic = ev.target.checked;
    try {
      const resp = await Drives.setRoutePublic(currentRoute.fullname, isPublic);
      if (resp && resp.fullname === currentRoute.fullname) {
        dispatch(updateRoute(currentRoute.fullname, { is_public: resp.is_public }));
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
  };

  const fetchRoutePreserved = useCallback(async () => {
    try {
      const resp = await Drives.getPreservedRoutes(dongleId);
      if (resp && Array.isArray(resp) && currentRoute) {
        if (resp.find((r) => r.fullname === currentRoute.fullname)) {
          setRoutePreserved(true);
          return;
        }
        setRoutePreserved(false);
      }
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_fetch_preserved' });
    }
  }, [dongleId, currentRoute]);

  const onPreserveToggle = async (ev) => {
    const preserved = ev.target.checked;
    try {
      const resp = await Drives.setRoutePreserved(currentRoute.fullname, preserved);
      if (resp && resp.success) {
        setRoutePreserved(preserved);
        return null;
      }
      fetchRoutePreserved();
      return { error: 'unable to update' };
    } catch (err) {
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'media_toggle_preserved' });
      fetchRoutePreserved();
      return { error: 'could not update' };
    }
  };

  const renderUploadMenuItem = ([file, name, type]) => {
    const canUpload = device.is_owner || (profile && profile.superuser);
    const uploadButtonWidth = windowWidth < 425 ? 80 : 120;

    let button;
    if (!files) {
      button = null;
    } else if (file.url) {
      button = (
        <Button className={classes.uploadButton} style={{ minWidth: uploadButtonWidth }} onClick={() => downloadFile(file, type)}>
          download
        </Button>
      );
    } else if (file.progress !== undefined) {
      button = (
        <div className={classes.fakeUploadButton} style={{ minWidth: uploadButtonWidth - 24 }}>
          {file.current ? `${Math.floor(file.progress * 100)}%` : file.paused ? 'paused' : 'pending'}
        </div>
      );
    } else if (file.requested) {
      button = (
        <div className={classes.fakeUploadButton} style={{ minWidth: uploadButtonWidth - 24 }}>
          <CircularProgress style={{ color: Colors.white }} size={17} />
        </div>
      );
    } else if (file.notFound) {
      button = (
        <div
          className={classes.fakeUploadButton}
          style={{ minWidth: uploadButtonWidth - 24 }}
          onMouseEnter={type === 'dcameras' ? (ev) => setDcamUploadInfo(ev.target) : null}
          onMouseLeave={type === 'dcameras' ? () => setDcamUploadInfo(null) : null}
        >
          not found
          {type === 'dcameras' && <InfoOutline className={classes.dcameraUploadIcon} />}
        </div>
      );
    } else if (!canUpload) {
      button = (
        <Button className={classes.uploadButton} style={{ minWidth: uploadButtonWidth }} disabled>
          download
        </Button>
      );
    } else {
      button = (
        <Button className={classes.uploadButton} style={{ minWidth: uploadButtonWidth }} onClick={() => uploadFile(type)}>
          {windowWidth < 425 ? 'upload' : 'request upload'}
        </Button>
      );
    }

    return (
      <MenuItem key={type} disabled className={classes.filesItem} style={files ? { pointerEvents: 'auto' } : { color: Colors.white60 }}>
        {name}
        {button}
      </MenuItem>
    );
  };

  const renderMenus = (alwaysOpen = false) => {
    if (!device) {
      return null;
    }

    let fcam = {};
    let ecam = {};
    let dcam = {};
    let rlog = {};
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

    const stats = getUploadStats();
    const rlogUploadDisabled = !stats || stats.isUploadedRlog || stats.isUploadingRlog || !stats.canRequestRlog;
    const allUploadDisabled = !stats || stats.isUploadedAll || stats.isUploadingAll || !stats.canRequestAll;

    return (
      <>
        <Menu
          id="menu-download"
          open={Boolean(alwaysOpen || downloadMenu)}
          anchorEl={downloadMenu}
          onClose={() => setDownloadMenu(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {!files && (
            <div className={classes.menuLoading}>
              <CircularProgress size={36} style={{ color: Colors.white }} />
            </div>
          )}
          {buttons.filter((b) => Boolean(b)).map(renderUploadMenuItem)}
          <Divider />
          <MenuItem className={classes.filesItem} disabled style={files && stats ? { pointerEvents: 'auto' } : { color: Colors.white60 }}>
            All logs
            {Boolean(files && canUpload && !rlogUploadDisabled) && (
              <Button className={classes.uploadButton} style={{ minWidth: uploadButtonWidth }} onClick={() => uploadFilesAll(['logs'])}>
                {`upload ${stats.canRequestRlog} logs`}
              </Button>
            )}
            {Boolean(canUpload && rlogUploadDisabled && stats) && (
              <div className={classes.fakeUploadButton} style={{ minWidth: uploadButtonWidth - 24 }}>
                {stats.isUploadedRlog ? 'uploaded' : stats.isUploadingRlog ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={17} />}
              </div>
            )}
          </MenuItem>
          <MenuItem className={classes.filesItem} disabled style={files && stats ? { pointerEvents: 'auto' } : { color: Colors.white60 }}>
            All files
            {Boolean(files && canUpload && !allUploadDisabled) && (
              <Button className={classes.uploadButton} style={{ minWidth: uploadButtonWidth }} onClick={() => uploadFilesAll()}>
                {`upload ${stats.canRequestAll} files`}
              </Button>
            )}
            {Boolean(canUpload && allUploadDisabled && stats) && (
              <div className={classes.fakeUploadButton} style={{ minWidth: uploadButtonWidth - 24 }}>
                {stats.isUploadedAll ? 'uploaded' : stats.isUploadingAll ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={17} />}
              </div>
            )}
          </MenuItem>
          <Divider />
          {deviceIsOnline(device) || !files ? (
            <MenuItem
              onClick={
                files
                  ? () => {
                      setUploadModal(true);
                      setDownloadMenu(null);
                    }
                  : null
              }
              style={files ? { pointerEvents: 'auto' } : { color: Colors.white60 }}
              className={classes.filesItem}
              disabled={!files}
            >
              View upload queue
            </MenuItem>
          ) : (
            <MenuItem className={classes.offlineMenuItem} disabled>
              <div>
                <WarningIcon />
                Device offline
              </div>
              <span style={{ fontSize: '0.8rem' }}>uploading will resume when device is online</span>
            </MenuItem>
          )}
          {stats && stats.isPausedAll && deviceOnCellular(device) && (
            <MenuItem className={classes.offlineMenuItem} disabled>
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
          open={Boolean(alwaysOpen || moreInfoMenu)}
          anchorEl={moreInfoMenu}
          onClose={() => setMoreInfoMenu(null)}
          transformOrigin={{ vertical: 'top', horizontal: windowWidth > 400 ? 260 : 300 }}
        >
          <MenuItem className={classes.copySegment} onClick={copySegmentName} style={{ fontSize: windowWidth > 400 ? '0.8rem' : '0.7rem' }}>
            <div>{currentRoute ? `${currentRoute.fullname.replace('|', '/')}/${getSegmentNumber(currentRoute)}` : '---'}</div>
            <ContentCopyIcon />
          </MenuItem>
          {typeof navigator.share !== 'undefined' && (
            <MenuItem onClick={shareCurrentRoute} className={classes.shareButton}>
              Share this route
              <ShareIcon />
            </MenuItem>
          )}
          <Divider />
          <MenuItem onClick={openInUseradmin}>View in useradmin</MenuItem>
          {Boolean(device?.is_owner || (profile && profile.superuser)) && [
            <Divider key="1" />,
            <ListItem key="2" className={classes.switchListItem}>
              <SwitchLoading checked={currentRoute?.is_public} onChange={onPublicToggle} label="Public access" tooltip={publicTooltip} />
            </ListItem>,
            <ListItem key="3" className={classes.switchListItem}>
              <SwitchLoading checked={Boolean(routePreserved)} loading={routePreserved === null} onChange={onPreserveToggle} label="Preserved" tooltip={preservedTooltip} />
            </ListItem>,
          ]}
        </Menu>
        <UploadQueue open={uploadModal} onClose={() => setUploadModal(false)} update={Boolean(moreInfoMenu || uploadModal || downloadMenu)} device={device} />
        <Popper open={Boolean(dcamUploadInfo)} placement="bottom" anchorEl={dcamUploadInfo} className={classes.dcameraUploadInfo}>
          <Typography>make sure to enable the &ldquo;Record and Upload Driver Camera&rdquo; toggle</Typography>
        </Popper>
      </>
    );
  };

  const renderMediaOptions = (showMapAlways) => {
    return (
      <>
        <div className={classes.mediaOptionsRoot}>
          {showMapAlways ? (
            <div />
          ) : (
            <div className={classes.mediaOptions}>
              <div className={classes.mediaOption} style={inView !== MediaType.VIDEO ? { opacity: 0.6 } : {}} onClick={() => setInView(MediaType.VIDEO)}>
                <Typography className={classes.mediaOptionText}>Video</Typography>
              </div>
              <div className={classes.mediaOption} style={inView !== MediaType.MAP ? { opacity: 0.6 } : {}} onClick={() => setInView(MediaType.MAP)}>
                <Typography className={classes.mediaOptionText}>Map</Typography>
              </div>
            </div>
          )}
          <div className={classes.mediaOptions}>
            <div className={classes.mediaOption} aria-haspopup="true" onClick={(ev) => setDownloadMenu(ev.target)}>
              <Typography className={classes.mediaOptionText}>Files</Typography>
            </div>
            <div className={classes.mediaOption} aria-haspopup="true" onClick={(ev) => setMoreInfoMenu(ev.target)}>
              <Typography className={classes.mediaOptionText}>More info</Typography>
            </div>
          </div>
        </div>
        {renderMenus()}
      </>
    );
  };

  // Reset inView to VIDEO when showMapAlways and inView is MAP
  useEffect(() => {
    const showMapAlways = windowWidth >= 1536;
    if (showMapAlways && inView === MediaType.MAP) {
      setInView(MediaType.VIDEO);
    }
  }, [windowWidth, inView]);

  // Stop buffering when not showMapAlways and inView is MAP
  useEffect(() => {
    const showMapAlways = windowWidth >= 1536;
    if (!showMapAlways && inView === MediaType.MAP && isBufferingVideo) {
      dispatch(bufferVideo(false));
    }
  }, [windowWidth, inView, isBufferingVideo, dispatch]);

  // Fetch events when currentRoute changes
  useEffect(() => {
    if (currentRoute && prevCurrentRoute.current !== currentRoute) {
      dispatch(fetchEvents(currentRoute));
      prevCurrentRoute.current = currentRoute;
    }
  }, [currentRoute, dispatch]);

  // Fetch files when certain menu conditions are met
  useEffect(() => {
    if (currentRoute && (downloadMenu || moreInfoMenu)) {
      if ((device && !device.shared) || profile?.superuser) {
        dispatch(fetchAthenaQueue(dongleId));
      }
      dispatch(fetchFiles(currentRoute.fullname));
    }
  }, [currentRoute, downloadMenu, moreInfoMenu, device, profile, dongleId, dispatch]);

  // Fetch route preserved status
  useEffect(() => {
    if (routePreserved === null && (device?.is_owner || profile?.superuser) && moreInfoMenu && currentRoute) {
      fetchRoutePreserved();
    }
  }, [routePreserved, device, profile, moreInfoMenu, currentRoute, fetchRoutePreserved]);

  // Set route viewed once
  useEffect(() => {
    if (!routeViewed.current && currentRoute && ((device && !device.shared) || profile?.superuser)) {
      dispatch(setRouteViewed(dongleId, currentRoute.fullname));
      routeViewed.current = true;
    }
  }, [currentRoute, device, profile, dongleId, dispatch]);

  if (menusOnly) {
    // for test
    return renderMenus(true);
  }

  const showMapAlways = windowWidth >= 1536;
  const mediaContainerStyle = showMapAlways ? { width: '60%' } : { width: '100%' };
  const mapContainerStyle = showMapAlways ? { width: '40%', marginBottom: 62, marginTop: 46, paddingLeft: 24 } : { width: '100%' };

  return (
    <div className={classes.root}>
      <ResizeHandler onResize={(ww) => setWindowWidth(ww)} />
      <div style={mediaContainerStyle}>
        {renderMediaOptions(showMapAlways)}
        {inView === MediaType.VIDEO && <DriveVideo isMuted={isMuted} onAudioStatusChange={handleAudioStatusChange} />}
        {inView === MediaType.MAP && !showMapAlways && (
          <div style={mapContainerStyle}>
            <DriveMap />
          </div>
        )}
        <div className="mt-3">
          <TimeDisplay isThin isMuted={isMuted} hasAudio={hasAudio} onMuteToggle={handleMuteToggle} />
        </div>
      </div>
      {inView === MediaType.VIDEO && showMapAlways && (
        <div style={mapContainerStyle}>
          <DriveMap />
        </div>
      )}
    </div>
  );
};

export default withStyles(styles)(Media);

import { drives as Drives } from '@commaai/api';
import { Box, Button, CircularProgress, Divider, ListItem, Menu, MenuItem, Popper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
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

const Root = styled(Box)({
  display: 'flex',
});

const MediaOptionsRoot = styled(Box)({
  maxWidth: 964,
  margin: '0 auto',
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
});

const MediaOptions = styled(Box)({
  marginBottom: 12,
  display: 'flex',
  width: 'max-content',
  alignItems: 'center',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 50,
});

const MediaOption = styled(Box)({
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
});

const MediaOptionText = styled(Typography)({
  fontSize: 12,
  fontWeight: 500,
  textAlign: 'center',
});

const MenuLoading = styled(Box)({
  position: 'absolute',
  outline: 'none',
  zIndex: 5,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
});

const FilesItem = styled(MenuItem)({
  justifyContent: 'space-between',
  opacity: 1,
});

const SwitchListItem = styled(ListItem)({
  padding: '12px 16px',
  boxSizing: 'content-box',
  height: 24,
  lineHeight: 1,
  '& span': { fontSize: '1rem' },
});

const OfflineMenuItem = styled(MenuItem)({
  height: 'unset',
  flexDirection: 'column',
  alignItems: 'flex-start',
  '& div': {
    display: 'flex',
  },
  '& svg': { marginRight: 8 },
});

const UploadButton = styled(Button)({
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
});

const FakeUploadButton = styled(Box)({
  marginLeft: 12,
  color: Colors.white,
  fontSize: '0.8rem',
  padding: '4px 12px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

const CopySegment = styled(MenuItem)({
  pointerEvents: 'auto',
  opacity: 1,
  '& div': {
    whiteSpace: 'normal',
    padding: '0 6px',
    borderRadius: 4,
    backgroundColor: Colors.white08,
    marginRight: 4,
  },
});

const ShareButton = styled(MenuItem)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const DcameraUploadIcon = styled(InfoOutline)({
  fontSize: '1rem',
  marginLeft: 4,
});

const DcameraUploadInfo = styled(Popper)({
  zIndex: 2000,
  textAlign: 'center',
  borderRadius: 14,
  fontSize: '0.8em',
  padding: '6px 8px',
  border: `1px solid ${Colors.white10}`,
  backgroundColor: Colors.grey800,
  color: Colors.white,
  '& p': { fontSize: '0.8rem' },
});

const MediaType = {
  VIDEO: 'video',
  MAP: 'map',
};

const Media = ({ menusOnly }) => {
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
        <UploadButton sx={{ minWidth: uploadButtonWidth }} onClick={() => downloadFile(file, type)}>
          download
        </UploadButton>
      );
    } else if (file.progress !== undefined) {
      button = (
        <FakeUploadButton sx={{ minWidth: uploadButtonWidth - 24 }}>{file.current ? `${Math.floor(file.progress * 100)}%` : file.paused ? 'paused' : 'pending'}</FakeUploadButton>
      );
    } else if (file.requested) {
      button = (
        <FakeUploadButton sx={{ minWidth: uploadButtonWidth - 24 }}>
          <CircularProgress style={{ color: Colors.white }} size={17} />
        </FakeUploadButton>
      );
    } else if (file.notFound) {
      button = (
        <FakeUploadButton
          sx={{ minWidth: uploadButtonWidth - 24 }}
          onMouseEnter={type === 'dcameras' ? (ev) => setDcamUploadInfo(ev.target) : null}
          onMouseLeave={type === 'dcameras' ? () => setDcamUploadInfo(null) : null}
        >
          not found
          {type === 'dcameras' && <DcameraUploadIcon />}
        </FakeUploadButton>
      );
    } else if (!canUpload) {
      button = (
        <UploadButton sx={{ minWidth: uploadButtonWidth }} disabled>
          download
        </UploadButton>
      );
    } else {
      button = (
        <UploadButton sx={{ minWidth: uploadButtonWidth }} onClick={() => uploadFile(type)}>
          {windowWidth < 425 ? 'upload' : 'request upload'}
        </UploadButton>
      );
    }

    return (
      <FilesItem key={type} disabled sx={files ? { pointerEvents: 'auto' } : { color: Colors.white60 }}>
        {name}
        {button}
      </FilesItem>
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
            <MenuLoading>
              <CircularProgress size={36} style={{ color: Colors.white }} />
            </MenuLoading>
          )}
          {buttons.filter((b) => Boolean(b)).map(renderUploadMenuItem)}
          <Divider />
          <FilesItem disabled sx={files && stats ? { pointerEvents: 'auto' } : { color: Colors.white60 }}>
            All logs
            {Boolean(files && canUpload && !rlogUploadDisabled) && (
              <UploadButton sx={{ minWidth: uploadButtonWidth }} onClick={() => uploadFilesAll(['logs'])}>
                {`upload ${stats.canRequestRlog} logs`}
              </UploadButton>
            )}
            {Boolean(canUpload && rlogUploadDisabled && stats) && (
              <FakeUploadButton sx={{ minWidth: uploadButtonWidth - 24 }}>
                {stats.isUploadedRlog ? 'uploaded' : stats.isUploadingRlog ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={17} />}
              </FakeUploadButton>
            )}
          </FilesItem>
          <FilesItem disabled sx={files && stats ? { pointerEvents: 'auto' } : { color: Colors.white60 }}>
            All files
            {Boolean(files && canUpload && !allUploadDisabled) && (
              <UploadButton sx={{ minWidth: uploadButtonWidth }} onClick={() => uploadFilesAll()}>
                {`upload ${stats.canRequestAll} files`}
              </UploadButton>
            )}
            {Boolean(canUpload && allUploadDisabled && stats) && (
              <FakeUploadButton sx={{ minWidth: uploadButtonWidth - 24 }}>
                {stats.isUploadedAll ? 'uploaded' : stats.isUploadingAll ? 'pending' : <CircularProgress style={{ color: Colors.white }} size={17} />}
              </FakeUploadButton>
            )}
          </FilesItem>
          <Divider />
          {deviceIsOnline(device) || !files ? (
            <FilesItem
              onClick={
                files
                  ? () => {
                      setUploadModal(true);
                      setDownloadMenu(null);
                    }
                  : null
              }
              sx={files ? { pointerEvents: 'auto' } : { color: Colors.white60 }}
              disabled={!files}
            >
              View upload queue
            </FilesItem>
          ) : (
            <OfflineMenuItem disabled>
              <div>
                <WarningIcon />
                Device offline
              </div>
              <span style={{ fontSize: '0.8rem' }}>uploading will resume when device is online</span>
            </OfflineMenuItem>
          )}
          {stats && stats.isPausedAll && deviceOnCellular(device) && (
            <OfflineMenuItem disabled>
              <div>
                <WarningIcon />
                Connect to WiFi
              </div>
              <span style={{ fontSize: '0.8rem' }}>uploading paused on cellular connection</span>
            </OfflineMenuItem>
          )}
        </Menu>
        <Menu
          id="menu-info"
          open={Boolean(alwaysOpen || moreInfoMenu)}
          anchorEl={moreInfoMenu}
          onClose={() => setMoreInfoMenu(null)}
          transformOrigin={{ vertical: 'top', horizontal: windowWidth > 400 ? 260 : 300 }}
        >
          <CopySegment onClick={copySegmentName} sx={{ fontSize: windowWidth > 400 ? '0.8rem' : '0.7rem' }}>
            <div>{currentRoute ? `${currentRoute.fullname.replace('|', '/')}/${getSegmentNumber(currentRoute)}` : '---'}</div>
            <ContentCopyIcon />
          </CopySegment>
          {typeof navigator.share !== 'undefined' && (
            <ShareButton onClick={shareCurrentRoute}>
              Share this route
              <ShareIcon />
            </ShareButton>
          )}
          <Divider />
          <MenuItem onClick={openInUseradmin}>View in useradmin</MenuItem>
          {Boolean(device?.is_owner || (profile && profile.superuser)) && [
            <Divider key="1" />,
            <SwitchListItem key="2">
              <SwitchLoading checked={currentRoute?.is_public} onChange={onPublicToggle} label="Public access" tooltip={publicTooltip} />
            </SwitchListItem>,
            <SwitchListItem key="3">
              <SwitchLoading checked={Boolean(routePreserved)} loading={routePreserved === null} onChange={onPreserveToggle} label="Preserved" tooltip={preservedTooltip} />
            </SwitchListItem>,
          ]}
        </Menu>
        <UploadQueue open={uploadModal} onClose={() => setUploadModal(false)} update={Boolean(moreInfoMenu || uploadModal || downloadMenu)} device={device} />
        <DcameraUploadInfo open={Boolean(dcamUploadInfo)} placement="bottom" anchorEl={dcamUploadInfo}>
          <Typography>make sure to enable the &ldquo;Record and Upload Driver Camera&rdquo; toggle</Typography>
        </DcameraUploadInfo>
      </>
    );
  };

  const renderMediaOptions = (showMapAlways) => {
    return (
      <>
        <MediaOptionsRoot>
          {showMapAlways ? (
            <Box />
          ) : (
            <MediaOptions>
              <MediaOption sx={inView !== MediaType.VIDEO ? { opacity: 0.6 } : {}} onClick={() => setInView(MediaType.VIDEO)}>
                <MediaOptionText>Video</MediaOptionText>
              </MediaOption>
              <MediaOption sx={inView !== MediaType.MAP ? { opacity: 0.6 } : {}} onClick={() => setInView(MediaType.MAP)}>
                <MediaOptionText>Map</MediaOptionText>
              </MediaOption>
            </MediaOptions>
          )}
          <MediaOptions>
            <MediaOption aria-haspopup="true" onClick={(ev) => setDownloadMenu(ev.target)}>
              <MediaOptionText>Files</MediaOptionText>
            </MediaOption>
            <MediaOption aria-haspopup="true" onClick={(ev) => setMoreInfoMenu(ev.target)}>
              <MediaOptionText>More info</MediaOptionText>
            </MediaOption>
          </MediaOptions>
        </MediaOptionsRoot>
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
    <Root>
      <ResizeHandler onResize={(ww) => setWindowWidth(ww)} />
      <Box sx={mediaContainerStyle}>
        {renderMediaOptions(showMapAlways)}
        {inView === MediaType.VIDEO && <DriveVideo isMuted={isMuted} onAudioStatusChange={handleAudioStatusChange} />}
        {inView === MediaType.MAP && !showMapAlways && (
          <Box sx={mapContainerStyle}>
            <DriveMap />
          </Box>
        )}
        <Box className="mt-3">
          <TimeDisplay isThin isMuted={isMuted} hasAudio={hasAudio} onMuteToggle={handleMuteToggle} />
        </Box>
      </Box>
      {inView === MediaType.VIDEO && showMapAlways && (
        <Box sx={mapContainerStyle}>
          <DriveMap />
        </Box>
      )}
    </Root>
  );
};

export default Media;

import React, { Component } from 'react';
import {
  Button, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, IconButton, LinearProgress, Menu, Typography, withStyles,
} from '@material-ui/core';

import Colors from '../../colors';
import { clipDevice } from '../../api/clips';
import { CloseBold, Download as DownloadIcon, PlayArrow } from '../../icons';

const MAX_CLIP_DURATION = 30 * 60;
const POLL_INTERVAL = 1000;
const ACTIVE_STATUSES = new Set(['queued', 'encoding']);

const CAMERAS = [
  ['fcamera', 'Road', 'Road camera'],
  ['ecamera', 'Wide road', 'Wide road camera'],
  ['dcamera', 'Driver', 'Driver camera'],
];

const BITRATES = [
  [5, 'Standard', '5 Mbps'],
  [8, 'High', '8 Mbps'],
  [12, 'Extreme', '12 Mbps'],
];

const SPEEDUPS = [1, 2, 5, 10];

const styles = () => ({
  paper: { width: 360, maxWidth: 'calc(100vw - 24px)', outline: 'none' },
  body: { outline: 'none', padding: 16, '&:focus': { outline: 'none' } },
  header: { fontSize: 16, fontWeight: 500, marginBottom: 4 },
  supporting: { color: Colors.white60, fontSize: 12, lineHeight: 1.4 },
  range: {
    background: Colors.white05, borderRadius: 8, margin: '14px 0', padding: '10px 12px',
  },
  rangeValue: { fontSize: 15, fontWeight: 500 },
  field: { marginTop: 14 },
  label: { color: Colors.white60, display: 'block', fontSize: 11, marginBottom: 6 },
  segmentedControl: {
    display: 'flex',
    border: `1px solid ${Colors.white10}`,
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentedButton: {
    border: 'none',
    borderRadius: 0,
    borderRight: `1px solid ${Colors.white10}`,
    color: Colors.white,
    flex: '1 1 0',
    fontSize: 12,
    lineHeight: 1.2,
    minHeight: 44,
    minWidth: 0,
    padding: '5px 4px',
    textTransform: 'none',
    '&:last-child': { borderRight: 'none' },
    '&[aria-pressed="true"]': { background: 'rgba(255,255,255,.14)' },
    '&[aria-pressed="true"]:hover': { background: 'rgba(255,255,255,.14)' },
    '&[aria-pressed="true"]:focus': { background: 'rgba(255,255,255,.14)' },
  },
  qualityDetail: { color: Colors.white60, display: 'block', fontSize: 10, fontWeight: 400, marginTop: 2 },
  availabilityHint: { color: '#ffcc80', fontSize: 12, lineHeight: 1.4, marginTop: 7 },
  estimate: { alignItems: 'center', display: 'flex', justifyContent: 'space-between', marginTop: 8 },
  estimateValue: { fontSize: 12, fontWeight: 500 },
  input: {
    background: Colors.white05,
    border: `1px solid ${Colors.white10}`,
    borderRadius: 8,
    boxSizing: 'border-box',
    color: Colors.white,
    fontFamily: 'inherit',
    fontSize: 13,
    outline: 'none',
    padding: '9px 11px',
    width: '100%',
    '&:focus': { borderColor: Colors.white60 },
    '&::placeholder': { color: Colors.white40 },
  },
  error: { color: '#ff8a80', fontSize: 12, marginTop: 10 },
  create: {
    background: Colors.white, borderRadius: 16, color: Colors.grey900, marginTop: 16,
    minHeight: 32, textTransform: 'none', width: '100%',
    '&:hover': { background: '#eee' },
    '&:disabled': { background: Colors.white05, color: Colors.white60 },
  },
  clipsSection: { padding: '13px 16px 16px' },
  sectionTitle: { color: Colors.white60, fontSize: 12, lineHeight: 1.4, marginBottom: 8 },
  clip: {
    padding: '8px 0',
    '& + &': { borderTop: `1px solid ${Colors.white05}` },
    '&:last-child': { paddingBottom: 0 },
  },
  clipTop: { alignItems: 'center', display: 'flex', gap: 12, justifyContent: 'space-between' },
  clipDetails: { minWidth: 0 },
  clipTitle: { fontSize: 15, lineHeight: 1.35 },
  clipMeta: { color: Colors.white60, fontSize: 13, lineHeight: 1.4, marginTop: 2 },
  progress: { marginTop: 7 },
  clipAction: {
    color: Colors.white, flex: '0 0 auto', height: 32, padding: 7, width: 32,
    '&:disabled': { color: Colors.white40 },
  },
  downloadIcon: { fontSize: 25 },
  clipActions: { alignItems: 'center', display: 'flex', flex: '0 0 auto', gap: 2, margin: '-4px -7px -4px 0' },
  secondaryActionIcon: { fontSize: 20 },
  playIcon: { fontSize: 27 },
  viewerPaper: { background: Colors.grey900, maxWidth: 800, width: 'calc(100vw - 32px)' },
  viewerTitle: { alignItems: 'center', display: 'flex', justifyContent: 'space-between', padding: '12px 12px 10px 20px' },
  viewerContent: { padding: '0 20px 20px' },
  viewerVideo: { background: Colors.grey950, display: 'block', maxHeight: '70vh', width: '100%' },
  viewerLoading: { alignItems: 'center', display: 'flex', height: 240, justifyContent: 'center' },
  empty: { color: Colors.white60, fontSize: 13, lineHeight: 1.4, paddingTop: 5 },
});

function formatTime(time) {
  const totalSeconds = Math.max(0, Math.round(time));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours ? `${hours}:` : ''}${hours ? String(minutes).padStart(2, '0') : minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return '';
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function safeFilename(filename) {
  return filename.trim().replace(/\.mp4$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function defaultFilename(camera, startTime, endTime) {
  return `comma-clip-${camera}-${Math.round(startTime)}-${Math.round(endTime)}`;
}

function deviceRouteName(route) {
  return route?.fullname?.split(/[|/]/).pop() || null;
}

function cameraCoversRange(cameraRanges, camera, startTime, endTime) {
  return Boolean(cameraRanges?.[camera]?.available_ranges?.some(([start, end]) => start <= startTime && end >= endTime));
}

class ClipMenu extends Component {
  constructor(props) {
    super(props);
    this.state = {
      clips: [], camera: 'fcamera', bitrate: 5, speedup: 1, filename: '',
      cameraRanges: null, loading: false, creating: false, error: null,
      viewingClip: null, previewUrl: null, previewLoading: false,
    };
    this.poll = null;
    this.mounted = false;
    this.previewRequest = 0;
    this.downloadingClipIds = new Set();
  }

  componentDidMount() {
    this.mounted = true;
    if (this.props.open) this.loadClips();
  }

  componentDidUpdate(prevProps) {
    const opened = this.props.open && !prevProps.open;
    const routeChanged = this.props.route?.fullname !== prevProps.route?.fullname;
    const deviceChanged = this.props.dongleId !== prevProps.dongleId;
    const reconnected = this.props.deviceOnline && !prevProps.deviceOnline;
    if ((opened || routeChanged || deviceChanged || reconnected) && this.props.open) this.loadClips();
    if (!this.props.deviceOnline && prevProps.deviceOnline) {
      this.stopPolling();
      this.setState({ loading: false });
    }
    if (!this.props.open && prevProps.open) {
      this.stopPolling();
      if (this.state.viewingClip) this.closeViewer();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.previewRequest += 1;
    this.stopPolling();
    if (this.state.previewUrl) URL.revokeObjectURL(this.state.previewUrl);
  }

  stopPolling() {
    if (this.poll) clearTimeout(this.poll);
    this.poll = null;
  }

  async loadClips(showLoading = true) {
    const routeName = deviceRouteName(this.props.route);
    const { dongleId } = this.props;
    if (!this.props.deviceOnline) {
      this.setState({ loading: false, error: null });
      return;
    }
    if (showLoading) this.setState({ loading: true, error: null });
    try {
      const state = await clipDevice.getClipsState(dongleId, { routes: routeName ? [routeName] : [] });
      if (!this.mounted || routeName !== deviceRouteName(this.props.route) || dongleId !== this.props.dongleId) return;
      const { clips } = state;
      const cameraRanges = routeName ? state.routes[routeName]?.cameras || {} : null;
      this.setState({ clips, cameraRanges, loading: false });
      this.stopPolling();
      if (this.props.open && clips.some(clip => ACTIVE_STATUSES.has(clip.status))) {
        this.poll = setTimeout(() => this.loadClips(false), POLL_INTERVAL);
      }
    } catch (err) {
      if (this.mounted) this.setState({ loading: false, error: err.message || 'Could not reach the device' });
    }
  }

  async createClip() {
    const { dongleId, route, zoom } = this.props;
    const { camera, bitrate, speedup, filename } = this.state;
    if (!route || !zoom || !this.props.deviceOnline) return;
    this.setState({ creating: true, error: null });
    try {
      await clipDevice.createClips(dongleId, {
        route: deviceRouteName(route),
        source_start_time: zoom.start / 1000,
        source_end_time: zoom.end / 1000,
        clips: [{
          camera,
          bitrate,
          speedup,
          filename: `${safeFilename(filename) || defaultFilename(camera, zoom.start / 1000, zoom.end / 1000)}.mp4`,
        }],
      });
      if (!this.mounted) return;
      this.setState({ creating: false });
      await this.loadClips(false);
    } catch (err) {
      if (this.mounted) this.setState({ creating: false, error: err.message || 'Could not create clip' });
    }
  }

  async downloadClip(clip) {
    if (!this.props.deviceOnline || this.downloadingClipIds.has(clip.filename)) return;
    this.downloadingClipIds.add(clip.filename);
    try {
      const url = await clipDevice.getClipUrl(this.props.dongleId, clip.filename);
      const link = document.createElement('a');
      link.href = url;
      const defaultName = `comma-clip-${clip.camera}-${formatTime(clip.source_start_time).replaceAll(':', '-')}-${formatTime(clip.source_end_time).replaceAll(':', '-')}`;
      link.download = `${(clip.filename || defaultName).replace(/\.mp4$/i, '')}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      if (this.mounted) this.setState({ error: err.message || 'Could not download clip' });
    } finally {
      this.downloadingClipIds.delete(clip.filename);
    }
  }

  async removeClip(clip) {
    if (!this.props.deviceOnline) return;
    try {
      await clipDevice.deleteClips(this.props.dongleId, { filenames: [clip.filename] });
      if (this.mounted) await this.loadClips(false);
    } catch (err) {
      if (this.mounted) this.setState({ error: err.message || 'Could not remove clip' });
    }
  }

  async openViewer(clip) {
    if (!this.props.deviceOnline) return;
    if (this.state.previewUrl) URL.revokeObjectURL(this.state.previewUrl);
    this.previewRequest += 1;
    const request = this.previewRequest;
    this.setState({ viewingClip: clip, previewUrl: null, previewLoading: true, error: null });
    try {
      const previewUrl = await clipDevice.getClipUrl(this.props.dongleId, clip.filename);
      if (!this.mounted || request !== this.previewRequest || this.state.viewingClip?.filename !== clip.filename) {
        URL.revokeObjectURL(previewUrl);
        return;
      }
      this.setState({ previewUrl, previewLoading: false });
    } catch (err) {
      if (this.mounted && request === this.previewRequest) {
        this.setState({ previewLoading: false, error: err.message || 'Could not preview clip' });
      }
    }
  }

  closeViewer() {
    this.previewRequest += 1;
    if (this.state.previewUrl) URL.revokeObjectURL(this.state.previewUrl);
    this.setState({ viewingClip: null, previewUrl: null, previewLoading: false });
  }

  renderViewer() {
    const { classes } = this.props;
    const { previewLoading, previewUrl, viewingClip } = this.state;
    const title = viewingClip?.filename?.replace(/\.mp4$/i, '') || 'Clip';
    return (
      <Dialog open={Boolean(viewingClip)} onClose={() => this.closeViewer()} classes={{ paper: classes.viewerPaper }} maxWidth="md">
        <DialogTitle disableTypography className={classes.viewerTitle}>
          <Typography className={classes.header}>{title}</Typography>
          <IconButton aria-label="Close video" onClick={() => this.closeViewer()}><CloseBold /></IconButton>
        </DialogTitle>
        <DialogContent className={classes.viewerContent}>
          {previewLoading && <div className={classes.viewerLoading}><CircularProgress size={28} /></div>}
          {previewUrl && <video className={classes.viewerVideo} src={previewUrl} controls autoPlay playsInline />}
          {!previewLoading && !previewUrl && <Typography className={classes.error}>{this.state.error || 'Could not preview clip'}</Typography>}
        </DialogContent>
      </Dialog>
    );
  }

  renderClip(clip) {
    const { classes } = this.props;
    const camera = CAMERAS.find(([value]) => value === clip.camera)?.[2] || clip.camera;
    const currentRoute = clip.route === deviceRouteName(this.props.route);
    const knownRoute = this.props.routes?.find(route => deviceRouteName(route) === clip.route);
    const routeLabel = currentRoute
      ? 'This route'
      : (knownRoute?.start_time_utc_millis
        ? new Date(knownRoute.start_time_utc_millis).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        : clip.route);
    const title = clip.filename?.replace(/\.mp4$/i, '') || 'Clip';
    return (
      <div key={clip.filename} className={classes.clip}>
        <div className={classes.clipTop}>
          <div className={classes.clipDetails}>
            <Typography className={classes.clipTitle}>{title}</Typography>
            <Typography className={classes.clipMeta}>{`${camera} · ${routeLabel}`}</Typography>
            <Typography className={classes.clipMeta}>
              {`${formatTime(clip.source_start_time)}–${formatTime(clip.source_end_time)} · ${clip.bitrate} Mbps${clip.speedup > 1 ? ` · ${clip.speedup}×` : ''}${clip.size ? ` · ${formatSize(clip.size)}` : ''}`}
            </Typography>
          </div>
          <div className={classes.clipActions}>
            {clip.status === 'ready' && (
              <IconButton
                aria-label="Play clip"
                className={classes.clipAction}
                disabled={!this.props.deviceOnline}
                title={this.props.deviceOnline ? 'Play clip' : 'Device offline'}
                onClick={() => this.openViewer(clip)}
              >
                <PlayArrow className={classes.playIcon} />
              </IconButton>
            )}
            {clip.status === 'ready' && (
              <IconButton
                aria-label="Download clip"
                className={classes.clipAction}
                disabled={!this.props.deviceOnline}
                title={this.props.deviceOnline ? 'Download clip' : 'Device offline'}
                onClick={() => this.downloadClip(clip)}
              >
                <DownloadIcon className={classes.downloadIcon} />
              </IconButton>
            )}
            {clip.status === 'encoding' && <Typography className={classes.clipMeta}>Encoding</Typography>}
            {clip.status === 'queued' && <Typography className={classes.clipMeta}>Queued</Typography>}
            <IconButton
              aria-label={ACTIVE_STATUSES.has(clip.status) ? 'Cancel clip' : 'Delete clip'}
              className={classes.clipAction}
              disabled={!this.props.deviceOnline}
              title={this.props.deviceOnline ? (ACTIVE_STATUSES.has(clip.status) ? 'Cancel clip' : 'Delete clip') : 'Device offline'}
              onClick={() => this.removeClip(clip)}
            >
              <CloseBold className={classes.secondaryActionIcon} />
            </IconButton>
          </div>
        </div>
        {clip.status === 'encoding' && <LinearProgress className={classes.progress} />}
      </div>
    );
  }

  render() {
    const { anchorEl, classes, deviceOnline, inventoryOnly, onClose, open, route, zoom } = this.props;
    const { bitrate, camera, cameraRanges, clips, creating, error, filename, loading, speedup } = this.state;
    const startTime = zoom ? zoom.start / 1000 : 0;
    const endTime = zoom ? zoom.end / 1000 : 0;
    const duration = endTime - startTime;
    const outputDuration = duration / speedup;
    const estimatedSize = outputDuration * bitrate * 125000;
    const invalidDuration = duration <= 0 || duration > MAX_CLIP_DURATION;
    const cameraUnavailable = !inventoryOnly && cameraRanges !== null && !cameraCoversRange(cameraRanges, camera, startTime, endTime);
    const cameraAvailable = cameraRanges === null || CAMERAS.some(([value]) => cameraCoversRange(cameraRanges, value, startTime, endTime));
    const deviceBusy = clips.some(clip => ACTIVE_STATUSES.has(clip.status));

    return (
      <>
        <Menu
          open={open}
          anchorEl={anchorEl}
          onClose={onClose}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          classes={{ paper: classes.paper }}
          MenuListProps={{ style: { outline: 'none' } }}
          disableAutoFocusItem
        >
          {!inventoryOnly && <div className={classes.body}>
          <Typography className={classes.header}>Create a clip</Typography>
          <div className={classes.range}>
            <Typography className={classes.supporting}>Selected timeline range</Typography>
            <Typography className={classes.rangeValue}>{zoom ? `${formatTime(startTime)}–${formatTime(endTime)} · ${formatTime(duration)}` : '—'}</Typography>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>CAMERA</Typography>
            <div className={classes.segmentedControl}>
              {CAMERAS.map(([value, label]) => (
                <Button
                  key={value}
                  aria-pressed={camera === value}
                  className={classes.segmentedButton}
                  disabled={cameraRanges !== null && !cameraCoversRange(cameraRanges, value, startTime, endTime)}
                  onClick={() => this.setState({ camera: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
            {!cameraAvailable && (
              <Typography className={classes.availabilityHint}>
                No camera footage covers this entire range. Choose a smaller range.
              </Typography>
            )}
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>QUALITY</Typography>
            <div className={classes.segmentedControl}>
              {BITRATES.map(([value, label, detail]) => (
                <Button key={value} aria-pressed={bitrate === value} className={classes.segmentedButton} onClick={() => this.setState({ bitrate: value })}>
                  <span>{label}<span className={classes.qualityDetail}>{detail}</span></span>
                </Button>
              ))}
            </div>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>SPEED</Typography>
            <div className={classes.segmentedControl}>
              {SPEEDUPS.map(value => (
                <Button key={value} aria-pressed={speedup === value} className={classes.segmentedButton} onClick={() => this.setState({ speedup: value })}>{`${value}×`}</Button>
              ))}
            </div>
            <div className={classes.estimate}>
              <Typography className={classes.supporting}>{`Output: ${formatTime(outputDuration)}`}</Typography>
              <Typography className={classes.estimateValue}>{`About ${formatSize(estimatedSize)}`}</Typography>
            </div>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>FILENAME</Typography>
            <input
              className={classes.input}
              value={filename}
              maxLength={80}
              placeholder={defaultFilename(camera, startTime, endTime)}
              onChange={event => this.setState({ filename: event.target.value })}
            />
          </div>
          {duration > MAX_CLIP_DURATION && <Typography className={classes.error}>Choose a range of 30 minutes or less.</Typography>}
          <Button className={classes.create} disabled={!deviceOnline || loading || creating || deviceBusy || invalidDuration || cameraUnavailable || !route} onClick={() => this.createClip()}>
            {creating ? <CircularProgress size={18} /> : (!deviceOnline ? 'Device offline' : (deviceBusy ? 'Clip in progress' : 'Create clip'))}
          </Button>
          </div>}
          {!inventoryOnly && <Divider />}
          <div className={classes.clipsSection}>
            <Typography className={classes.sectionTitle}>{deviceOnline ? 'CLIPS ON THIS DEVICE' : 'LAST KNOWN CLIPS ON THIS DEVICE'}</Typography>
            {error && <Typography className={classes.error}>{error}</Typography>}
            {loading && <div className={classes.empty}><CircularProgress size={18} /></div>}
            {!loading && clips.length === 0 && <Typography className={classes.empty}>{deviceOnline ? 'No clips yet' : 'Connect to your device to check for clips'}</Typography>}
            {!loading && clips.map(clip => this.renderClip(clip))}
          </div>
        </Menu>
        {this.renderViewer()}
      </>
    );
  }
}

export default withStyles(styles)(ClipMenu);

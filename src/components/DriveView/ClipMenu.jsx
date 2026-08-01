import React, { Component } from 'react';
import {
  Button, CircularProgress, Divider, IconButton, LinearProgress, Menu, Typography, withStyles,
} from '@material-ui/core';

import Colors from '../../colors';
import { clipDevice } from '../../api/clips';
import { Download as DownloadIcon } from '../../icons';

const MAX_CLIP_DURATION = 30 * 60 * 1000;
const POLL_INTERVAL = 1000;

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
  choices: { display: 'flex' },
  choice: {
    border: `1px solid ${Colors.white10}`, borderRadius: 8, color: Colors.white,
    fontSize: 12, minHeight: 36, minWidth: 0, padding: '4px 11px', textTransform: 'none',
  },
  selected: { background: 'rgba(255,255,255,.14)' },
  bitrateChoices: {
    border: `1px solid ${Colors.white10}`,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bitrateChoice: {
    border: 'none',
    borderRadius: 0,
    borderRight: `1px solid ${Colors.white10}`,
    flex: '1 1 0',
    lineHeight: 1.2,
    minHeight: 44,
    padding: '5px 4px',
    '&:last-child': { borderRight: 'none' },
  },
  bitrateDetail: { color: Colors.white60, display: 'block', fontSize: 10, fontWeight: 400, marginTop: 2 },
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
  download: {
    color: Colors.white, flex: '0 0 auto', height: 32, margin: '-4px -7px -4px 0', padding: 7, width: 32,
    '&:disabled': { color: Colors.white40 },
  },
  downloadIcon: { fontSize: 23 },
  empty: { color: Colors.white60, fontSize: 13, lineHeight: 1.4, paddingTop: 5 },
});

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
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

class ClipMenu extends Component {
  constructor(props) {
    super(props);
    this.state = {
      clips: [], camera: 'fcamera', bitrate: 5, speedup: 1, filename: '',
      loading: false, creating: false, error: null,
    };
    this.poll = null;
    this.watchedClipIds = new Set();
    this.downloadedClipIds = new Set();
  }

  componentDidMount() {
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
    if (!this.props.open && prevProps.open) this.stopPolling();
  }

  componentWillUnmount() {
    this.stopPolling();
  }

  stopPolling() {
    if (this.poll) clearTimeout(this.poll);
    this.poll = null;
  }

  async loadClips(showLoading = true) {
    const routeName = this.props.route?.fullname;
    const { dongleId } = this.props;
    if (!this.props.deviceOnline) {
      this.setState({ loading: false, error: null });
      return;
    }
    if (showLoading) this.setState({ loading: true, error: null });
    try {
      const clips = await clipDevice.list(dongleId);
      if (routeName !== this.props.route?.fullname || dongleId !== this.props.dongleId) return;
      this.setState({ clips, loading: false });
      clips.filter(clip => clip.status === 'encoding').forEach(clip => this.watchedClipIds.add(clip.id));
      const completedClip = clips.find(clip => clip.status === 'ready'
        && this.watchedClipIds.has(clip.id) && !this.downloadedClipIds.has(clip.id));
      if (completedClip && this.props.open) {
        this.downloadedClipIds.add(completedClip.id);
        this.downloadClip(completedClip);
      }
      this.stopPolling();
      if (this.props.open && clips.some(clip => clip.status === 'encoding')) {
        this.poll = setTimeout(() => this.loadClips(false), POLL_INTERVAL);
      }
    } catch (err) {
      this.setState({ loading: false, error: err.message || 'Could not reach the device' });
    }
  }

  async createClip() {
    const { route, zoom } = this.props;
    const { camera, bitrate, speedup, filename } = this.state;
    if (!route || !zoom || !this.props.deviceOnline) return;
    this.setState({ creating: true, error: null });
    try {
      await clipDevice.create({
        route: route.fullname,
        camera,
        bitrate,
        speedup,
        filename: safeFilename(filename) || null,
        startTime: zoom.start,
        endTime: zoom.end,
      });
      this.setState({ creating: false });
      await this.loadClips(false);
    } catch (err) {
      this.setState({ creating: false, error: err.message || 'Could not create clip' });
    }
  }

  async downloadClip(clip) {
    if (!this.props.deviceOnline) return;
    try {
      const url = await clipDevice.download(clip.id);
      const link = document.createElement('a');
      link.href = url;
      const defaultName = `comma-clip-${clip.camera}-${formatTime(clip.startTime).replaceAll(':', '-')}-${formatTime(clip.endTime).replaceAll(':', '-')}`;
      link.download = `${clip.filename || defaultName}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      this.setState({ error: err.message || 'Could not download clip' });
    }
  }

  renderClip(clip) {
    const { classes } = this.props;
    const camera = CAMERAS.find(([value]) => value === clip.camera)?.[2] || clip.camera;
    const currentRoute = clip.route === this.props.route?.fullname;
    const knownRoute = this.props.routes?.find(route => route.fullname === clip.route);
    const routeLabel = currentRoute
      ? 'This route'
      : (knownRoute?.start_time_utc_millis
        ? new Date(knownRoute.start_time_utc_millis).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        : clip.route.replace('|', '/'));
    return (
      <div key={clip.id} className={classes.clip}>
        <div className={classes.clipTop}>
          <div className={classes.clipDetails}>
            <Typography className={classes.clipTitle}>{camera}</Typography>
            <Typography className={classes.clipMeta}>{routeLabel}</Typography>
            <Typography className={classes.clipMeta}>
              {`${formatTime(clip.startTime)}–${formatTime(clip.endTime)} · ${clip.bitrate} Mbps${clip.speedup > 1 ? ` · ${clip.speedup}×` : ''}${clip.size ? ` · ${formatSize(clip.size)}` : ''}`}
            </Typography>
          </div>
          {clip.status === 'ready' && (
            <IconButton
              aria-label="Download clip"
              className={classes.download}
              disabled={!this.props.deviceOnline}
              title={this.props.deviceOnline ? 'Download clip' : 'Device offline'}
              onClick={() => this.downloadClip(clip)}
            >
              <DownloadIcon className={classes.downloadIcon} />
            </IconButton>
          )}
          {clip.status === 'encoding' && <Typography className={classes.clipMeta}>{`${Math.round(clip.progress * 100)}%`}</Typography>}
        </div>
        {clip.status === 'encoding' && (
          <LinearProgress className={classes.progress} variant="determinate" value={clip.progress * 100} />
        )}
      </div>
    );
  }

  render() {
    const { anchorEl, classes, deviceOnline, inventoryOnly, onClose, open, route, zoom } = this.props;
    const { bitrate, camera, clips, creating, error, filename, loading, speedup } = this.state;
    const duration = zoom ? zoom.end - zoom.start : 0;
    const outputDuration = duration / speedup;
    const estimatedSize = outputDuration / 1000 * bitrate * 125000;
    const invalidDuration = duration <= 0 || duration > MAX_CLIP_DURATION;
    const deviceBusy = clips.some(clip => clip.status === 'encoding');

    return (
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
            <Typography className={classes.rangeValue}>{zoom ? `${formatTime(zoom.start)}–${formatTime(zoom.end)} · ${formatTime(duration)}` : '—'}</Typography>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>CAMERA</Typography>
            <div className={`${classes.choices} ${classes.bitrateChoices}`}>
              {CAMERAS.map(([value, label]) => (
                <Button key={value} className={`${classes.choice} ${classes.bitrateChoice} ${camera === value ? classes.selected : ''}`} onClick={() => this.setState({ camera: value })}>{label}</Button>
              ))}
            </div>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>QUALITY</Typography>
            <div className={`${classes.choices} ${classes.bitrateChoices}`}>
              {BITRATES.map(([value, label, detail]) => (
                <Button key={value} className={`${classes.choice} ${classes.bitrateChoice} ${bitrate === value ? classes.selected : ''}`} onClick={() => this.setState({ bitrate: value })}>
                  <span>{label}<span className={classes.bitrateDetail}>{detail}</span></span>
                </Button>
              ))}
            </div>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>SPEED</Typography>
            <div className={`${classes.choices} ${classes.bitrateChoices}`}>
              {SPEEDUPS.map(value => (
                <Button key={value} className={`${classes.choice} ${classes.bitrateChoice} ${speedup === value ? classes.selected : ''}`} onClick={() => this.setState({ speedup: value })}>{`${value}×`}</Button>
              ))}
            </div>
            <div className={classes.estimate}>
              <Typography className={classes.supporting}>{`Output: ${formatTime(outputDuration)}`}</Typography>
              <Typography className={classes.estimateValue}>{`About ${formatSize(estimatedSize)}`}</Typography>
            </div>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>FILENAME (OPTIONAL)</Typography>
            <input
              className={classes.input}
              value={filename}
              maxLength={80}
              placeholder="comma-clip"
              onChange={event => this.setState({ filename: event.target.value })}
            />
          </div>
          {duration > MAX_CLIP_DURATION && <Typography className={classes.error}>Choose a range of 30 minutes or less.</Typography>}
          {error && <Typography className={classes.error}>{error}</Typography>}
          <Button className={classes.create} disabled={!deviceOnline || creating || deviceBusy || invalidDuration || !route} onClick={() => this.createClip()}>
            {creating ? <CircularProgress size={18} /> : (!deviceOnline ? 'Device offline' : (deviceBusy ? 'Clip in progress' : 'Create clip'))}
          </Button>
        </div>}
        {!inventoryOnly && <Divider />}
        <div className={classes.clipsSection}>
          <Typography className={classes.sectionTitle}>{deviceOnline ? 'CLIPS ON THIS DEVICE' : 'LAST KNOWN CLIPS ON THIS DEVICE'}</Typography>
          {loading && <div className={classes.empty}><CircularProgress size={18} /></div>}
          {!loading && clips.length === 0 && <Typography className={classes.empty}>{deviceOnline ? 'No clips yet' : 'Connect to your device to check for clips'}</Typography>}
          {!loading && clips.map(clip => this.renderClip(clip))}
        </div>
      </Menu>
    );
  }
}

export default withStyles(styles)(ClipMenu);

import React, { Component } from 'react';
import {
  Button, CircularProgress, Divider, LinearProgress, Menu, MenuItem, Typography, withStyles,
} from '@material-ui/core';

import Colors from '../../colors';
import { clipDevice } from '../../api/clips';

const MAX_CLIP_DURATION = 30 * 60 * 1000;
const POLL_INTERVAL = 1000;

const CAMERAS = [
  ['fcamera', 'Road', 'Road camera'],
  ['ecamera', 'Wide', 'Wide road camera'],
  ['dcamera', 'Driver', 'Driver camera'],
];

const BITRATES = [
  [2, 'Small', '2 Mbps'],
  [5, 'Standard', '5 Mbps'],
  [10, 'High', '10 Mbps'],
];

const styles = () => ({
  paper: { width: 360, maxWidth: 'calc(100vw - 24px)', outline: 'none' },
  body: { padding: 16 },
  header: { fontSize: 16, fontWeight: 500, marginBottom: 4 },
  supporting: { color: Colors.white60, fontSize: 12, lineHeight: 1.4 },
  range: {
    background: Colors.white05, borderRadius: 8, margin: '14px 0', padding: '10px 12px',
  },
  rangeValue: { fontSize: 15, fontWeight: 500 },
  field: { marginTop: 14 },
  label: { color: Colors.white60, display: 'block', fontSize: 11, marginBottom: 6 },
  choices: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  cameraChoices: {
    border: `1px solid ${Colors.white10}`,
    borderRadius: 16,
    flexWrap: 'nowrap',
    gap: 0,
    overflow: 'hidden',
  },
  cameraChoice: {
    border: 'none',
    borderRadius: 0,
    borderRight: `1px solid ${Colors.white10}`,
    flex: '1 1 0',
    paddingLeft: 6,
    paddingRight: 6,
    whiteSpace: 'nowrap',
    '&:last-child': { borderRight: 'none' },
  },
  choice: {
    border: `1px solid ${Colors.white10}`, borderRadius: 16, color: Colors.white,
    fontSize: 12, minHeight: 30, minWidth: 0, padding: '4px 11px', textTransform: 'none',
  },
  selected: { background: Colors.white10 },
  bitrateDetail: { color: Colors.white60, fontSize: 10, marginLeft: 4 },
  error: { color: '#ff8a80', fontSize: 12, marginTop: 10 },
  create: {
    background: Colors.white, borderRadius: 16, color: Colors.grey900, marginTop: 16,
    minHeight: 32, textTransform: 'none', width: '100%',
    '&:hover': { background: '#eee' },
  },
  sectionTitle: { color: Colors.white60, fontSize: 11, padding: '12px 16px 5px' },
  clip: { alignItems: 'stretch', display: 'block', padding: '10px 16px' },
  clipTop: { alignItems: 'center', display: 'flex', justifyContent: 'space-between' },
  clipTitle: { fontSize: 13 },
  clipMeta: { color: Colors.white60, fontSize: 11, marginTop: 2 },
  progress: { marginTop: 8 },
  download: { color: Colors.white, fontSize: 11, minWidth: 0, padding: '2px 8px', textTransform: 'none' },
  empty: { color: Colors.white60, fontSize: 12, padding: '8px 16px 14px' },
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

class ClipMenu extends Component {
  constructor(props) {
    super(props);
    this.state = { clips: [], camera: 'fcamera', bitrate: 5, loading: false, creating: false, error: null };
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
    if ((opened || routeChanged) && this.props.open) this.loadClips();
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
    if (!routeName) return;
    if (showLoading) this.setState({ loading: true, error: null });
    try {
      const clips = await clipDevice.list(routeName);
      if (routeName !== this.props.route?.fullname) return;
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
    const { camera, bitrate } = this.state;
    if (!route || !zoom) return;
    this.setState({ creating: true, error: null });
    try {
      await clipDevice.create({
        route: route.fullname,
        camera,
        bitrate,
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
    try {
      const url = await clipDevice.download(clip.id);
      const link = document.createElement('a');
      link.href = url;
      link.download = `comma-clip-${clip.camera}-${formatTime(clip.startTime).replaceAll(':', '-')}-${formatTime(clip.endTime).replaceAll(':', '-')}.mp4`;
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
    return (
      <MenuItem key={clip.id} className={classes.clip} disableRipple>
        <div className={classes.clipTop}>
          <div>
            <Typography className={classes.clipTitle}>{camera}</Typography>
            <Typography className={classes.clipMeta}>
              {`${formatTime(clip.startTime)}–${formatTime(clip.endTime)} · ${clip.bitrate} Mbps${clip.size ? ` · ${formatSize(clip.size)}` : ''}`}
            </Typography>
          </div>
          {clip.status === 'ready' && (
            <Button className={classes.download} onClick={() => this.downloadClip(clip)}>Download</Button>
          )}
          {clip.status === 'encoding' && <Typography className={classes.clipMeta}>{`${Math.round(clip.progress * 100)}%`}</Typography>}
        </div>
        {clip.status === 'encoding' && (
          <LinearProgress className={classes.progress} variant="determinate" value={clip.progress * 100} />
        )}
      </MenuItem>
    );
  }

  render() {
    const { anchorEl, classes, onClose, open, route, zoom } = this.props;
    const { bitrate, camera, clips, creating, error, loading } = this.state;
    const duration = zoom ? zoom.end - zoom.start : 0;
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
      >
        <div className={classes.body}>
          <Typography className={classes.header}>Create a clip</Typography>
          <Typography className={classes.supporting}>Saved on your comma device. It must be online to create or download clips.</Typography>
          <div className={classes.range}>
            <Typography className={classes.supporting}>Selected timeline range</Typography>
            <Typography className={classes.rangeValue}>{zoom ? `${formatTime(zoom.start)}–${formatTime(zoom.end)} · ${formatTime(duration)}` : '—'}</Typography>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>CAMERA</Typography>
            <div className={`${classes.choices} ${classes.cameraChoices}`}>
              {CAMERAS.map(([value, label]) => (
                <Button key={value} className={`${classes.choice} ${classes.cameraChoice} ${camera === value ? classes.selected : ''}`} onClick={() => this.setState({ camera: value })}>{label}</Button>
              ))}
            </div>
          </div>
          <div className={classes.field}>
            <Typography className={classes.label}>QUALITY</Typography>
            <div className={classes.choices}>
              {BITRATES.map(([value, label, detail]) => (
                <Button key={value} className={`${classes.choice} ${bitrate === value ? classes.selected : ''}`} onClick={() => this.setState({ bitrate: value })}>
                  {label}<span className={classes.bitrateDetail}>{detail}</span>
                </Button>
              ))}
            </div>
          </div>
          {duration > MAX_CLIP_DURATION && <Typography className={classes.error}>Choose a range of 30 minutes or less.</Typography>}
          {error && <Typography className={classes.error}>{error}</Typography>}
          <Button className={classes.create} disabled={creating || deviceBusy || invalidDuration || !route} onClick={() => this.createClip()}>
            {creating ? <CircularProgress size={18} /> : (deviceBusy ? 'Clip in progress' : 'Create clip')}
          </Button>
        </div>
        <Divider />
        <Typography className={classes.sectionTitle}>CLIPS ON THIS DEVICE FOR THIS ROUTE</Typography>
        {loading && <div className={classes.empty}><CircularProgress size={18} /></div>}
        {!loading && clips.length === 0 && <Typography className={classes.empty}>No clips yet</Typography>}
        {!loading && clips.map(clip => this.renderClip(clip))}
      </Menu>
    );
  }
}

export default withStyles(styles)(ClipMenu);

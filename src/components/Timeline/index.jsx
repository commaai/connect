// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { createPortal } from 'react-dom';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import ReactPlayer from 'react-player/file';
import dayjs from 'dayjs';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import { api } from '../../api/backend';
import { pushTimelineRange } from '../../actions';
import Colors from '../../colors';
import { currentOffset } from '../../timeline';
import { seek } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';

const styles = () => ({
  base: {
    position: 'relative',
  },
  segments: {
    position: 'relative',
    left: '0px',
    width: '100%',
    overflow: 'hidden',
    height: 12,
  },
  segment: {
    position: 'absolute',
    height: 12,
    background: theme.palette.states.drivingBlue,
  },
  statusGradient: {
    background: 'linear-gradient(rgba(0, 0, 0, 0.0) 4%, rgba(255, 255, 255, 0.025) 10%, rgba(0, 0, 0, 0.1) 25%, rgba(0, 0, 0, 0.4))',
    height: 12,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 2,
  },
  segmentColor: {
    position: 'absolute',
    display: 'inline-block',
    height: 12,
    width: '100%',
    '&.active': {},
    '&.engage': {
      background: theme.palette.states.engagedGreen,
    },
    '&.overriding': {
      background: theme.palette.states.engagedGrey,
    },
    '&.alert': {
      '&.userPrompt': {
        background: theme.palette.states.alertOrange,
      },
      '&.critical': {
        background: theme.palette.states.alertRed,
      },
    },
    '&.bookmark, &.flag': {  // TODO: remove flag selector once 14 days expires old events caches
      background: theme.palette.states.userBookmark,
      zIndex: 1,
    },
  },
  thumbnails: {
    height: 20,
    width: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '& > div': {
      display: 'inline-block',
    },
  },
  ruler: {
    backgroundColor: 'rgb(37, 51, 61)',
    touchAction: 'none',
    width: '100%',
    height: 44,
  },
  rulerRemaining: {
    backgroundColor: 'rgba(29, 34, 37, 0.9)',
    borderLeft: '1px solid #D8DDDF',
    position: 'absolute',
    left: 0,
    height: 44,
    opacity: 0.45,
    pointerEvents: 'none',
    width: '100%',
  },
  loopStart: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRight: '1px solid rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    left: 0,
    height: 44,
    pointerEvents: 'none',
  },
  loopEnd: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderLeft: '1px solid rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    right: 0,
    height: 44,
    pointerEvents: 'none',
  },
  dragHighlight: {
    pointerEvents: 'none',
    background: 'rgba(255, 255, 255, 0.1)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.3)',
    borderRight: '1px solid rgba(255, 255, 255, 0.3)',
    position: 'absolute',
    height: 44,
  },
  hoverBead: {
    zIndex: 3,
    textAlign: 'center',
    borderRadius: 14,
    fontSize: '0.7em',
    padding: '3px 4px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    position: 'absolute',
    top: 83,
    left: 0,
    width: 80,
  },
  hoverPreview: {
    position: 'fixed',
    boxSizing: 'border-box',
    width: 256,
    height: 160,
    border: `1px solid ${Colors.white30}`,
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
    backgroundColor: Colors.grey900,
    zIndex: 1400,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  previewPlayer: {
    position: 'fixed',
    left: -10000,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  previewCanvas: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  previewMessage: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    color: Colors.white,
    fontSize: 12,
  },
  hoverPreviewLabel: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    borderRadius: 4,
    padding: '2px 5px',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    color: Colors.white,
    fontSize: 11,
    lineHeight: '16px',
  },
});

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical',
];

function percentFromPointerEvent(ev) {
  const boundingBox = ev.currentTarget.getBoundingClientRect();
  const x = ev.clientX - boundingBox.left;
  return Math.max(0, Math.min(1, x / boundingBox.width));
}

export function getVideoPreviewTime(offset, videoStartOffset = 0) {
  return Math.max(0, (offset - videoStartOffset) / 1000);
}

function supportsDesktopHover(ev) {
  return ev.pointerType === 'mouse'
    && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
}

export class Timeline extends Component {
  constructor(props) {
    super(props);

    this.getOffset = this.getOffset.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.percentToOffset = this.percentToOffset.bind(this);
    this.segmentNum = this.segmentNum.bind(this);
    this.onRulerRef = this.onRulerRef.bind(this);
    this.renderRoute = this.renderRoute.bind(this);
    this.onPreviewReady = this.onPreviewReady.bind(this);
    this.onPreviewSeeked = this.onPreviewSeeked.bind(this);
    this.onPreviewError = this.onPreviewError.bind(this);

    this.rulerRemaining = React.createRef();
    this.rulerRef = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();
    this.thumbnailsRef = React.createRef();
    this.previewPlayer = React.createRef();
    this.previewCanvas = React.createRef();
    this.previewMedia = null;
    this.previewSeekTimeout = null;
    this.previewFrameReady = false;
    this.previewError = false;

    const { zoomOverride, zoom } = this.props;
    this.state = {
      dragging: null,
      hoverX: null,
      hoverOffset: null,
      zoom: zoomOverride || zoom,
      thumbnail: {
        height: 0,
        width: 0,
      },
    };
  }

  componentDidMount() {
    this.mounted = true;
    requestAnimationFrame(this.getOffset);
    this.componentDidUpdate({});

    if (typeof ResizeObserver !== 'undefined' && this.thumbnailsRef.current) {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        const { width, height } = entry.contentRect;
        this.setState({ thumbnail: { width, height } });
      });
      this.resizeObserver.observe(this.thumbnailsRef.current);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const { zoomOverride, zoom } = this.props;
    if (prevProps.zoomOverride !== zoomOverride || prevProps.zoom !== zoom) {
      this.setState({ zoom: zoomOverride || zoom });
    }
    const routeChanged = prevProps.route?.fullname !== this.props.route?.fullname;
    if (routeChanged) {
      clearTimeout(this.previewSeekTimeout);
      this.previewSeekTimeout = null;
      this.detachPreviewMedia();
      this.previewFrameReady = false;
      this.previewError = false;
    }
    if ((prevState && prevState.hoverOffset !== this.state.hoverOffset) || routeChanged) {
      if (this.state.hoverOffset !== null) {
        if (this.previewSeekTimeout === null) {
          this.previewSeekTimeout = setTimeout(() => {
            this.previewSeekTimeout = null;
            this.seekPreviewToOffset(this.state.hoverOffset);
          }, 100);
        }
      } else {
        clearTimeout(this.previewSeekTimeout);
        this.previewSeekTimeout = null;
        this.detachPreviewMedia();
        this.previewFrameReady = false;
        this.previewError = false;
      }
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.previewSeekTimeout);
    this.detachPreviewMedia();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  detachPreviewMedia() {
    if (this.previewMedia) {
      this.previewMedia.removeEventListener('seeked', this.onPreviewSeeked);
      this.previewMedia.removeEventListener('loadeddata', this.onPreviewSeeked);
      this.previewMedia.removeEventListener('loadedmetadata', this.onPreviewMetadata);
      this.previewMedia = null;
    }
  }

  onPreviewReady() {
    this.detachPreviewMedia();
    const media = this.previewPlayer.current?.getInternalPlayer?.();
    if (!media) {
      return;
    }
    this.previewMedia = media;
    media.addEventListener('seeked', this.onPreviewSeeked);
    media.addEventListener('loadeddata', this.onPreviewSeeked);
    media.addEventListener('loadedmetadata', this.onPreviewMetadata);
    this.seekPreviewToOffset(this.state.hoverOffset);
  }

  onPreviewMetadata() {
    this.seekPreviewToOffset(this.state.hoverOffset);
  }

  seekPreviewToOffset(offset) {
    const media = this.previewMedia;
    const route = this.props.route;
    if (!media || !route || offset === null || offset === undefined) {
      return;
    }

    const requestedTime = getVideoPreviewTime(offset, route.videoStartOffset || 0);
    if (media.readyState < 1) {
      return;
    }
    const targetTime = Number.isFinite(media.duration)
      ? Math.min(requestedTime, media.duration)
      : requestedTime;
    this.previewTargetTime = targetTime;
    if (Math.abs(media.currentTime - targetTime) < 0.05) {
      this.onPreviewSeeked();
      return;
    }

    this.previewFrameReady = false;
    this.previewError = false;
    if (this.mounted) {
      this.forceUpdate();
    }
    try {
      media.currentTime = targetTime;
    } catch (error) {
      if (error?.name !== 'InvalidStateError') {
        console.error('Unable to seek the timeline video preview', error);
        this.previewError = true;
      }
    }
  }

  onPreviewSeeked() {
    const media = this.previewMedia;
    const canvas = this.previewCanvas.current;
    if (!media || !canvas || media.readyState < 2
      || (Number.isFinite(this.previewTargetTime)
        && Math.abs(media.currentTime - this.previewTargetTime) >= 0.1)) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      console.error('Unable to create a canvas context for the timeline video preview');
      this.previewFrameReady = false;
      this.previewError = true;
      if (this.mounted) {
        this.forceUpdate();
      }
      return;
    }
    try {
      context.drawImage(media, 0, 0, canvas.width, canvas.height);
      this.previewFrameReady = true;
      this.previewError = false;
      if (this.mounted) {
        this.forceUpdate();
      }
    } catch (error) {
      console.error('Unable to capture the timeline video preview frame', error);
      this.previewFrameReady = false;
      this.previewError = true;
      if (this.mounted) {
        this.forceUpdate();
      }
    }
  }

  onPreviewError(error) {
    console.error('Unable to load the timeline video preview', error);
    this.previewFrameReady = false;
    this.previewError = true;
    if (this.mounted) {
      this.forceUpdate();
    }
  }

  handleClick(ev) {
    const { dragging } = this.state;
    if (!dragging || Math.abs(dragging[1] - dragging[0]) <= 3) {
      const percent = percentFromPointerEvent(ev);
      this.props.dispatch(seek(this.percentToOffset(percent)));
    }
  }

  handlePointerDown(ev) {
    if (ev.button !== 0) {
      return;
    }

    ev.preventDefault();
    document.addEventListener('pointerup', this.handlePointerUp);
    document.addEventListener('pointermove', this.handlePointerMove);
    this.setState({ dragging: [ev.clientX, ev.clientX] });
  }

  handlePointerMove(ev) {
    const { dragging } = this.state;
    const ruler = this.rulerRef.current;
    const boundsElement = dragging && ruler ? ruler : ev.currentTarget;
    if (!boundsElement?.getBoundingClientRect) {
      return;
    }

    const rulerBounds = boundsElement.getBoundingClientRect();
    if (rulerBounds.width <= 0) {
      return;
    }
    const endDrag = Math.max(rulerBounds.left, Math.min(rulerBounds.left + rulerBounds.width, ev.clientX));
    if (dragging && ruler) {
      ev.preventDefault();
      this.setState({ dragging: [dragging[0], endDrag] });
    }
    const isDesktopHover = supportsDesktopHover(ev);
    const hoverPercent = (ev.clientX - rulerBounds.left) / rulerBounds.width;
    this.setState({
      hoverX: isDesktopHover ? Math.max(0, Math.min(rulerBounds.width, ev.clientX - rulerBounds.left)) : null,
      hoverOffset: isDesktopHover ? this.percentToOffset(hoverPercent) : null,
    });
  }

  handlePointerUp(ev) {
    const { route } = this.props;

    // prevent preventDefault for back(3) and forward(4) mouse buttons
    if (ev.button !== 3 && ev.button !== 4) {
      ev.preventDefault();
    }

    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointermove', this.handlePointerMove);
    const { dragging } = this.state;
    if (!dragging) {
      return;
    }
    this.setState({ dragging: null });

    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const startPercent = (Math.min(dragging[0], dragging[1]) - rulerBounds.left) / rulerBounds.width;
    const endPercent = (Math.max(dragging[0], dragging[1]) - rulerBounds.left) / rulerBounds.width;
    const startOffset = Math.round(this.percentToOffset(startPercent));
    const endOffset = Math.round(this.percentToOffset(endPercent));

    if (Math.abs(dragging[1] - dragging[0]) > 3) {
      const offset = currentOffset();
      if (offset < startOffset || offset > endOffset) {
        this.props.dispatch(seek(startOffset));
      }
      const { dispatch } = this.props;
      const startTime = startOffset;
      const endTime = endOffset;

      dispatch(pushTimelineRange(route.log_id, startTime, endTime, true));
    } else if (ev.currentTarget !== document) {
      this.handleClick(ev);
    }
  }

  handlePointerLeave() {
    this.setState({ hoverX: null, hoverOffset: null });
  }

  onRulerRef(el) {
    this.rulerRef.current = el;
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  getOffset() {
    if (!this.mounted) {
      return;
    }
    requestAnimationFrame(this.getOffset);
    let offset = currentOffset();
    if (this.seekIndex) {
      offset = this.seekIndex;
    }
    offset = Math.floor(offset);
    const percent = this.offsetToPercent(offset);
    if (this.rulerRemaining.current && this.rulerRemaining.current.parentElement) {
      this.rulerRemaining.current.style.left = `${Math.floor(10000 * percent) / 100}%`;
      this.rulerRemaining.current.style.width = `${100 - Math.floor(10000 * percent) / 100}%`;
    }
  }

  percentToOffset(perc) {
    const { zoom } = this.state;
    return perc * (zoom.end - zoom.start) + zoom.start;
  }

  offsetToPercent(offset) {
    const { zoom } = this.state;
    return (offset - zoom.start) / (zoom.end - zoom.start);
  }

  segmentNum(offset) {
    const { route } = this.props;
    if (route) {
      return getSegmentNumber(route, offset);
    }
    return null;
  }

  renderRoute() {
    const { classes, route } = this.props;
    const { zoom } = this.state;

    if (!route.events) {
      return null;
    }

    const zoomDuration = zoom.end - zoom.start;
    const startPerc = (100 * (-zoom.start)) / zoomDuration;
    const widthPerc = (100 * route.duration) / zoomDuration;

    const style = {
      width: `${widthPerc}%`,
      left: `${startPerc}%`,
    };
    return (
      <div key={route.fullname} className={classes.segment} style={style}>
        { this.renderRouteEvents(route) }
      </div>
    );
  }

  renderRouteEvents(route) {
    const { classes } = this.props;
    if (!route.events) {
      return null;
    }

    return route.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event) => {
        const style = {
          left: `${(event.route_offset_millis / route.duration) * 100}%`,
          width: `${((event.data.end_route_offset_millis - event.route_offset_millis) / route.duration) * 100}%`,
          minWidth: '1px',
        };
        const statusCls = event.data.alertStatus ? `${AlertStatusCodes[event.data.alertStatus]}` : '';
        return (
          <div
            key={route.fullname + event.route_offset_millis + event.type}
            style={style}
            className={ `${classes.segmentColor} ${event.type} ${statusCls}` }
          />
        );
      });
  }

  render() {
    const { classes, hasRuler, className, route, thumbnailsVisible } = this.props;
    const { thumbnail, hoverX, hoverOffset, dragging } = this.state;

    const hasRulerCls = hasRuler ? 'hasRuler' : '';

    const hoverTarget = this.rulerRef.current || this.thumbnailsRef.current;
    let rulerBounds;
    if (hoverTarget) {
      rulerBounds = hoverTarget.getBoundingClientRect();
    }

    let hoverString; let hoverStyle; let hoverPreviewStyle;
    if (rulerBounds && hoverX !== null && hoverOffset !== null) {
      hoverStyle = { left: Math.max(-10, Math.min(rulerBounds.width - 70, hoverX - 40)) };
      if (!Number.isNaN(hoverOffset)) {
        hoverString = dayjs(route.start_time_utc_millis + hoverOffset).format('HH:mm:ss');
        const segNum = this.segmentNum(hoverOffset);
        if (segNum !== null) {
          hoverString = `${segNum}, ${hoverString}`;
          const previewWidth = 256;
          const previewHeight = 160;
          const maxLeft = Math.max(8, window.innerWidth - previewWidth - 8);
          hoverPreviewStyle = {
            left: Math.max(8, Math.min(maxLeft, rulerBounds.left + hoverX - (previewWidth / 2))),
            top: Math.max(8, rulerBounds.top - previewHeight - 12),
          };
        }
      }
    }
    const previewUrl = hoverOffset !== null && route
      ? api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig)
      : '';

    let draggerStyle;
    if (rulerBounds && dragging && Math.abs(dragging[1] - dragging[0]) > 0) {
      draggerStyle = {
        left: `${Math.min(dragging[1], dragging[0]) - rulerBounds.left}px`,
        width: `${Math.abs(dragging[1] - dragging[0])}px`,
      };
    }

    const baseWidthStyle = { width: '100%' };

    return (
      <div className={className}>
        <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } style={ baseWidthStyle }>
          <div className={ `${classes.segments} ${hasRulerCls}` }>
            { route && this.renderRoute() }
            <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
          </div>
          <div
            ref={this.thumbnailsRef}
            className={`${classes.thumbnails} ${hasRulerCls}`}
            onPointerMove={!hasRuler ? this.handlePointerMove : undefined}
            onPointerLeave={!hasRuler ? this.handlePointerLeave : undefined}
          >
            {thumbnailsVisible && (
              <Thumbnails
                className={classes.thumbnail}
                currentRoute={route}
                percentToOffset={this.percentToOffset}
                thumbnail={thumbnail}
                hasRuler={hasRuler}
              />
            )}
          </div>
          { previewUrl && (
            <div className={classes.previewPlayer} aria-hidden="true">
              <ReactPlayer
                key={route.fullname}
                ref={this.previewPlayer}
                url={previewUrl}
                playing={false}
                muted
                playsinline
                width="1px"
                height="1px"
                onReady={this.onPreviewReady}
                onError={this.onPreviewError}
                config={{
                  file: { attributes: { crossOrigin: 'anonymous' } },
                  hlsOptions: { maxBufferLength: 4, maxMaxBufferLength: 8 },
                }}
              />
            </div>
          ) }
          { hasRuler && (
            <>
              <div
                aria-label="Drive timeline"
                role="slider"
                tabIndex={0}
                ref={ this.onRulerRef }
                className={classes.ruler}
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.handlePointerUp}
                onPointerMove={this.handlePointerMove}
                onPointerLeave={this.handlePointerLeave}
              >
                <div ref={this.rulerRemaining} className={classes.rulerRemaining} />
                { draggerStyle && <div ref={this.dragBar} className={classes.dragHighlight} style={draggerStyle} /> }
              </div>
              { hoverString && hasRuler && (
                <div ref={this.hoverBead} className={classes.hoverBead} style={hoverStyle}>
                  { hoverString }
                </div>
              ) }
            </>
          ) }
          { hoverPreviewStyle && createPortal(
            <div
              aria-label={`Frame preview at ${hoverString}`}
              role="img"
              className={classes.hoverPreview}
              style={hoverPreviewStyle}
            >
              <canvas ref={this.previewCanvas} width="512" height="320" className={classes.previewCanvas} />
              { !this.previewFrameReady && (
                <span className={classes.previewMessage}>
                  {this.previewError ? 'Preview unavailable' : 'Loading frame…'}
                </span>
              ) }
              <span className={classes.hoverPreviewLabel}>{hoverString}</span>
            </div>,
            document.body,
          ) }
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  zoom: state.zoom,
  loop: state.loop,
});

export default connect(stateToProps)(withStyles(styles)(Timeline));

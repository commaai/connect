// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import dayjs from 'dayjs';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import Colors from '../../colors';
import { currentOffset, subscribePlaybackFrames } from '../../timeline';
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
    position: 'relative',
    overflow: 'hidden',
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
});

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical',
];

function percentFromPointerEvent(ev) {
  const boundingBox = ev.currentTarget.getBoundingClientRect();
  if (!Number.isFinite(boundingBox.width) || boundingBox.width <= 0) return null;
  const x = ev.clientX - boundingBox.left;
  return Math.max(0, Math.min(1, x / boundingBox.width));
}

function validZoom(zoom) {
  return zoom && Number.isFinite(zoom.start) && Number.isFinite(zoom.end)
    && Number.isFinite(zoom.end - zoom.start) && zoom.end > zoom.start;
}

class Timeline extends Component {
  constructor(props) {
    super(props);

    this.getOffset = this.getOffset.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.onTimelineRef = this.onTimelineRef.bind(this);
    this.stopTouchPropagation = (ev) => ev.stopPropagation();
    this.pointers = new Map();
    this.pinch = null;
    this.pointerStart = null;
    this.pointerMoved = false;
    this.percentToOffset = this.percentToOffset.bind(this);
    this.segmentNum = this.segmentNum.bind(this);
    this.onRulerRef = this.onRulerRef.bind(this);
    this.renderRoute = this.renderRoute.bind(this);

    this.rulerRemaining = React.createRef();
    this.rulerRef = React.createRef();
    this.hoverBead = React.createRef();
    this.thumbnailsRef = React.createRef();

    const { zoomOverride, zoom } = this.props;
    this.state = {
      hoverX: null,
      zoom: zoomOverride || zoom,
      thumbnail: {
        height: 0,
        width: 0,
      },
    };
  }

  componentDidMount() {
    this.mounted = true;
    this.unsubscribePlayback = subscribePlaybackFrames(this.getOffset);
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

  componentDidUpdate(prevProps) {
    const { zoomOverride, zoom } = this.props;
    if (prevProps.zoomOverride !== zoomOverride || prevProps.zoom !== zoom) {
      this.clearPointers();
      this.setState({ zoom: zoomOverride || zoom, hoverX: null }, this.getOffset);
    }
    if (prevProps.hasRuler !== this.props.hasRuler) this.onTimelineRef(this.timelineElement);
  }

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribePlayback?.();
    this.clearPointers();
    this.onTimelineRef(null);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  handleClick(ev) {
    const percent = percentFromPointerEvent(ev);
    if (percent !== null && validZoom(this.state.zoom)) this.props.dispatch(seek(this.percentToOffset(percent)));
  }

  handlePointerDown(ev) {
    if (ev.button !== 0 || this.pointers.size >= 2 || !validZoom(this.state.zoom)) {
      return;
    }

    ev.preventDefault();
    if (!this.pointers.size) {
      document.addEventListener('pointerup', this.handlePointerUp);
      document.addEventListener('pointermove', this.handlePointerMove);
      document.addEventListener('pointercancel', this.handlePointerCancel);
    }
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this.pointers.size === 2) {
      const points = [...this.pointers.values()];
      const rect = this.rulerRef.current.getBoundingClientRect();
      if (rect.width <= 0) { this.handlePointerCancel(); return; }
      const fraction = Math.max(0, Math.min(1, ((points[0].x + points[1].x) / 2 - rect.left) / rect.width));
      this.pinch = { distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)), zoom: this.state.zoom, anchor: this.percentToOffset(fraction) };
      this.setState({ hoverX: null });
    } else {
      this.pointerStart = { x: ev.clientX, y: ev.clientY };
      this.pointerMoved = false;
    }
  }

  handlePointerMove(ev) {
    if (ev.currentTarget === document && this.timelineElement?.contains(ev.target)) return;
    const tracked = this.pointers.has(ev.pointerId);
    if (ev.currentTarget === document && !tracked) return;
    if (tracked) {
      ev.preventDefault();
      this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    }
    if (!this.rulerRef.current) {
      return;
    }
    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    if (!Number.isFinite(rulerBounds.width) || rulerBounds.width <= 0) return;
    if (this.pinch) {
      if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        const fraction = Math.max(0, Math.min(1, ((points[0].x + points[1].x) / 2 - rulerBounds.left) / rulerBounds.width));
        this.zoomView(this.pinch.distance / Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)), fraction, this.pinch.zoom, this.pinch.anchor);
      }
      return;
    }
    const endDrag = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, ev.clientX));
    if (tracked && Math.hypot(ev.clientX - this.pointerStart.x, ev.clientY - this.pointerStart.y) > 3) this.pointerMoved = true;
    this.setState({ hoverX: endDrag });
  }

  handlePointerUp(ev) {
    if (!this.pointers.has(ev.pointerId)) return;
    this.pointers.delete(ev.pointerId);
    if (this.pinch) {
      if (!this.pointers.size) this.clearPointers();
      return;
    }

    // prevent preventDefault for back(3) and forward(4) mouse buttons
    if (ev.button !== 3 && ev.button !== 4) {
      ev.preventDefault();
    }

    const click = !this.pointerMoved && Math.hypot(ev.clientX - this.pointerStart.x, ev.clientY - this.pointerStart.y) <= 3;
    this.clearPointers();
    if (click && ev.currentTarget !== document) this.handleClick(ev);
  }

  handlePointerLeave() {
    this.setState({ hoverX: null });
  }

  clearPointers() {
    this.pointers.clear();
    this.pinch = null;
    this.pointerStart = null;
    this.pointerMoved = false;
    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  handlePointerCancel(ev) {
    if (ev?.pointerId !== undefined && !this.pointers.has(ev.pointerId)) return;
    this.clearPointers();
    this.setState({ hoverX: null });
  }

  zoomView(factor, fraction, current = this.state.zoom, anchor = current?.start + fraction * (current?.end - current?.start)) {
    const base = this.props.zoomOverride || this.props.zoom;
    if (!validZoom(base) || !validZoom(current) || ![factor, fraction, anchor].every(Number.isFinite) || factor <= 0) return;
    const span = Math.max(Math.min(1000, base.end - base.start), Math.min(base.end - base.start, (current.end - current.start) * factor));
    if (!Number.isFinite(span) || span <= 0) return;
    const start = Math.max(base.start, Math.min(base.end - span, anchor - fraction * span));
    this.setState({ zoom: { start, end: start + span }, hoverX: null }, this.getOffset);
  }

  handleWheel(ev) {
    if (!ev.deltaY || !validZoom(this.state.zoom) || !validZoom(this.props.zoomOverride || this.props.zoom) || !this.rulerRef.current) return;
    const rect = this.rulerRef.current.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return;
    ev.preventDefault();
    this.clearPointers();
    const fraction = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    const delta = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? rect.width : 1);
    this.zoomView(Math.exp(Math.max(-1000, Math.min(1000, delta)) * 0.002), fraction);
  }

  handleKeyDown(ev) {
    const { zoom } = this.state;
    if (!validZoom(zoom)) return;
    if (['+', '=', '-', '0'].includes(ev.key)) {
      ev.preventDefault();
      const base = this.props.zoomOverride || this.props.zoom;
      this.clearPointers();
      if (ev.key === '0') this.setState({ zoom: base, hoverX: null }, this.getOffset);
      else this.zoomView(ev.key === '-' ? 1.25 : 0.8, 0.5);
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
      ev.preventDefault();
      const offset = ev.key === 'Home' ? zoom.start : ev.key === 'End' ? zoom.end : currentOffset() + (ev.key === 'ArrowLeft' ? -1000 : 1000);
      this.props.dispatch(seek(Math.max(zoom.start, Math.min(zoom.end, offset))));
    } else if (ev.key === 'Escape') this.handlePointerCancel();
  }

  onTimelineRef(el) {
    if (this.timelineElement) {
      this.timelineElement.removeEventListener('wheel', this.handleWheel);
      this.timelineElement.removeEventListener('touchstart', this.stopTouchPropagation);
    }
    this.timelineElement = el;
    if (el && this.props.hasRuler) {
      el.addEventListener('wheel', this.handleWheel, { passive: false });
      el.addEventListener('touchstart', this.stopTouchPropagation);
    }
  }

  onRulerRef(el) {
    this.rulerRef.current = el;
  }

  getOffset() {
    if (!this.mounted) {
      return;
    }
    let offset = currentOffset();
    offset = Math.floor(offset);
    if (!Number.isFinite(offset) || !validZoom(this.state.zoom)) return;
    const percent = Math.max(0, Math.min(1, this.offsetToPercent(offset)));
    this.rulerRef.current?.setAttribute('aria-valuenow', String(Math.round(Math.max(this.state.zoom.start, Math.min(this.state.zoom.end, offset)) / 1000)));
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
    const { thumbnail, hoverX, zoom } = this.state;

    const hasRulerCls = hasRuler ? 'hasRuler' : '';

    let rulerBounds;
    if (this.rulerRef.current) {
      rulerBounds = this.rulerRef.current.getBoundingClientRect();
    }

    let hoverString; let
      hoverStyle;
    if (rulerBounds && hoverX && route) {
      const hoverOffset = this.percentToOffset((hoverX - rulerBounds.x) / rulerBounds.width);
      hoverStyle = { left: Math.max(-10, Math.min(rulerBounds.width - 70, hoverX - rulerBounds.x - 40)) };
      if (!Number.isNaN(hoverOffset)) {
        hoverString = dayjs(route.start_time_utc_millis + hoverOffset).format('HH:mm:ss');
        const segNum = this.segmentNum(hoverOffset);
        if (segNum !== null) {
          hoverString = `${segNum}, ${hoverString}`;
        }
      }
    }


    const baseWidthStyle = { width: '100%' };

    return (
      <div className={className}>
        <div role="presentation" ref={this.onTimelineRef} className={ `${classes.base} ${hasRulerCls}` }
          style={hasRuler ? { ...baseWidthStyle, touchAction: 'none' } : baseWidthStyle}
          onPointerDown={hasRuler ? this.handlePointerDown : undefined}
          onPointerUp={hasRuler ? this.handlePointerUp : undefined}
          onPointerMove={hasRuler ? this.handlePointerMove : undefined}
          onPointerCancel={hasRuler ? this.handlePointerCancel : undefined}
          onPointerLeave={hasRuler ? this.handlePointerLeave : undefined}>
          <div className={ `${classes.segments} ${hasRulerCls}` }>
            { route && this.renderRoute() }
            <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
          </div>
          <div ref={this.thumbnailsRef} className={`${classes.thumbnails} ${hasRulerCls}`}>
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
          { hasRuler && (
            <>
              <div
                aria-label="Drive timeline"
                role="slider"
                aria-valuemin={zoom?.start / 1000}
                aria-valuemax={zoom?.end / 1000}
                tabIndex={0}
                title="Scroll or pinch to zoom. Click to seek. Press +, - or 0 to zoom or reset."
                ref={ this.onRulerRef }
                className={classes.ruler}
                onKeyDown={this.handleKeyDown}
              >
                <div ref={this.rulerRemaining} className={classes.rulerRemaining} />
              </div>
              { hoverString && (
                <div ref={this.hoverBead} className={classes.hoverBead} style={hoverStyle}>
                  { hoverString }
                </div>
              ) }
            </>
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

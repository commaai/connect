// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import dayjs from 'dayjs';

import Thumbnails from './thumbnails';
import Overview, { clampView } from './Overview';
import theme from '../../theme';
import { pushTimelineRange, seek } from '../../actions';
import Colors from '../../colors';
import { currentOffset, seek as seekVideo } from '../../timeline';
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
    position: 'absolute',
    left: 0,
    height: 44,
    opacity: 0.8,
    pointerEvents: 'none',
    width: '100%',
  },
  playhead: {
    position: 'absolute',
    left: 0,
    height: 48,
    marginLeft: -1,
    borderLeft: `2px solid ${Colors.white}`,
    pointerEvents: 'none',
    zIndex: 3,
  },
  // below the bar so a finger dragging it does not cover the timeline
  playheadHandle: {
    position: 'absolute',
    top: 44,
    left: -1,
    width: 32,
    height: 24,
    transform: 'translateX(-50%)',
    pointerEvents: 'auto',
    touchAction: 'none',
    cursor: 'grab',
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 2,
      left: '50%',
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: Colors.white,
      boxShadow: '0 0 0 3px rgba(0, 0, 0, 0.35)',
      transform: 'translateX(-50%)',
      transition: 'transform 0.15s ease-out',
    },
    '&.scrubbing::after': {
      transform: 'translateX(-50%) scale(1.4)',
    },
  },
  segmentTick: {
    position: 'absolute',
    height: 44,
    borderLeft: `1px solid ${Colors.white20}`,
    pointerEvents: 'none',
    zIndex: 2,
    '& > button': {
      position: 'absolute',
      top: 0,
      left: 0,
      minWidth: 24,
      padding: '2px 3px 6px',
      textAlign: 'left',
      fontSize: 10,
      color: Colors.white60,
      userSelect: 'none',
      pointerEvents: 'auto',
      cursor: 'pointer',
      '&:hover': {
        color: Colors.white,
      },
    },
    '&.minor': {
      height: 8,
      marginTop: 36,
    },
  },
  detailEvents: {
    position: 'absolute',
    width: '100%',
    height: 12,
    marginTop: 32,
    overflow: 'hidden',
    zIndex: 1,
    cursor: 'pointer',
  },
  selection: {
    position: 'absolute',
    height: 44,
    background: 'rgba(255, 255, 255, 0.08)',
    borderLeft: `1px solid ${Colors.white40}`,
    borderRight: `1px solid ${Colors.white40}`,
    pointerEvents: 'none',
    zIndex: 1,
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
    top: 6, // above the bar, clear of a finger on the playhead handle
    left: 0,
    minWidth: 80,
    whiteSpace: 'nowrap',
  },
});

// how close to the playhead line a press on the bar grabs it, in pixels;
// the handle below the bar has its own, larger target
const PLAYHEAD_GRAB_RADIUS = 6;
const SEGMENT_DURATION = 60 * 1000;
// minimum room for a segment number label, in pixels
const SEGMENT_LABEL_SPACING = 28;
// after the lens is moved by hand, playback leaves it alone for this long
const MANUAL_VIEW_GRACE = 2000;
// selection edges snap to event and segment edges this close, in pixels
const SNAP_DISTANCE = 10;

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical',
];

// events that span a stretch of the drive, drawn as colored bands
function rangedEvents(route) {
  return (route?.events || []).filter((event) => event.data && event.data.end_route_offset_millis);
}

function percentFromPointerEvent(ev) {
  const boundingBox = ev.currentTarget.getBoundingClientRect();
  const x = ev.pageX - boundingBox.left;
  return x / boundingBox.width;
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
    this.percentToOffset = this.percentToOffset.bind(this);
    this.segmentNum = this.segmentNum.bind(this);
    this.onRulerRef = this.onRulerRef.bind(this);
    this.renderRoute = this.renderRoute.bind(this);
    this.setView = this.setView.bind(this);
    this.onRulerWheel = this.onRulerWheel.bind(this);

    this.rulerRemaining = React.createRef();
    this.playhead = React.createRef();
    this.rulerRef = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();
    this.thumbnailsRef = React.createRef();
    this.overviewPlayhead = React.createRef();
    this.manualViewAt = 0;

    const { zoomOverride, zoom } = this.props;
    this.state = {
      dragging: null,
      scrubbing: false,
      hoverX: null,
      view: zoomOverride || zoom, // the part of the drive the timeline shows
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

  componentDidUpdate(prevProps) {
    const { zoomOverride, zoom, route } = this.props;
    if (zoomOverride) {
      if (prevProps.zoomOverride !== zoomOverride) {
        this.setState({ view: zoomOverride });
      }
    } else if (prevProps.route?.fullname !== route?.fullname || (!this.state.view && zoom)) {
      // a new drive opens on its selection; after that, selecting no longer zooms
      this.setState({ view: zoom });
    }
  }

  setView(view, manual = true) {
    if (manual) {
      this.manualViewAt = Date.now();
    }
    this.setState({ view });
  }

  componentWillUnmount() {
    this.mounted = false;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
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

    // pressing on the playhead drags it, anywhere else selects a range
    const playhead = this.playhead.current?.getBoundingClientRect();
    const onHandle = this.playhead.current?.contains(ev.target);
    if (onHandle || (playhead && Math.abs(ev.clientX - playhead.left) <= PLAYHEAD_GRAB_RADIUS)) {
      this.setState({ scrubbing: true, hoverX: ev.pageX });
    } else {
      const x = this.snapX(ev.pageX);
      this.setState({ dragging: [x, x] });
    }
    // a tap on a segment number or an event band selects it, a drag from there still selects freely
    this.pressedSegment = ev.target.closest('[data-segment]')?.dataset.segment;
    this.pressedEvents = Boolean(ev.target.closest('[data-events]'));
  }

  // pull x onto a nearby event edge, or failing that a segment edge
  snapX(x) {
    const { route } = this.props;
    const { view } = this.state;
    const bounds = this.rulerRef.current.getBoundingClientRect();
    const offset = this.offsetAtX(x);
    const reach = (SNAP_DISTANCE * (view.end - view.start)) / bounds.width;
    const nearest = (edges) => edges
      .filter((edge) => Math.abs(edge - offset) <= reach)
      .sort((a, b) => Math.abs(a - offset) - Math.abs(b - offset))[0];

    const segmentEdges = [route.duration];
    for (let edge = 0; edge < route.duration; edge += SEGMENT_DURATION) {
      segmentEdges.push(edge);
    }
    const eventEdges = rangedEvents(route).flatMap((event) => [event.route_offset_millis, event.data.end_route_offset_millis]);

    const edge = nearest(eventEdges) ?? nearest(segmentEdges);
    return edge === undefined ? x : bounds.x + (this.offsetToPercent(edge) * bounds.width);
  }

  // select the event band under the pointer (the shortest one, where they overlap)
  selectEventAt(x) {
    const { dispatch, route } = this.props;
    const offset = this.offsetAtX(x);
    const event = rangedEvents(route)
      .filter((ev) => ev.route_offset_millis <= offset && offset <= ev.data.end_route_offset_millis)
      .sort((a, b) => (a.data.end_route_offset_millis - a.route_offset_millis) - (b.data.end_route_offset_millis - b.route_offset_millis))[0];
    if (event) {
      dispatch(pushTimelineRange(route.log_id, event.route_offset_millis, event.data.end_route_offset_millis, true));
    }
  }

  offsetAtX(x) {
    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const clampedX = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, x));
    return this.percentToOffset((clampedX - rulerBounds.x) / rulerBounds.width);
  }

  handlePointerMove(ev) {
    ev.preventDefault();
    const { dragging } = this.state;
    if (!this.rulerRef.current) {
      return;
    }
    ev.preventDefault();

    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const endDrag = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, ev.pageX));
    if (dragging) {
      this.setState({ dragging: [dragging[0], this.snapX(endDrag)] });
    }
    if (this.state.scrubbing) {
      seekVideo(this.offsetAtX(endDrag));
    }
    this.setState({ hoverX: endDrag });
  }

  handlePointerUp(ev) {
    const { route } = this.props;

    // prevent preventDefault for back(3) and forward(4) mouse buttons
    if (ev.button !== 3 && ev.button !== 4) {
      ev.preventDefault();
    }

    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointermove', this.handlePointerMove);
    if (this.state.scrubbing) {
      this.setState({ scrubbing: false, hoverX: ev.pointerType === 'mouse' ? ev.pageX : null });
      this.props.dispatch(seek(this.offsetAtX(ev.pageX)));
      return;
    }
    const { dragging } = this.state;
    if (!dragging) {
      return;
    }
    this.setState({ dragging: null });

    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const startPercent = (Math.min(dragging[0], dragging[1]) - rulerBounds.x) / rulerBounds.width;
    const endPercent = (Math.max(dragging[0], dragging[1]) - rulerBounds.x) / rulerBounds.width;
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
    } else if (this.pressedSegment !== undefined) {
      this.selectSegment(Number(this.pressedSegment));
    } else if (this.pressedEvents) {
      this.selectEventAt(ev.pageX);
    } else if (ev.currentTarget !== document) {
      this.handleClick(ev);
    }
  }

  handlePointerLeave() {
    this.setState({ hoverX: null });
  }

  onRulerRef(el) {
    this.rulerRef.current = el;
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
      el.addEventListener('wheel', this.onRulerWheel, { passive: false });
    }
  }

  // pinch on a trackpad (or ctrl + wheel) zooms around the pointer
  onRulerWheel(ev) {
    if (!ev.ctrlKey && !ev.metaKey) {
      return;
    }
    ev.preventDefault();
    const { view } = this.state;
    const anchor = this.offsetAtX(ev.pageX);
    const scale = Math.exp(ev.deltaY * 0.01);
    this.setView(clampView(
      anchor - ((anchor - view.start) * scale),
      anchor + ((view.end - anchor) * scale),
      this.props.route.duration,
    ));
  }

  getOffset() {
    if (!this.mounted) {
      return;
    }
    requestAnimationFrame(this.getOffset);
    const offset = currentOffset();
    const { route } = this.props;
    const { view } = this.state;
    if (!view) {
      return;
    }
    if (this.overviewPlayhead.current && route?.duration) {
      this.overviewPlayhead.current.style.left = `${(100 * offset) / route.duration}%`;
      // keep the playhead in sight, unless the lens was just moved by hand
      const width = view.end - view.start;
      if ((offset < view.start || offset > view.end) && Date.now() - this.manualViewAt > MANUAL_VIEW_GRACE) {
        this.setView(clampView(offset - (width / 4), offset + (width * 3 / 4), route.duration), false);
      }
    }
    const percent = Math.floor(10000 * this.offsetToPercent(Math.floor(offset))) / 100;
    if (this.rulerRemaining.current && this.rulerRemaining.current.parentElement) {
      this.rulerRemaining.current.style.left = `${percent}%`;
      this.rulerRemaining.current.style.width = `${100 - percent}%`;
    }
    if (this.playhead.current) {
      this.playhead.current.style.left = `${percent}%`;
    }
  }

  percentToOffset(perc) {
    const { view } = this.state;
    return perc * (view.end - view.start) + view.start;
  }

  offsetToPercent(offset) {
    const { view } = this.state;
    return (offset - view.start) / (view.end - view.start);
  }

  segmentNum(offset) {
    const { route } = this.props;
    if (route) {
      return getSegmentNumber(route, offset);
    }
    return null;
  }

  renderRoute(view = this.state.view) {
    const { classes, route } = this.props;

    if (!route.events) {
      return null;
    }

    const viewDuration = view.end - view.start;
    const startPerc = (100 * (-view.start)) / viewDuration;
    const widthPerc = (100 * route.duration) / viewDuration;

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

    return rangedEvents(route)
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

  // zoom on a segment and select it, ready to loop, upload or open in cabana
  selectSegment(segment) {
    const { dispatch, route } = this.props;
    const start = segment * SEGMENT_DURATION;
    const end = Math.min(start + SEGMENT_DURATION, route.duration);
    const margin = (end - start) / 6;
    this.setView(clampView(start - margin, end + margin, route.duration));
    dispatch(pushTimelineRange(route.log_id, start, end, true));
  }

  // a tick at every segment start, numbered (and selectable) as often as there is room for
  renderSegmentTicks() {
    const { classes, route } = this.props;
    const { view, thumbnail } = this.state;
    if (!route?.duration || !thumbnail.width) {
      return null;
    }

    const segmentWidth = (thumbnail.width * SEGMENT_DURATION) / (view.end - view.start);
    const labelEvery = [1, 2, 5, 10, 20, 50].find((n) => n * segmentWidth >= SEGMENT_LABEL_SPACING) || 100;
    const ticks = [];
    const end = Math.min(view.end, route.duration);
    for (let segment = Math.ceil(view.start / SEGMENT_DURATION); segment * SEGMENT_DURATION < end; segment++) {
      const labeled = segment % labelEvery === 0;
      ticks.push(
        <div
          key={segment}
          className={`${classes.segmentTick} ${labeled ? '' : 'minor'}`}
          style={{ left: `${this.offsetToPercent(segment * SEGMENT_DURATION) * 100}%` }}
        >
          {labeled && (
            <button
              type="button"
              data-segment={segment}
              aria-label={`Select segment ${segment}`}
              // pointer taps are handled by the ruler, this is for the keyboard
              onClick={(ev) => ev.detail === 0 && this.selectSegment(segment)}
            >
              {segment}
            </button>
          )}
        </div>,
      );
    }
    return ticks;
  }

  // the selection, unless it is the whole drive
  partialSelection() {
    const { zoom, route } = this.props;
    if (!zoom || !route || (zoom.start <= 0 && zoom.end >= route.duration)) {
      return null;
    }
    return zoom;
  }

  renderOverview() {
    const { route } = this.props;
    const { view } = this.state;
    const whole = { start: 0, end: route.duration };
    const zoomed = view.start > 0 || view.end < route.duration;
    return (
      <div className="relative">
        <Overview
          duration={route.duration}
          view={view}
          selection={this.partialSelection()}
          playheadRef={this.overviewPlayhead}
          onViewChange={this.setView}
          onSeek={(offset) => this.props.dispatch(seek(offset))}
        >
          { this.renderRoute(whole) }
        </Overview>
        { zoomed && (
          <button
            type="button"
            className="absolute right-1 top-6 z-10 whitespace-nowrap rounded-full bg-[#1D2225]/90 px-2 text-xs leading-5 text-white/80 hover:text-white"
            onClick={() => this.setView(whole)}
          >
            whole drive
          </button>
        ) }
      </div>
    );
  }

  renderSelection() {
    const { classes } = this.props;
    const selection = this.partialSelection();
    if (!selection) {
      return null;
    }
    const left = Math.max(0, this.offsetToPercent(selection.start));
    const right = Math.min(1, this.offsetToPercent(selection.end));
    if (right <= 0 || left >= 1) {
      return null;
    }
    return <div className={classes.selection} style={{ left: `${left * 100}%`, width: `${(right - left) * 100}%` }} />;
  }

  render() {
    const { classes, hasRuler, className, route, thumbnailsVisible } = this.props;
    const { thumbnail, hoverX, dragging, scrubbing, view } = this.state;
    if (!view) {
      return null;
    }

    const hasRulerCls = hasRuler ? 'hasRuler' : '';

    let rulerBounds;
    if (this.rulerRef.current) {
      rulerBounds = this.rulerRef.current.getBoundingClientRect();
    }

    let hoverString; let
      hoverStyle;
    if (rulerBounds && hoverX) {
      const hoverOffset = this.percentToOffset((hoverX - rulerBounds.x) / rulerBounds.width);
      hoverStyle = { left: Math.max(-10, Math.min(rulerBounds.width - 70, hoverX - rulerBounds.x - 40)) };
      if (!Number.isNaN(hoverOffset)) {
        hoverString = dayjs(route.start_time_utc_millis + hoverOffset).format('HH:mm:ss');
        const segNum = this.segmentNum(hoverOffset);
        if (segNum !== null) {
          hoverString = `seg ${segNum} · ${hoverString}`;
        }
      }
    }

    let draggerStyle;
    if (rulerBounds && dragging && Math.abs(dragging[1] - dragging[0]) > 0) {
      draggerStyle = {
        left: `${Math.min(dragging[1], dragging[0]) - rulerBounds.x}px`,
        width: `${Math.abs(dragging[1] - dragging[0])}px`,
      };
    }

    const baseWidthStyle = { width: '100%' };

    return (
      <div className={className}>
        <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } style={ baseWidthStyle }>
          { hasRuler && route ? this.renderOverview() : (
            <div className={ `${classes.segments} ${hasRulerCls}` }>
              { route && this.renderRoute() }
              <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
            </div>
          ) }
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
                tabIndex={0}
                ref={ this.onRulerRef }
                className={classes.ruler}
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.handlePointerUp}
                onPointerMove={this.handlePointerMove}
                onPointerLeave={this.handlePointerLeave}
              >
                <div ref={this.rulerRemaining} className={classes.rulerRemaining} />
                <div data-events className={classes.detailEvents}>
                  { route && this.renderRoute() }
                </div>
                { this.renderSelection() }
                { this.renderSegmentTicks() }
                <div ref={this.playhead} className={classes.playhead}>
                  <div className={`${classes.playheadHandle} ${scrubbing ? 'scrubbing' : ''}`} />
                </div>
                { draggerStyle && <div ref={this.dragBar} className={classes.dragHighlight} style={draggerStyle} /> }
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

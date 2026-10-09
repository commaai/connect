// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import dayjs from 'dayjs';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import { previewTimelineRange, pushTimelineRange, seek } from '../../actions';
import Colors from '../../colors';
import { currentOffset, seek as seekVideo } from '../../timeline';
import { getSegmentNumber } from '../../utils';

// room either side of the drive timeline, clear of browser edge gestures and the media buttons
const TIMELINE_PADDING = 24;

const styles = () => ({
  // a long drive scrolls sideways rather than squeezing its segments
  scroller: {
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'thin',
  },
  scrollContent: {
    // the bottom room is for the playhead handle hanging below the bar
    padding: `0 ${TIMELINE_PADDING}px 44px`,
  },
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
    height: 40,
    width: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '& > div': {
      display: 'inline-block',
    },
    // the drive's storyboard, a little bigger than in the drive list
    '&.hasRuler': {
      height: 52,
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
    width: 44,
    height: 44,
    transform: 'translateX(-50%)',
    pointerEvents: 'auto',
    touchAction: 'none',
    cursor: 'grab',
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 8,
      left: '50%',
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: Colors.white,
      boxShadow: '0 0 0 3px rgba(0, 0, 0, 0.35)',
      transform: 'translateX(-50%)',
    },
    '&.scrubbing': {
      cursor: 'grabbing',
    },
  },
  segmentTick: {
    position: 'absolute',
    height: 44,
    borderLeft: `1px solid ${Colors.white20}`,
    pointerEvents: 'none',
    zIndex: 2,
    // a label only: a tap anywhere on the segment selects it
    '& > span': {
      position: 'absolute',
      top: 0,
      left: 0,
      padding: '2px 3px',
      fontSize: 10,
      color: Colors.white60,
      userSelect: 'none',
    },
  },
  detailEvents: {
    position: 'absolute',
    width: '100%',
    height: 12,
    marginTop: 32,
    overflow: 'hidden',
    zIndex: 1,
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

const SEGMENT_DURATION = 60 * 1000;
// the narrowest a segment gets, in pixels, with room for its number and a finger
const SEGMENT_MIN_WIDTH = 32;
// how long the timeline stays where the user scrolled it before following playback again
const SCROLL_TIMEOUT = 5000;

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical',
];

// keep a view of the given width inside the drive
function clampView(start, end, duration) {
  const width = Math.min(duration, end - start);
  const clampedStart = Math.min(Math.max(0, start), duration - width);
  return { start: clampedStart, end: clampedStart + width };
}

class Timeline extends Component {
  constructor(props) {
    super(props);

    this.getOffset = this.getOffset.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.showWholeDrive = this.showWholeDrive.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.percentToOffset = this.percentToOffset.bind(this);
    this.segmentNum = this.segmentNum.bind(this);
    this.onRulerRef = this.onRulerRef.bind(this);
    this.renderRoute = this.renderRoute.bind(this);

    this.rulerRemaining = React.createRef();
    this.playhead = React.createRef();
    this.rulerRef = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();
    this.thumbnailsRef = React.createRef();
    this.scrollerRef = React.createRef();
    this.activePointerId = null;
    this.renderCache = {};
    this.userScrolledAt = -Infinity;
    this.scrollingTo = null;

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
      scrollerWidth: 0,
    };
  }

  componentDidMount() {
    this.mounted = true;
    // only the drive's own timeline shows playback; the drive list's ones stay still
    if (this.props.hasRuler) {
      requestAnimationFrame(this.getOffset);
    }
    this.componentDidUpdate({});

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        entries.forEach(({ target, contentRect }) => {
          if (target === this.thumbnailsRef.current) {
            this.setState({ thumbnail: { width: contentRect.width, height: contentRect.height } });
          } else {
            this.setState({ scrollerWidth: contentRect.width });
          }
        });
      });
      [this.thumbnailsRef.current, this.scrollerRef.current].forEach((el) => el && this.resizeObserver.observe(el));
    }
  }

  componentDidUpdate(prevProps) {
    const { zoomOverride, zoom, route } = this.props;
    // a drive opens on its selection; after that, selecting no longer zooms
    if (prevProps.zoomOverride !== zoomOverride || prevProps.route?.fullname !== route?.fullname || !this.state.view) {
      this.setState({ view: zoomOverride || zoom });
    } else if (!zoomOverride && route && !this.state.scrubbing
      && !this.partialSelection() && this.partialSelection(prevProps.zoom)) {
      // the selection is gone (back button, playhead dragged out of it): show the whole drive again
      this.setState({ view: { start: 0, end: route.duration } });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.releasePointer();
    if (this.state.dragging) {
      this.props.dispatch(previewTimelineRange(null, null));
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  handlePointerDown(ev) {
    if (ev.button !== 0 || ev.isPrimary === false || this.activePointerId !== null) {
      return;
    }

    ev.preventDefault();
    this.activePointerId = ev.pointerId;
    document.addEventListener('pointerup', this.handlePointerUp);
    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointercancel', this.handlePointerCancel);

    // only dragging the playhead handle moves playback; on the bar a tap selects
    // the segment under it and a drag selects a range
    if (this.playhead.current?.contains(ev.target)) {
      this.selectionReleased = false;
      // keep the handle where it was grabbed instead of jumping it under the finger
      const playheadX = this.playhead.current.getBoundingClientRect().x;
      this.scrub = { grab: ev.pageX - playheadX, startX: ev.pageX, moved: false };
      this.setState({ scrubbing: true, hoverX: playheadX });
    } else {
      this.setState({ dragging: [ev.pageX, ev.pageX] });
    }
  }

  offsetAtX(x) {
    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const clampedX = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, x));
    return this.percentToOffset((clampedX - rulerBounds.x) / rulerBounds.width);
  }

  handlePointerMove(ev) {
    if (this.activePointerId !== null && ev.pointerId !== this.activePointerId) {
      return;
    }
    const { dragging } = this.state;
    if (!this.rulerRef.current) {
      return;
    }
    ev.preventDefault();

    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const endDrag = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, ev.pageX));
    if (dragging) {
      this.setState({ dragging: [dragging[0], endDrag] });
      // show the range on the map while it is being dragged
      const start = this.offsetAtX(Math.min(dragging[0], endDrag));
      const end = this.offsetAtX(Math.max(dragging[0], endDrag));
      this.props.dispatch(previewTimelineRange(start, end));
    }
    if (this.state.scrubbing) {
      if (Math.abs(ev.pageX - this.scrub.startX) > 3) {
        this.scrub.moved = true;
      }
      if (this.scrub.moved) {
        const playheadX = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, ev.pageX - this.scrub.grab));
        this.scrubTo(this.offsetAtX(playheadX));
        this.setState({ hoverX: playheadX });
      }
      return;
    }
    this.setState({ hoverX: endDrag });
  }

  // the playhead can be dragged out of the selection, which then gives way to the whole drive
  scrubTo(offset) {
    const { dispatch, route } = this.props;
    const selection = this.partialSelection();
    if (!this.selectionReleased && selection && (offset < selection.start || offset > selection.end)) {
      this.selectionReleased = true;
      dispatch(pushTimelineRange(route.log_id, 0, route.duration, true));
    }
    seekVideo(offset);
  }

  handlePointerUp(ev) {
    if (this.activePointerId === null || ev.pointerId !== this.activePointerId) {
      return;
    }
    const { route } = this.props;

    // prevent preventDefault for back(3) and forward(4) mouse buttons
    if (ev.button !== 3 && ev.button !== 4) {
      ev.preventDefault();
    }

    this.releasePointer();
    if (this.state.scrubbing) {
      this.setState({ scrubbing: false, hoverX: null });
      // a tap on the handle leaves playback where it is
      if (this.scrub.moved) {
        const offset = this.offsetAtX(ev.pageX - this.scrub.grab);
        this.scrubTo(offset);
        this.props.dispatch(seek(offset));
      }
      return;
    }
    const { dragging } = this.state;
    if (!dragging) {
      return;
    }
    this.setState({ dragging: null });
    this.props.dispatch(previewTimelineRange(null, null));

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
    } else if (ev.currentTarget !== document) {
      this.selectSegmentAt(this.offsetAtX(ev.pageX));
    }
  }

  // zoom on the segment and select exactly it, ready to loop, upload or share
  selectSegmentAt(offset) {
    const { dispatch, route } = this.props;
    const start = Math.floor(offset / SEGMENT_DURATION) * SEGMENT_DURATION;
    const end = Math.min(start + SEGMENT_DURATION, route.duration);
    const margin = (end - start) / 6;
    this.setState({ view: clampView(start - margin, end + margin, route.duration) });
    dispatch(pushTimelineRange(route.log_id, start, end, true));
  }

  releasePointer() {
    this.activePointerId = null;
    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  handlePointerCancel(ev) {
    if (ev.pointerId !== this.activePointerId) {
      return;
    }
    this.releasePointer();
    this.setState({ dragging: null, scrubbing: false, hoverX: null });
    this.props.dispatch(previewTimelineRange(null, null));
  }

  handlePointerLeave() {
    this.setState({ hoverX: null });
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
    const offset = currentOffset();
    const { route } = this.props;
    const { view } = this.state;
    if (!view) {
      return;
    }
    // keep the playhead in sight on the main drive timeline
    if (this.props.hasRuler && route?.duration && (offset < view.start || offset > view.end)) {
      const width = view.end - view.start;
      const next = clampView(offset - (width / 4), offset + (width * 3 / 4), route.duration);
      if (next.start !== view.start || next.end !== view.end) {
        this.setState({ view: next });
      }
    }
    const percent = Math.floor(10000 * this.offsetToPercent(Math.floor(offset))) / 100;
    if (percent === this.lastPercent) {
      return; // paused, or moving less than the bar can show
    }
    this.lastPercent = percent;
    if (this.rulerRemaining.current && this.rulerRemaining.current.parentElement) {
      this.rulerRemaining.current.style.left = `${percent}%`;
      this.rulerRemaining.current.style.width = `${100 - percent}%`;
    }
    if (this.playhead.current) {
      this.playhead.current.style.left = `${percent}%`;
    }
    this.followPlayhead(percent);
  }

  // scroll a long drive to bring the playhead back into sight when playback leaves
  // the visible part, unless the user has just scrolled somewhere else
  followPlayhead(percent) {
    const scroller = this.scrollerRef.current;
    if (!scroller || !this.rulerRef.current || this.state.scrubbing || this.state.dragging
      || performance.now() - this.userScrolledAt < SCROLL_TIMEOUT) {
      return;
    }
    const x = TIMELINE_PADDING + ((percent / 100) * this.rulerRef.current.offsetWidth);
    const { scrollLeft, clientWidth } = scroller;
    if (x < scrollLeft || x > scrollLeft + clientWidth) {
      scroller.scrollLeft = x - (clientWidth / 4);
      this.scrollingTo = scroller.scrollLeft;
    }
  }

  // tell the user's scrolling from the timeline following playback
  handleScroll() {
    const { scrollLeft } = this.scrollerRef.current;
    if (this.scrollingTo !== null && Math.abs(scrollLeft - this.scrollingTo) <= 1) {
      this.scrollingTo = null;
      return;
    }
    this.userScrolledAt = performance.now();
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

  renderRoute() {
    const { classes, route } = this.props;
    const { view } = this.state;

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

  // a numbered tick at every segment start, so each one can be told apart and tapped
  renderSegmentTicks() {
    const { classes, route } = this.props;
    const { view } = this.state;
    if (!route?.duration) {
      return null;
    }

    const ticks = [];
    for (let segment = 0; segment * SEGMENT_DURATION < route.duration; segment += 1) {
      const start = segment * SEGMENT_DURATION;
      if (start < view.start || start > view.end) {
        continue;
      }
      ticks.push(
        <div
          key={segment}
          className={classes.segmentTick}
          style={{ left: `${this.offsetToPercent(start) * 100}%` }}
        >
          <span>{segment}</span>
        </div>,
      );
    }
    return ticks;
  }

  // The same elements as last time while their inputs are unchanged, so React skips
  // them: hovering and dragging re-render the timeline on every pointer move.
  cached(name, deps, render) {
    const entry = this.renderCache[name];
    if (entry && entry.deps.every((dep, i) => dep === deps[i])) {
      return entry.elements;
    }
    const elements = render();
    this.renderCache[name] = { deps, elements };
    return elements;
  }

  // the selection, unless it is the whole drive
  partialSelection(zoom = this.props.zoom) {
    const { route } = this.props;
    if (!zoom || !route || (zoom.start <= 0 && zoom.end >= route.duration)) {
      return null;
    }
    return zoom;
  }

  // zoom out and drop the selection, carrying on from where playback is
  showWholeDrive() {
    const { dispatch, route } = this.props;
    this.setState({ view: { start: 0, end: route.duration } });
    if (this.partialSelection()) {
      const offset = currentOffset();
      dispatch(pushTimelineRange(route.log_id, 0, route.duration, true));
      seekVideo(offset);
    }
  }

  // a way back out of a zoomed view or a selection
  renderWholeDriveButton() {
    const { route } = this.props;
    const { view } = this.state;
    if (view.start <= 0 && view.end >= route.duration && !this.partialSelection()) {
      return null;
    }
    return (
      <button
        type="button"
        className="absolute right-7 top-1 z-10 whitespace-nowrap rounded-full bg-[#1D2225]/90 px-2 text-xs leading-5 text-white/80 hover:text-white"
        onClick={this.showWholeDrive}
      >
        whole drive
      </button>
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
    const { thumbnail, hoverX, dragging, scrubbing, view, scrollerWidth } = this.state;
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

    const base = (
      <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } style={ baseWidthStyle }>
        { !(hasRuler && route) && (
          <div className={ `${classes.segments} ${hasRulerCls}` }>
            { route && this.cached('route', [route, route.events, view], this.renderRoute) }
            <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
          </div>
        ) }
        <div ref={this.thumbnailsRef} className={`${classes.thumbnails} ${hasRulerCls}`}>
          {thumbnailsVisible && this.cached('thumbnails', [route, view, thumbnail], () => (
            <Thumbnails
              className={classes.thumbnail}
              currentRoute={route}
              percentToOffset={this.percentToOffset}
              thumbnail={thumbnail}
              hasRuler={hasRuler}
            />
          ))}
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
              <div className={classes.detailEvents}>
                { route && this.cached('route', [route, route.events, view], this.renderRoute) }
              </div>
              { this.renderSelection() }
              { this.cached('ticks', [route, view], () => this.renderSegmentTicks()) }
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
    );

    if (!hasRuler) {
      return <div className={className || ''}>{base}</div>;
    }

    // wider than the screen when the segments would not fit at their minimum width
    let contentWidth;
    if (scrollerWidth) {
      const segments = (view.end - view.start) / SEGMENT_DURATION;
      contentWidth = Math.max(scrollerWidth, (segments * SEGMENT_MIN_WIDTH) + (2 * TIMELINE_PADDING));
    }
    return (
      <div className={`relative ${className || ''}`}>
        { route && this.renderWholeDriveButton() }
        <div ref={this.scrollerRef} className={classes.scroller} onScroll={this.handleScroll}>
          <div className={classes.scrollContent} style={{ width: contentWidth }}>
            {base}
          </div>
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

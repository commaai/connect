// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import dayjs from 'dayjs';

import Thumbnails from './thumbnails';
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
    '& > span': {
      position: 'absolute',
      top: 2,
      left: 3,
      fontSize: 10,
      color: Colors.white60,
      userSelect: 'none',
    },
    '&.minor': {
      height: 8,
      marginTop: 36,
    },
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

// how close to the playhead a press grabs it, in pixels
const PLAYHEAD_GRAB_RADIUS = 24;
const SEGMENT_DURATION = 60 * 1000;
// minimum room for a segment number label, in pixels
const SEGMENT_LABEL_SPACING = 28;

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical',
];

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

    this.rulerRemaining = React.createRef();
    this.playhead = React.createRef();
    this.rulerRef = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();
    this.thumbnailsRef = React.createRef();

    const { zoomOverride, zoom } = this.props;
    this.state = {
      dragging: null,
      scrubbing: false,
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
    const { zoomOverride, zoom } = this.props;
    if (prevProps.zoomOverride !== zoomOverride || prevProps.zoom !== zoom) {
      this.setState({ zoom: zoomOverride || zoom });
    }
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
    if (playhead && Math.abs(ev.clientX - playhead.left) <= PLAYHEAD_GRAB_RADIUS) {
      this.setState({ scrubbing: true, hoverX: ev.pageX });
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
    ev.preventDefault();
    const { dragging } = this.state;
    if (!this.rulerRef.current) {
      return;
    }
    ev.preventDefault();

    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const endDrag = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, ev.pageX));
    if (dragging) {
      this.setState({ dragging: [dragging[0], endDrag] });
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
    }
  }

  getOffset() {
    if (!this.mounted) {
      return;
    }
    requestAnimationFrame(this.getOffset);
    const percent = Math.floor(10000 * this.offsetToPercent(Math.floor(currentOffset()))) / 100;
    if (this.rulerRemaining.current && this.rulerRemaining.current.parentElement) {
      this.rulerRemaining.current.style.left = `${percent}%`;
      this.rulerRemaining.current.style.width = `${100 - percent}%`;
    }
    if (this.playhead.current) {
      this.playhead.current.style.left = `${percent}%`;
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

  // a tick at every segment start, numbered as often as there is room for
  renderSegmentTicks() {
    const { classes, route } = this.props;
    const { zoom, thumbnail } = this.state;
    if (!route?.duration || !thumbnail.width) {
      return null;
    }

    const segmentWidth = (thumbnail.width * SEGMENT_DURATION) / (zoom.end - zoom.start);
    const labelEvery = [1, 2, 5, 10, 20, 50].find((n) => n * segmentWidth >= SEGMENT_LABEL_SPACING) || 100;
    const ticks = [];
    const end = Math.min(zoom.end, route.duration);
    for (let segment = Math.ceil(zoom.start / SEGMENT_DURATION); segment * SEGMENT_DURATION < end; segment++) {
      const labeled = segment % labelEvery === 0;
      ticks.push(
        <div
          key={segment}
          className={`${classes.segmentTick} ${labeled ? '' : 'minor'}`}
          style={{ left: `${this.offsetToPercent(segment * SEGMENT_DURATION) * 100}%` }}
        >
          {labeled && <span>{segment}</span>}
        </div>,
      );
    }
    return ticks;
  }

  render() {
    const { classes, hasRuler, className, route, thumbnailsVisible } = this.props;
    const { thumbnail, hoverX, dragging, scrubbing } = this.state;

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
                tabIndex={0}
                ref={ this.onRulerRef }
                className={classes.ruler}
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.handlePointerUp}
                onPointerMove={this.handlePointerMove}
                onPointerLeave={this.handlePointerLeave}
              >
                <div ref={this.rulerRemaining} className={classes.rulerRemaining} />
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

// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import dayjs from 'dayjs';

import Thumbnails, { thumbnailAt } from './thumbnails';
import theme from '../../theme';
import { pushTimelineRange } from '../../actions';
import Colors from '../../colors';
import { bufferedRanges, currentOffset } from '../../timeline';
import { seek } from '../../timeline/playback';
import { formatElapsed, getSegmentNumber } from '../../utils';

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
  rulerBuffered: {
    position: 'absolute',
    left: 0,
    marginTop: 41,
    height: 3,
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
});

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
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.percentToOffset = this.percentToOffset.bind(this);
    this.segmentNum = this.segmentNum.bind(this);
    this.onRulerRef = this.onRulerRef.bind(this);
    this.renderRoute = this.renderRoute.bind(this);

    this.rulerRemaining = React.createRef();
    this.rulerBuffered = React.createRef();
    this.playhead = React.createRef();
    this.rulerRef = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();
    this.thumbnailsRef = React.createRef();

    const { zoomOverride, zoom } = this.props;
    this.state = {
      dragging: null,
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
    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointercancel', this.handlePointerCancel);
    document.removeEventListener('pointermove', this.handlePointerMove);
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
    document.addEventListener('pointercancel', this.handlePointerCancel);
    document.addEventListener('pointermove', this.handlePointerMove);
    this.setState({ dragging: [ev.pageX, ev.pageX] });
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
    if (dragging && this.props.overlay && ev.pointerType === 'touch') {
      // on a phone a swipe scrubs; selecting a range to zoom stays a mouse gesture
      this.props.dispatch(seek(this.percentToOffset((endDrag - rulerBounds.x) / rulerBounds.width)));
    } else if (dragging) {
      this.setState({ dragging: [dragging[0], endDrag] });
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
    document.removeEventListener('pointercancel', this.handlePointerCancel);
    document.removeEventListener('pointermove', this.handlePointerMove);
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

  // the browser took the touch over (iOS Safari does this on toolbar changes and system gestures):
  // end the drag without seeking or zooming, or the scrubber would stay stuck in drag mode
  handlePointerCancel() {
    document.removeEventListener('pointerup', this.handlePointerUp);
    document.removeEventListener('pointercancel', this.handlePointerCancel);
    document.removeEventListener('pointermove', this.handlePointerMove);
    this.setState({ dragging: null, hoverX: null });
  }

  // keyboard scrubbing: arrows step 5 s, page keys 30 s
  handleKeyDown(ev) {
    const { zoom } = this.state;
    const steps = { ArrowLeft: -5000, ArrowDown: -5000, ArrowRight: 5000, ArrowUp: 5000, PageDown: -30000, PageUp: 30000 };
    let target;
    if (ev.key in steps) target = currentOffset() + steps[ev.key];
    else if (ev.key === 'Home') target = zoom.start;
    else if (ev.key === 'End') target = zoom.end;
    else return;
    ev.preventDefault();
    this.props.dispatch(seek(Math.min(zoom.end, Math.max(zoom.start, target))));
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
    if (this.playhead.current) {
      this.playhead.current.style.left = `${Math.min(100, Math.max(0, percent * 100))}%`;
      // screen readers: where the playhead is, updated once per second
      const { zoom } = this.state;
      const elapsed = Math.max(0, Math.round((offset - zoom.start) / 1000));
      if (this.rulerRef.current && this.rulerRef.current.getAttribute('aria-valuenow') !== String(elapsed)) {
        this.rulerRef.current.setAttribute('aria-valuenow', elapsed);
        this.rulerRef.current.setAttribute('aria-valuetext', `${formatElapsed(offset - zoom.start)} of ${formatElapsed(zoom.end - zoom.start)}`);
      }
    }
    if (this.rulerBuffered.current) {
      // the loaded part of the video, as a single gradient with hard edges
      const toPercent = (ms) => Math.min(100, Math.max(0, 100 * this.offsetToPercent(ms)));
      const stops = bufferedRanges().map(([start, end]) => (
        `transparent ${toPercent(start)}%, rgba(255, 255, 255, 0.35) ${toPercent(start)}%, rgba(255, 255, 255, 0.35) ${toPercent(end)}%, transparent ${toPercent(end)}%`
      ));
      const background = stops.length ? `linear-gradient(to right, ${stops.join(', ')})` : 'none';
      if (background !== this.bufferedBackground) { // restyling every frame costs a style recalc and a paint
        this.bufferedBackground = background;
        this.rulerBuffered.current.style.background = background;
      }
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

  // the scrubber on top of the video: status-colored track, playhead dot, loaded range, hover preview
  renderOverlay(rulerBounds, draggerStyle) {
    const { route, className } = this.props;
    const { hoverX, zoom } = this.state;

    let preview = null;
    if (rulerBounds && hoverX != null) {
      const offset = this.percentToOffset((hoverX - rulerBounds.x) / rulerBounds.width);
      if (!Number.isNaN(offset)) {
        const { imageIndex, url } = thumbnailAt(route, offset);
        preview = (
          <div
            className="pointer-events-none absolute bottom-full mb-3 flex flex-col items-center gap-1"
            style={{ left: Math.max(0, Math.min(rulerBounds.width - 128, hoverX - rulerBounds.x - 64)), width: 128 }}
          >
            <div
              className="h-20 w-32 overflow-hidden rounded-lg border border-white/30 bg-black shadow-lg"
              style={{
                backgroundImage: `url(${url})`,
                backgroundSize: 'auto 96px',
                backgroundRepeat: 'repeat-x',
                backgroundPositionX: `-${imageIndex * 128}px`,
              }}
            />
            <div className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium tabular-nums text-white">
              {formatElapsed(offset - zoom.start)}
            </div>
          </div>
        );
      }
    }

    return (
      <div className={`group ${className || ''}`}>
        <div
          aria-label="Drive timeline"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round((zoom.end - zoom.start) / 1000)}
          aria-valuenow={0} // getOffset() keeps it current; a constant is never re-applied by React
          tabIndex={0}
          onKeyDown={this.handleKeyDown}
          ref={this.onRulerRef}
          className="relative h-6 w-full cursor-pointer touch-none"
          onPointerDown={this.handlePointerDown}
          onPointerUp={this.handlePointerUp}
          onPointerMove={this.handlePointerMove}
          onPointerLeave={this.handlePointerLeave}
        >
          {preview}
          <div className="absolute inset-x-0 bottom-2 h-1.5 origin-bottom overflow-hidden rounded-full bg-white/25 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-y-[1.67] motion-reduce:transition-none [&_div]:!h-full">
            {route && this.renderRoute()}
            <div ref={this.rulerRemaining} className="pointer-events-none absolute inset-y-0 border-l border-white/70 bg-black/55" />
            {draggerStyle && <div ref={this.dragBar} className="pointer-events-none absolute inset-y-0 bg-white/40" style={draggerStyle} />}
          </div>
          <div ref={this.rulerBuffered} className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5" />
          <div
            ref={this.playhead}
            className="pointer-events-none absolute bottom-[11px] h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 scale-50 rounded-full bg-white opacity-0 shadow transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none"
          />
        </div>
      </div>
    );
  }

  render() {
    const { classes, hasRuler, className, route, thumbnailsVisible, overlay } = this.props;
    const { thumbnail, hoverX, dragging } = this.state;

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
          hoverString = `${segNum}, ${hoverString}`;
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

    if (overlay) {
      return this.renderOverlay(rulerBounds, draggerStyle);
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
                aria-valuemin={0}
                aria-valuemax={Math.round((zoom.end - zoom.start) / 1000)}
                aria-valuenow={0} // getOffset() keeps it current; a constant is never re-applied by React
                tabIndex={0}
                ref={ this.onRulerRef }
                className={classes.ruler}
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.handlePointerUp}
                onPointerMove={this.handlePointerMove}
                onPointerLeave={this.handlePointerLeave}
              >
                <div ref={this.rulerRemaining} className={classes.rulerRemaining} />
                <div ref={this.rulerBuffered} className={classes.rulerBuffered} />
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

// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import document from 'global/document';
import dayjs from 'dayjs';

import Measure from 'react-measure';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import { pushTimelineRange } from '../../actions';
import Colors from '../../colors';
import { currentOffset, getCurrentRoute } from '../../timeline';
import { seek, selectLoop } from '../../timeline/playback';
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
    '&.flag': {
      background: theme.palette.states.userFlag,
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
  clip: {
    position: 'absolute',
    width: '100%',
    height: 32,
    top: 0,
    touchAction: 'none',
  },
  clipRulerRemaining: {
    borderLeft: `1px solid ${Colors.lightGrey200}`,
    position: 'absolute',
    left: 0,
    height: 32,
    width: '100%',
    zIndex: 3,
  },
  clipView: {
    backgroundColor: Colors.black,
    position: 'absolute',
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    touchAction: 'none',
    zIndex: 3,
  },
  clipDragHandle: {
    backgroundColor: Colors.white,
    width: 3,
    height: 24,
    borderRadius: 1.5,
  },
  clipDragBorderTop: {
    backgroundColor: Colors.black,
    height: 3,
    top: -3,
    position: 'absolute',
    borderRadius: '3px 3px 0 0',
  },
  clipDragBorderBottom: {
    backgroundColor: Colors.black,
    height: 3,
    top: 32,
    position: 'absolute',
    borderRadius: '0 0 3px 3px',
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
    this.handleClick = this.handleClick.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.clipDragStart = this.clipDragStart.bind(this);
    this.clipDragGetNewLoop = this.clipDragGetNewLoop.bind(this);
    this.clipDragMove = this.clipDragMove.bind(this);
    this.clipDragEnd = this.clipDragEnd.bind(this);
    this.percentToOffset = this.percentToOffset.bind(this);
    this.segmentNum = this.segmentNum.bind(this);
    this.onRulerRef = this.onRulerRef.bind(this);
    this.renderRoute = this.renderRoute.bind(this);
    this.renderClipView = this.renderClipView.bind(this);

    this.rulerRemaining = React.createRef();
    this.rulerRef = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();

    const { zoomOverride, zoom } = this.props;
    this.state = {
      dragging: null,
      hoverX: null,
      zoom: zoomOverride || zoom,
      clip: null,
      thumbnail: {
        height: 0,
        width: 0,
      },
    };
  }

  componentDidMount() {
    this.mounted = true;
    raf(this.getOffset);
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    const { zoomOverride, zoom } = this.props;
    if (prevProps.zoomOverride !== zoomOverride || prevProps.zoom !== zoom) {
      this.setState({ zoom: zoomOverride || zoom });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  handleClick(ev) {
    const { dragging, clip } = this.state;
    if (clip === null && (!dragging || Math.abs(dragging[1] - dragging[0]) <= 3)) {
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
    if (dragging) {
      this.setState({ dragging: [dragging[0], endDrag] });
    }
    this.setState({ hoverX: endDrag });
  }

  handlePointerUp(ev) {

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
    const startPercent = (Math.min(dragging[0], dragging[1]) - rulerBounds.x) / rulerBounds.width;
    const endPercent = (Math.max(dragging[0], dragging[1]) - rulerBounds.x) / rulerBounds.width;
    const startOffset = Math.round(this.percentToOffset(startPercent));
    const endOffset = Math.round(this.percentToOffset(endPercent));

    if (Math.abs(dragging[1] - dragging[0]) > 3) {
      const offset = currentOffset();
      if (offset < startOffset || offset > endOffset) {
        this.props.dispatch(seek(startOffset));
      }
      const { filter, dispatch } = this.props;
      const startTime = startOffset + filter.start;
      const endTime = endOffset + filter.start;

      dispatch(pushTimelineRange(startTime, endTime));
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
    raf(this.getOffset);
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

  clipDragStart(type, ev) {
    if (ev.button !== 0) {
      return;
    }
    const { loop } = this.props;
    ev.preventDefault();
    document.addEventListener('pointerup', this.clipDragEnd);
    document.addEventListener('pointermove', this.clipDragMove);
    this.setState({
      clip: {
        type,
        initLoop: { ...loop },
        loop: { ...loop },
        startX: ev.pageX,
      },
    });
  }

  clipDragGetNewLoop(ev) {
    const { zoom: { end: zoomEnd, start: zoomStart } } = this.props;
    const { clip: { initLoop, startX, type } } = this.state;

    const rulerWidth = this.rulerRef.current.getBoundingClientRect().width;
    const changePercentage = (ev.pageX - startX) / rulerWidth;

    let newStart; let
      newEnd;
    if (type === 'start') {
      newEnd = initLoop.startTime + initLoop.duration;
      newStart = initLoop.startTime + ((zoomEnd - zoomStart) * changePercentage);
      newStart = Math.min(Math.max(newStart, zoomStart), newEnd - 1000);
    } else if (type === 'end') {
      newStart = initLoop.startTime;
      newEnd = initLoop.startTime + initLoop.duration + ((zoomEnd - zoomStart) * changePercentage);
      newEnd = Math.max(Math.min(newEnd, zoomEnd), newStart + 1000);
    }

    return {
      startTime: newStart,
      duration: newEnd - newStart,
    };
  }

  clipDragMove(ev) {
    const { clip } = this.state;
    if (clip) {
      ev.preventDefault();
      this.setState({
        clip: {
          ...clip,
          loop: this.clipDragGetNewLoop(ev),
        },
      });
    }
  }

  clipDragEnd(ev) {
    const { clip } = this.state;
    const { dispatch } = this.props;

    document.removeEventListener('pointerup', this.clipDragEnd);
    document.removeEventListener('pointermove', this.clipDragEnd);

    if (clip) {
      ev.preventDefault();
      const newLoop = this.clipDragGetNewLoop(ev);
      dispatch(selectLoop(newLoop.startTime, newLoop.startTime + newLoop.duration));
      this.setState({ clip: null });
    }
  }

  percentToOffset(perc) {
    const { zoom } = this.state;
    const { filter } = this.props;
    return perc * (zoom.end - zoom.start) + (zoom.start - filter.start);
  }

  offsetToPercent(offset) {
    const { zoom } = this.state;
    const { filter } = this.props;
    return (offset - (zoom.start - filter.start)) / (zoom.end - zoom.start);
  }

  segmentNum(offset) {
    const { routes } = this.props;
    if (!routes) {
      return null;
    }

    const route = routes.find((r) => r.offset <= offset && r.offset + r.duration >= offset);
    if (route) {
      return getSegmentNumber(route, offset);
    }
    return null;
  }

  renderRoute(route) {
    const { classes, filter } = this.props;
    const { zoom } = this.state;

    if (!route.events) {
      return null;
    }

    const range = filter.start - filter.end;
    let startPerc = (100 * route.offset) / range;
    let widthPerc = (100 * route.duration) / range;

    const startOffset = zoom.start - filter.start;
    const endOffset = zoom.end - filter.start;
    const zoomDuration = endOffset - startOffset;
    if (route.offset > endOffset) {
      return [];
    }
    if (route.offset + route.duration < startOffset) {
      return [];
    }
    startPerc = (100 * (route.offset - startOffset)) / zoomDuration;
    widthPerc = (100 * route.duration) / zoomDuration;

    const style = {
      width: `${widthPerc}%`,
      left: `${startPerc}%`,
    };
    return (
      <div key={route.start_time_utc_millis} className={classes.segment} style={style}>
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

  renderClipView() {
    const { classes, zoom: { end: zoomEnd, start: zoomStart }, loop } = this.props;
    const { clip } = this.state;

    const { startTime, duration } = clip ? clip.loop : loop;

    const loopStartPercent = ((startTime - zoomStart) / (zoomEnd - zoomStart)) * 100.0;
    const loopEndPercent = ((zoomEnd - startTime - duration) / (zoomEnd - zoomStart)) * 100.0;
    const loopDurationPercent = (duration / (zoomEnd - zoomStart)) * 100.0;

    const rulerWidth = this.rulerRef.current?.getBoundingClientRect()?.width || 640;
    const handleWidth = rulerWidth < 640 ? 28 : 12;

    const dragBorderStyle = {
      left: `calc(${loopStartPercent}% - ${handleWidth}px)`,
      width: `calc(${loopDurationPercent}% + ${handleWidth * 2}px)`,
    };

    return (
      <div
        ref={ this.onRulerRef }
        className={classes.clip}
        onClick={this.handleClick}
      >
        <div ref={this.rulerRemaining} className={classes.clipRulerRemaining} />
        <div
          className={ classes.clipView }
          style={{ left: `calc(${loopStartPercent}% - ${handleWidth}px)`, width: handleWidth }}
          onPointerDown={ (ev) => this.clipDragStart('start', ev) }
        >
          <div className={ classes.clipDragHandle } />
        </div>
        <div
          className={ classes.clipView }
          style={{ right: `calc(${loopEndPercent}% - ${handleWidth}px)`, width: handleWidth }}
          onPointerDown={ (ev) => this.clipDragStart('end', ev) }
        >
          <div className={ classes.clipDragHandle } />
        </div>
        <div className={ classes.clipDragBorderTop } style={ dragBorderStyle } />
        <div className={ classes.clipDragBorderBottom } style={ dragBorderStyle } />
      </div>
    );
  }

  render() {
    const { classes, hasRuler, filter, className, routes, thumbnailsVisible, hasClip } = this.props;
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
        hoverString = dayjs(filter.start + hoverOffset).format('HH:mm:ss');
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

    const rulerWidth = this.rulerRef.current ? this.rulerRef.current.getBoundingClientRect().width : 640;
    const handleWidth = rulerWidth < 640 ? 28 : 12;
    const baseWidthStyle = hasClip
      ? { width: `calc(100% - ${handleWidth * 2}px)`, margin: `0 ${handleWidth}px` }
      : { width: '100%' };

    return (
      <div className={className}>
        <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } style={ baseWidthStyle }>
          <div className={ `${classes.segments} ${hasRulerCls}` }>
            { routes && routes.map(this.renderRoute) }
            <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
          </div>
          <Measure bounds onResize={(rect) => this.setState({ thumbnail: rect.bounds })}>
            { (options) => (
              <div ref={options.measureRef} className={ `${classes.thumbnails} ${hasRulerCls}` }>
                { thumbnailsVisible && (
                  <Thumbnails
                    className={classes.thumbnail}
                    getCurrentRoute={ (o) => getCurrentRoute(this.props, o) }
                    percentToOffset={this.percentToOffset}
                    thumbnail={thumbnail}
                    hasRuler={hasRuler}
                  />
                ) }
              </div>
            )}
          </Measure>
          { hasRuler && (
            <>
              <div
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
              { hoverString && (
                <div ref={this.hoverBead} className={classes.hoverBead} style={hoverStyle}>
                  { hoverString }
                </div>
              ) }
            </>
          ) }
          { Boolean(hasClip) && this.renderClipView() }
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  zoom: 'zoom',
  loop: 'loop',
  filter: 'filter',
  routes: 'routes',
});

export default connect(stateToProps)(withStyles(styles)(Timeline));

// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import document from 'global/document';
import fecha from 'fecha';

import Measure from 'react-measure';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import { getCurrentSegment } from '../../timeline/segments';
import { selectRange } from '../../actions';
import Colors from '../../colors';
import { seek, currentOffset, selectLoop } from '../../timeline/playback';

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
    }
  },
  thumbnails: {
    height: 20,
    width: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '& > div': {
      display: 'inline-block'
    }
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
  }
});

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical'
];

function percentFromPointerEvent(e) {
  const boundingBox = e.currentTarget.getBoundingClientRect();
  const x = e.pageX - boundingBox.left;
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
    this.renderSegment = this.renderSegment.bind(this);
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
        width: 0
      }
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
      this.setState({ zoom: this.props.zoomOverride || this.props.zoom });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
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

  handleClick(e) {
    const { dragging, clip } = this.state;
    if (clip === null && (!dragging || Math.abs(dragging[1] - dragging[0]) <= 3)) {
      const percent = percentFromPointerEvent(e);
      this.props.dispatch(seek(this.percentToOffset(percent)));
    }
  }

  handlePointerDown(e) {
    if (e.button === 0) {
      this.setState({ dragging: [e.pageX, e.pageX] });
    }
  }

  handlePointerMove(e) {
    const { dragging } = this.state;
    if (!this.rulerRef.current) {
      return;
    }

    const rulerBounds = this.rulerRef.current.getBoundingClientRect();
    const endDrag = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, e.pageX));
    if (dragging) {
      this.setState({ dragging: [dragging[0], endDrag] });
    }
    this.setState({ hoverX: endDrag });
  }

  handlePointerUp(e) {
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

      dispatch(selectRange(startTime, endTime));
    } else if (e.currentTarget !== document) {
      this.handleClick(e);
    }
  }

  handlePointerLeave() {
    this.setState({ hoverX: null });
  }

  clipDragStart(type, ev) {
    const { loop } = this.props;
    ev.preventDefault();
    document.addEventListener('pointerup', this.clipDragEnd);
    document.addEventListener('pointermove', this.clipDragMove);
    this.setState({ clip: {
      type,
      initLoop: { ...loop },
      loop: { ...loop },
      startX: ev.pageX,
    } });
  }

  clipDragGetNewLoop(ev) {
    const { zoom } = this.props;
    const { clip } = this.state;

    const rulerWidth = this.rulerRef.current.getBoundingClientRect().width;
    const changePercentage = (ev.pageX - clip.startX) / rulerWidth;

    let newStart, newEnd;
    if (clip.type === 'start') {
      newEnd = clip.initLoop.startTime + clip.initLoop.duration;
      newStart = clip.initLoop.startTime + ((zoom.end - zoom.start) * changePercentage);
      newStart = Math.min(Math.max(newStart, zoom.start), newEnd - 1000);
    } else if (clip.type === 'end') {
      newStart = clip.initLoop.startTime;
      newEnd = clip.initLoop.startTime + clip.initLoop.duration + ((zoom.end - zoom.start) * changePercentage);
      newEnd = Math.max(Math.min(newEnd, zoom.end), newStart + 1000);
    }

    return {
      startTime: newStart,
      duration: newEnd - newStart,
    };
  }

  clipDragMove(ev) {
    const { clip } = this.state;
    if (clip) {
      this.setState({ clip: {
        ...clip,
        loop: this.clipDragGetNewLoop(ev),
      }});
    }
  }

  clipDragEnd(ev) {
    document.removeEventListener('pointerup', this.clipDragEnd);
    document.removeEventListener('pointermove', this.clipDragEnd);
    if (this.state.clip) {
      const newLoop = this.clipDragGetNewLoop(ev);
      this.props.dispatch(selectLoop(newLoop.startTime, newLoop.startTime + newLoop.duration));
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
    const { segments } = this.props;
    for (const segment of segments) {
      if (segment.offset <= offset && segment.offset + segment.duration >= offset) {
        return Math.floor((offset - segment.offset) / 60000);
      }
    }
    return null;
  }

  renderSegment(segment) {
    const { classes, filter } = this.props;
    const { zoom } = this.state;

    if (!segment.events) {
      return null;
    }

    const range = filter.start - filter.end;
    let startPerc = (100 * segment.offset) / range;
    let widthPerc = (100 * segment.duration) / range;

    const startOffset = zoom.start - filter.start;
    const endOffset = zoom.end - filter.start;
    const zoomDuration = endOffset - startOffset;
    if (segment.offset > endOffset) {
      return [];
    }
    if (segment.offset + segment.duration < startOffset) {
      return [];
    }
    startPerc = (100 * (segment.offset - startOffset)) / zoomDuration;
    widthPerc = (100 * segment.duration) / zoomDuration;

    const style = {
      width: `${widthPerc}%`,
      left: `${startPerc}%`,
    };
    return (
      <div key={segment.route + segment.offset} className={classes.segment} style={style}>
        { this.renderSegmentEvents(segment) }
      </div>
    );
  }

  renderSegmentEvents(segment) {
    const { classes } = this.props;
    if (!segment.events) {
      return;
    }

    return segment.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event) => {
        const style = {
          left: `${(event.route_offset_millis / segment.duration) * 100}%`,
          width: `${((event.data.end_route_offset_millis - event.route_offset_millis) / segment.duration) * 100}%`,
        };
        const statusCls = event.data.alertStatus ? `${AlertStatusCodes[event.data.alertStatus]}` : '';
        return (
          <div
            key={segment.route + event.route_offset_millis + event.type}
            style={style}
            className={ `${classes.segmentColor} ${event.type} ${statusCls}` }
          />
        );
      });
  }

  renderClipView() {
    const { classes, zoom, loop } = this.props;
    const { clip } = this.state;

    const showLoop = clip ? clip.loop : loop;

    const loopStartPercent = ((showLoop.startTime - zoom.start) / (zoom.end - zoom.start)) * 100.0;
    const loopEndPercent = ((zoom.end - showLoop.startTime - showLoop.duration) / (zoom.end - zoom.start)) * 100.0;
    const loopDurationPercent = (showLoop.duration / (zoom.end - zoom.start)) * 100.0;

    const rulerWidth = this.rulerRef.current ? this.rulerRef.current.getBoundingClientRect().width : 640;
    const handleWidth = rulerWidth < 640 ? 28 : 12;

    const dragBorderStyle = {
      left: `calc(${loopStartPercent}% - ${handleWidth}px)`,
      width: `calc(${loopDurationPercent}% + ${handleWidth*2}px)`,
    };

    return <div ref={ this.rulerRef } className={classes.clip} onClick={this.handleClick}>
      <div ref={this.rulerRemaining} className={classes.clipRulerRemaining} />
      <div className={ classes.clipView } style={{ left: `calc(${loopStartPercent}% - ${handleWidth}px)`, width: handleWidth }}
        onPointerDown={ (ev) => this.clipDragStart('start', ev) }>
        <div className={ classes.clipDragHandle } />
      </div>
      <div className={ classes.clipView } style={{ right: `calc(${loopEndPercent}% - ${handleWidth}px)`, width: handleWidth }}
        onPointerDown={ (ev) => this.clipDragStart('end', ev) }>
        <div className={ classes.clipDragHandle } />
      </div>
      <div className={ classes.clipDragBorderTop } style={ dragBorderStyle } />
      <div className={ classes.clipDragBorderBottom } style={ dragBorderStyle } />
    </div>;
  }

  render() {
    const { classes, hasRuler, filter, className, segments, thumbnailsVisible, hasClip } = this.props;
    const { thumbnail, hoverX, dragging } = this.state;

    const hasRulerCls = hasRuler ? 'hasRuler' : '';

    let rulerBounds;
    if (this.rulerRef.current) {
      rulerBounds = this.rulerRef.current.getBoundingClientRect();
    }

    let hoverString, hoverStyle;
    if (rulerBounds && hoverX) {
      const hoverOffset = this.percentToOffset((hoverX - rulerBounds.x) / rulerBounds.width);
      hoverStyle = { left: Math.max(-10, Math.min(rulerBounds.width - 70, hoverX - rulerBounds.x - 40)) };
      if (!Number.isNaN(hoverOffset)) {
        hoverString = fecha.format(filter.start + hoverOffset, 'HH:mm:ss');
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
    };

    const rulerWidth = this.rulerRef.current ? this.rulerRef.current.getBoundingClientRect().width : 640;
    const handleWidth = rulerWidth < 640 ? 28 : 12;
    const baseWidthStyle = hasClip ?
      { width: `calc(100% - ${handleWidth*2}px)`, margin: `0 ${handleWidth}px` } :
      { width: '100%' };

    return (
      <div className={className}>
        <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } style={ baseWidthStyle }>
          <div className={ `${classes.segments} ${hasRulerCls}` }>
            { segments && segments.map(this.renderSegment) }
            <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
          </div>
          <Measure bounds onResize={(rect) => this.setState({ thumbnail: rect.bounds })}>
            { (options) => (
              <div ref={options.measureRef} className={ `${classes.thumbnails} ${hasRulerCls}` }>
                { thumbnailsVisible &&
                  <Thumbnails getCurrentSegment={ (seg) => getCurrentSegment(this.props, seg) }
                    percentToOffset={this.percentToOffset} thumbnail={thumbnail} className={classes.thumbnail}
                    hasRuler={hasRuler} />
                }
              </div>
            )}
          </Measure>
          { hasRuler && <>
            <div ref={ this.rulerRef } className={classes.ruler} onPointerDown={this.handlePointerDown}
              onPointerUp={this.handlePointerUp} onPointerMove={this.handlePointerMove} onPointerLeave={this.handlePointerLeave}
              onClick={this.handleClick} >
              <div ref={this.rulerRemaining} className={classes.rulerRemaining} />
              { draggerStyle && <div ref={this.dragBar} className={classes.dragHighlight} style={draggerStyle} /> }
            </div>
            { hoverString &&
              <div ref={this.hoverBead} className={classes.hoverBead} style={hoverStyle}>
                { hoverString }
              </div>
            }
          </> }
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
  segments: 'segments',
});

export default connect(stateToProps)(withStyles(styles)(Timeline));

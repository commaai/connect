// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import debounce from 'debounce';
import document from 'global/document';
import fecha from 'fecha';

import Measure from 'react-measure';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import TimelineWorker from '../../timeline';
import Segments from '../../timeline/segments';
import { selectRange } from '../../actions';
import Colors from '../../colors';

const styles = (/* theme */) => ({
  base: {
    position: 'relative',
    width: '100%',
  },
  segments: {
    backgroundColor: theme.palette.states.drivingBlue,
    left: '0px',
    width: '100%',
    overflow: 'hidden',
    height: 12,
  },
  segment: {
    position: 'relative',
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
    '&.alert': {
      '&.userPrompt': {
        background: theme.palette.states.alertOrange,
      },
      '&.critical': {
        background: theme.palette.states.alertRed,
      }
    }
  },
  thumbnails: {
    height: 24,
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
    width: 70,
  },
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
    this.percentToOffset = this.percentToOffset.bind(this);
    this.renderSegment = this.renderSegment.bind(this);
    this.sendSeek = debounce(this.sendSeek.bind(this), 1000 / 60);

    this.rulerRemaining = React.createRef();
    this.rulerRef = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();

    const { zoomOverride, zoom } = this.props;
    this.state = {
      dragging: null,
      hoverX: null,
      zoom: zoomOverride || zoom,
      thumbnail: {
        height: 0,
        width: 0
      }
    };
  }

  componentDidMount() {
    this.mounted = true;
    this.stopListening = TimelineWorker.onIndexed(() => this.forceUpdate());
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
    this.stopListening();
  }

  getOffset() {
    if (!this.mounted) {
      return;
    }
    raf(this.getOffset);
    let offset = TimelineWorker.currentOffset();
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
    const { dragging } = this.state;
    if (!dragging || Math.abs(dragging[1] - dragging[0]) <= 3) {
      const percent = percentFromPointerEvent(e);
      TimelineWorker.seek(this.percentToOffset(percent));
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
      const currentOffset = TimelineWorker.currentOffset();
      if (currentOffset < startOffset || currentOffset > endOffset) {
        TimelineWorker.seek(startOffset);
      }
      const { start, dispatch } = this.props;
      const startTime = startOffset + start;
      const endTime = endOffset + start;

      dispatch(selectRange(startTime, endTime));
    } else if (e.currentTarget !== document) {
      this.handleClick(e);
    }
  }

  handlePointerLeave() {
    this.setState({ hoverX: null });
  }

  percentToOffset(perc) {
    const { zoom } = this.state;
    const { start } = this.props;
    return perc * (zoom.end - zoom.start) + (zoom.start - start);
  }

  offsetToPercent(offset) {
    const { zoom } = this.state;
    const { start } = this.props;
    return (offset - (zoom.start - start)) / (zoom.end - zoom.start);
  }

  sendSeek() {
    if (this.seekIndex) {
      TimelineWorker.seek(this.seekIndex);
      this.seekIndex = null;
    }
  }

  renderSegment(segment) {
    const { classes, start, end } = this.props;
    const { zoom } = this.state;

    const range = start - end;
    let startPerc = (100 * segment.offset) / range;
    let widthPerc = (100 * segment.duration) / range;

    const startOffset = zoom.start - start;
    const endOffset = zoom.end - start;
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
    return segment.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event) => {
        const style = {
          left: `${(event.route_offset_millis / segment.duration) * 100}%`,
          width: `${((event.data.end_route_offset_millis - event.route_offset_millis) / segment.duration) * 100}%`,
        };
        if (localStorage.showCurrentEvent) {
          const time = TimelineWorker.currentOffset();
          const eventStart = event.route_offset_millis + segment.offset;
          const eventEnd = event.data.end_route_offset_millis + segment.offset;
          if (time > eventStart && time < eventEnd) {
            console.log('Current event:', event);
          }
        }
        const statusCls = event.data.alertStatus ? `${AlertStatusCodes[event.data.alertStatus]}` : '';
        return (
          <div
            key={segment.route + event.time + event.type}
            style={style}
            className={ `${classes.segmentColor} ${event.type} ${statusCls}` }
          />
        );
      });
  }

  render() {
    const { classes, hasRuler, start, className, segments } = this.props;
    const { thumbnail, hoverX, dragging } = this.state;

    const hasRulerCls = hasRuler ? 'hasRuler' : '';

    let rulerBounds;
    if (this.rulerRef.current) {
      rulerBounds = this.rulerRef.current.getBoundingClientRect();
    }

    let hoverString, hoverStyle;
    if (rulerBounds && hoverX) {
      const hoverOffset = this.percentToOffset((hoverX - rulerBounds.x) / rulerBounds.width);
      hoverStyle = { left: Math.max(-10, Math.min(rulerBounds.width - 60, hoverX - rulerBounds.x - 35)) };
      if (!Number.isNaN(hoverOffset)) {
        hoverString = fecha.format(start + hoverOffset, 'HH:mm:ss');
      }
    }

    let draggerStyle;
    if (rulerBounds && dragging && Math.abs(dragging[1] - dragging[0]) > 0) {
      draggerStyle = {
        left: `${Math.min(dragging[1], dragging[0]) - rulerBounds.x}px`,
        width: `${Math.abs(dragging[1] - dragging[0])}px`,
      };
    };

    return (
      <div className={className}>
        <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } >
          <div className={ `${classes.segments} ${hasRulerCls}` }>
            { segments && segments.map(this.renderSegment) }
            <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
          </div>
          <Measure bounds onResize={(rect) => this.setState({ thumbnail: rect.bounds })}>
            { (options) => (
              <div ref={options.measureRef} className={ `${classes.thumbnails} ${hasRulerCls}` }>
                <Thumbnails getCurrentSegment={ (seg) => Segments.getCurrentSegment(this.props, seg) }
                  percentToOffset={this.percentToOffset} thumbnail={thumbnail} className={classes.thumbnail}
                  hasRuler={hasRuler} />
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
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  zoom: 'zoom',
  start: 'workerState.start',
  end: 'workerState.end',
  segments: 'workerState.segments',
});

export default connect(stateToProps)(withStyles(styles)(Timeline));

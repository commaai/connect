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
import Tooltip from '@material-ui/core/Tooltip';

import Thumbnails from './thumbnails';
import theme from '../../theme';
import TimelineWorker from '../../timeline';
import Segments from '../../timeline/segments';
import { selectRange } from '../../actions';

const styles = (/* theme */) => ({
  base: {
    backgroundColor: '#1D2225',
    minHeight: '32px',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    '&.hasRuler': {
      minHeight: '80px',
    },
  },
  segments: {
    position: 'absolute',
    top: '0px',
    left: '0px',
    width: '100%',
    height: '40%',
    '&.hasRuler': {
      height: '100%',
    },
  },
  segment: {
    position: 'relative',
    height: '100%',
    background: theme.palette.states.drivingBlue,
  },
  ruler: {
    background: '#272D30d9',
    bottom: 0,
    position: 'absolute',
    top: 12,
    width: '100%',
  },
  rulerRemaining: {
    background: '#1D2225',
    borderLeft: '1px solid #D8DDDF',
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    opacity: 0.45,
    pointerEvents: 'none',
    width: '100%',
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
    height: '100%',
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
  hoverBead: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 50,
    height: '100%'
  },
  dragHighlight: {
    background: 'rgba(255, 255, 255, 0.1)',
    position: 'absolute',
    height: '100%',
  },
  thumbnails: {
    position: 'absolute',
    height: '60%',
    top: 12,
    width: '100%',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '& img': {
      pointerEvents: 'none',
    },
    '&.hasRuler': {
      height: '30%',
    },
    '& > div': {
      display: 'inline-block'
    }
  },
});

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical'
];

function percentFromMouseEvent(e) {
  const boundingBox = e.currentTarget.getBoundingClientRect();
  const x = e.pageX - boundingBox.left;
  return x / boundingBox.width;
}

class Timeline extends Component {
  constructor(props) {
    super(props);

    this.getOffset = this.getOffset.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.percentToOffset = this.percentToOffset.bind(this);
    this.renderSegment = this.renderSegment.bind(this);
    this.sendSeek = debounce(this.sendSeek.bind(this), 1000 / 60);


    this.offsetValue = React.createRef();
    this.rulerRemaining = React.createRef();
    this.rulerRemainingHovered = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();
    // this.canvas_speed = React.createRef();
    const { zoomOverride, zoom } = this.props;
    this.state = {
      dragStart: null,
      zoom: zoomOverride || zoom,
      mouseX: 0,
      hoverPercent: 0,
      isHovered: false,
      thumbnail: {
        height: 0,
        width: 0
      }
    };
  }

  componentWillMount() {
    document.addEventListener('mouseup', this.handleMouseUp, false);
    this.stopListening = TimelineWorker.onIndexed(() => this.forceUpdate());
    this.componentDidUpdate({});
  }

  componentDidMount() {
    this.mounted = true;
    raf(this.getOffset);
  }

  componentDidUpdate(prevProps) {
    const { zoomOverride, zoom } = this.props;
    if (prevProps.zoomOverride !== zoomOverride || prevProps.zoom !== zoom) {
      this.setState({ zoom: this.props.zoomOverride || this.props.zoom });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    document.removeEventListener('mouseup', this.handleMouseUp, false);
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
    }
    const { isHovered } = this.state;
    if (!isHovered
      && this.rulerRemainingHovered.current
      && this.rulerRemainingHovered.current.parentElement) {
      this.rulerRemainingHovered.current.style.left = `${Math.floor(10000 * percent) / 100}%`;
    }
  }

  handleClick(e) {
    if (this.isDragSelecting) {
      console.log('Is a drag event');
      this.isDragSelecting = false;
      return;
    }

    const percent = percentFromMouseEvent(e);

    TimelineWorker.seek(this.percentToOffset(percent));
  }

  handleMouseDown(e) {
    const { classes, dragSelection } = this.props;
    if (!dragSelection) {
      return;
    }
    // make sure they're clicking & dragging and not just moving the mouse around
    if (e.currentTarget.parentElement.querySelector(`.${classes.base}:active`) !== e.currentTarget) {
      return;
    }

    const percent = percentFromMouseEvent(e);
    this.setState({
      dragStart: percent,
      dragEnd: percent
    });
  }

  handleMouseUp(e) {
    const { dragStart, dragEnd } = this.state;
    const { dragSelection } = this.props;
    if (!dragSelection) {
      return;
    }
    if (!dragStart) {
      return;
    }
    const selectedArea = Math.abs(dragStart - dragEnd) * 100;
    const startPercent = Math.min(dragStart, dragEnd);
    const endPercent = Math.max(dragStart, dragEnd);
    const startOffset = Math.round(this.percentToOffset(startPercent));
    const endOffset = Math.round(this.percentToOffset(endPercent));

    if (selectedArea > 0.1) {
      const currentOffset = TimelineWorker.currentOffset();
      if (currentOffset < startOffset || currentOffset > endOffset) {
        TimelineWorker.seek(startOffset);
      }
      const { start, dispatch } = this.props;
      const startTime = startOffset + start;
      const endTime = endOffset + start;

      this.isDragSelecting = true;
      setTimeout(() => { this.isDragSelecting = false; });
      dispatch(selectRange(startTime, endTime));
    } else if (e.currentTarget !== document) {
      this.handleClick(e);
    }

    this.setState({
      dragStart: null,
      dragEnd: null
    });
  }

  handleMouseMove(e) {
    const boundingBox = e.currentTarget.getBoundingClientRect();
    const x = e.pageX - boundingBox.left;
    const percent = x / boundingBox.width;

    this.setState({
      mouseX: x,
      hoverPercent: percent,
      isHovered: true,
    });

    // mouseover highlight
    if (this.rulerRemainingHovered.current && this.rulerRemainingHovered.current.parentElement) {
      let { hoverPercent } = this.state;
      hoverPercent = (hoverPercent * 100).toFixed(2);
      this.rulerRemainingHovered.current.style.left = `${hoverPercent}%`;
    }

    const { classes, dragSelection } = this.props;
    const { dragStart } = this.state;
    // drag highlight
    if (e.currentTarget.parentElement.querySelector(`.${classes.base}:active`) !== e.currentTarget) {
      return; // ignore mouseover
    }
    if (!dragSelection) {
      this.seekIndex = this.percentToOffset(percent);
      this.sendSeek();
    } if (dragStart) {
      this.setState({
        dragEnd: percent
      });
    }
    // do other things for drag selection!
  }

  handleMouseLeave() {
    this.setState({ isHovered: false });
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

  renderDragger() {
    const { dragStart, dragEnd } = this.state;
    const { dragSelection, classes } = this.props;
    if (!dragSelection || !dragStart) {
      return [];
    }
    const draggerStyle = {
      left: `${100 * Math.min(dragStart, dragEnd)}%`,
      width: `${100 * Math.abs(dragStart - dragEnd)}%`,
    };
    return (
      <div
        ref={this.dragBar}
        className={classes.dragHighlight}
        style={draggerStyle}
      />
    );
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
      position: 'absolute',
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
    const { classes, tooltipped, hasRuler, start, className, segments } = this.props;
    const { hoverPercent, thumbnail, mouseX } = this.state;
    const hoverOffset = this.percentToOffset(hoverPercent);
    let timeString = null;
    if (tooltipped) {
      if (Number.isNaN(hoverOffset)) {
        timeString = 'N/A';
      } else {
        const timestampAtOffset = start + hoverOffset;
        timeString = fecha.format(timestampAtOffset, 'M/D HH:mm:ss');
      }
    }
    const hasRulerCls = hasRuler ? 'hasRuler' : '';
    return (
      <div className={className}>
        <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } onMouseDown={this.handleMouseDown}
          onMouseUp={this.handleMouseUp} onMouseMove={this.handleMouseMove} onMouseLeave={this.handleMouseLeave}
          onClick={this.handleClick} >
          <div className={ `${classes.segments} ${hasRulerCls}` }>
            { segments && segments.map(this.renderSegment) }
            { hasRuler && (
              <div className={classes.ruler}>
                <div ref={this.rulerRemaining} className={classes.rulerRemaining} />
                <div ref={this.rulerRemainingHovered} className={classes.rulerRemaining} />
              </div>
            ) }
            <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
            { this.renderDragger() }
          </div>
          { tooltipped &&
            <Tooltip title={timeString}>
              <div ref={this.hoverBead} className={classes.hoverBead} style={{ left: mouseX - 25 }} />
            </Tooltip>
          }
          <Measure bounds onResize={(rect) => this.setState({ thumbnail: rect.bounds })}>
            { (options) => (
              <div ref={options.measureRef} className={ `${classes.thumbnails} ${hasRulerCls}` }>
                <Thumbnails getCurrentSegment={ (seg) => Segments.getCurrentSegment(this.props, seg) }
                  percentToOffset={this.percentToOffset} thumbnail={thumbnail} className={classes.thumbnail}
                  hasRuler={hasRuler} />
              </div>
            )}
          </Measure>
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

// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import debounce from 'debounce';
import document from 'global/document';
import fecha from 'fecha';
import cx from 'classnames';
import { partial } from 'ap';
import PropTypes from 'prop-types';

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
    '&.hasThumbnails.hasRuler': {
      minHeight: '80px',
    },
  },
  rounded: {
    borderRadius: '10px 10px 0px 0px'
  },
  segments: {
    position: 'absolute',
    top: '0px',
    left: '0px',
    width: '100%',
    height: '100%',
    '&.hasThumbnails': {
      height: '40%'
    },
    '&.hasThumbnails.hasRuler': {
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
  uncoloredSegment: {
    background: theme.palette.states.drivingBlue,
    height: '100%',
    width: '100%',
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
  }

  componentDidMount() {
    this.mounted = true;
    raf(this.getOffset);
  }

  componentWillReceiveProps(props) {
    this.setState({
      zoom: props.zoomOverride || props.zoom
    });
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
    const { noseek } = this.props;
    if (noseek) {
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
    const { zoomed, range, start } = this.props;
    if (zoomed) {
      return perc * (zoom.end - zoom.start) + (zoom.start - start);
    }
    return perc * range;
  }

  offsetToPercent(offset) {
    const { zoom } = this.state;
    const { zoomed, range, start } = this.props;
    if (zoomed) {
      return (offset - (zoom.start - start)) / (zoom.end - zoom.start);
    }
    return offset / range;
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

  renderZoom() {
    const {
      zoom, dragSelection, zoomed, start, range
    } = this.props;
    if (!dragSelection || !zoom.expanded || zoomed) {
      return [];
    }
    const color = `${theme.palette.grey[50]}cc`;
    const endColor = `${theme.palette.grey[200]}aa`;
    const zoomStart = (zoom.start - start) / range;
    const zoomEnd = (zoom.end - start) / range;
    const barStyle = {
      background: `linear-gradient(to left,${color},${endColor},${color})`,
      left: `${100 * Math.min(zoomStart, zoomEnd)}%`,
      width: `${100 * Math.abs(zoomStart - zoomEnd)}%`,
    };
    return (
      <div
        style={barStyle}
      />
    );
  }

  renderSegment(segment) {
    const {
      classes, range, zoomed, start, colored
    } = this.props;
    const { zoom } = this.state;
    let startPerc = (100 * segment.offset) / range;
    let widthPerc = (100 * segment.duration) / range;
    if (zoomed) {
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
    }
    const style = {
      position: 'absolute',
      width: `${widthPerc}%`,
      left: `${startPerc}%`,
    };
    return (
      <div
        key={segment.route + segment.offset}
        className={classes.segment}
        style={style}
      >
        { colored ? this.renderSegmentEvents(segment) : (
          <div className={classes.uncoloredSegment} />
        ) }
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
        return (
          <div
            key={segment.route + event.time + event.type}
            style={style}
            className={cx(classes.segmentColor, event.type, {
              [`${AlertStatusCodes[event.data.alertStatus]}`]: event.data.alertStatus,
            })}
          />
        );
      });
  }

  render() {
    const {
      classes,
      hasThumbnails,
      tooltipped,
      hasRuler,
      start,
      className,
      style,
      rounded,
      segments,
      hasGradient
    } = this.props;
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
    return (
      <div
        className={className}
        style={style}
      >
        <div
          role="presentation"
          className={cx(classes.base, {
            rounded,
            hasRuler,
            hasThumbnails,
          })}
          onMouseDown={this.handleMouseDown}
          onMouseUp={this.handleMouseUp}
          onMouseMove={this.handleMouseMove}
          onMouseLeave={this.handleMouseLeave}
          onClick={this.handleClick}
        >
          <div className={cx(classes.segments, { hasThumbnails, hasRuler })}>
            { segments && segments.map(this.renderSegment) }
            { hasRuler && (
              <div className={classes.ruler}>
                <div
                  ref={this.rulerRemaining}
                  className={classes.rulerRemaining}
                />
                <div
                  ref={this.rulerRemainingHovered}
                  className={classes.rulerRemaining}
                />
              </div>
            ) }
            { hasGradient && (
              <div
                className={cx(classes.statusGradient, {
                  hasRuler,
                })}
              />
            ) }
            { this.renderDragger() }
            { this.renderZoom() }
          </div>
          { tooltipped
            && (
            <Tooltip title={timeString}>
              <div
                ref={this.hoverBead}
                className={classes.hoverBead}
                style={{ left: mouseX - 25 }}
              />
            </Tooltip>
            )}
          { hasThumbnails
            && (
            <Measure
              bounds
              onResize={(rect) => this.setState({ thumbnail: rect.bounds })}
            >
              { (options) => (
                <div
                  ref={options.measureRef}
                  className={cx(classes.thumbnails, {
                    hasRuler,
                  })}
                >
                  <Thumbnails
                    getCurrentSegment={partial(Segments.getCurrentSegment, this.props)}
                    percentToOffset={this.percentToOffset}
                    thumbnail={thumbnail}
                    className={classes.thumbnail}
                    hasRuler={hasRuler}
                  />
                </div>
              )}
            </Measure>
            )}
        </div>
      </div>
    );
  }
}

Timeline.propTypes = {
  zoom: PropTypes.object.isRequired,
  zoomOverride: PropTypes.object,
  zoomed: PropTypes.bool,
  colored: PropTypes.bool,
  start: PropTypes.number.isRequired,
  range: PropTypes.number.isRequired,
  classes: PropTypes.object.isRequired,
  dragSelection: PropTypes.bool,
  hasThumbnails: PropTypes.bool,
  hasRuler: PropTypes.bool,
  tooltipped: PropTypes.bool,
  hasGradient: PropTypes.bool,
  rounded: PropTypes.bool,
  segments: PropTypes.array.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  dispatch: PropTypes.func.isRequired,
  noseek: PropTypes.bool,
};

function mapStateToProps(state) {
  return {
    ...state.workerState,
    zoom: state.zoom
  };
}

export default connect(mapStateToProps)(withStyles(styles)(Timeline));

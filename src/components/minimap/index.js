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
import { classNames } from 'react-extras';

import Measure from 'react-measure';
import Tooltip from '@material-ui/core/Tooltip';

import theme from '../../theme';
import TimelineWorker from '../../timeline';
import Segments from '../../timeline/segments';
import { selectRange } from '../../actions';

const styles = (theme) => {
  /* MINIMAP / PROGRESS BAR */
  return {
    holder: {
      position: 'relative',
      width: '100%',
      backgroundColor: '#000',
      minHeight: '45px',
      overflow: 'hidden',
    },
    rounded: {
      borderRadius: '10px 10px 0px 0px'
    },
    progressBar: {
      position: 'absolute',
      top: '0px',
      borderRight: '2px solid ' + theme.palette.grey[50],
      height: '100%',
    },

  /* SEGMENTS */
    segments: {
      position: 'absolute',
      top: '0px',
      left: '0px',
      width: '100%',
      height: '100%',
      '&.thumbnailed': {
        height: '50%'
      }
    },
    segment: {
      position: 'relative',
      height: '100%',
      // background: 'linear-gradient(to bottom, ' + theme.palette.grey[200] + 'ff 0%, ' + theme.palette.grey[200] + '55 100%)',
      background: theme.palette.states.drivingBlue,
    },
    'gradient': {
        background: 'linear-gradient(rgba(0, 0, 0, 0.0) 4%, rgba(255, 255, 255, 0.025) 10%, rgba(0, 0, 0, 0.1) 25%, rgba(0, 0, 0, 0.4))',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
    },
    segmentColor: {
      position: 'absolute',
      display: 'inline-block',
      height: '100%',
      width: '100%',
      '&.active': {
        // background: 'linear-gradient(to bottom, rgb(20, 200, 20) 0%, rgb(0, 70, 0) 100%)'
      },
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
    thumbnailHolder: {
      position: 'absolute',
      height: '50%',
      top: '50%',
      width: '100%',
      whiteSpace: 'nowrap',
      userSelect: 'none',
      '& img': {
        pointerEvents: 'none',
      }
    }
  };
};

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical'
];

class Minimap extends Component {
  constructor (props) {
    super(props);

    this.renderOffset = this.renderOffset.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleDown = this.handleDown.bind(this);
    this.handleUp = this.handleUp.bind(this);
    this.renderSegment = this.renderSegment.bind(this);
    this.renderThumbnails = this.renderThumbnails.bind(this);

    this.sendSeek = debounce(this.sendSeek.bind(this), 1000 / 60);

    this.offsetValue = React.createRef();
    this.progressBar = React.createRef();
    this.dragBar = React.createRef();
    this.hoverBead = React.createRef();

    this.state = {
      dragStart: null,
      zoom: this.props.zoomOverride || this.props.zoom,
      mouseX: 0,
      hoverPercent: 0,
      thumbnail: {
        height: 0,
        width: 0
      }
    };
  }
  componentWillReceiveProps (props) {
    this.setState({
      zoom: props.zoomOverride || props.zoom
    });
  }

  componentDidUpdate (prevProps, nextProps) {
    let minOffset = this.state.zoom.start - this.props.start;
    if (this.props.zoomOverride) {
      return;
    }
    // isn't needed with the reducers handling bounds
    // if (minOffset > TimelineWorker.currentOffset()) {
    //   TimelineWorker.seek(minOffset);
    // }
  }
  componentWillMount () {
    document.addEventListener('mouseup', this.handleUp, false);
    this.stopListening = TimelineWorker.onIndexed(() => this.forceUpdate());
  }
  componentWillUnmount () {
    this.mounted = false;
    document.removeEventListener('mouseup', this.handleUp, false);
    this.stopListening();
  }
  componentDidMount () {
    this.mounted = true;
    raf(this.renderOffset);
  }
  renderOffset () {
    if (!this.mounted) {
      return;
    }
    raf(this.renderOffset);

    if (this.progressBar.current && this.progressBar.current.parentElement) {
      let offset = TimelineWorker.currentOffset();
      if (this.seekIndex) {
        offset = this.seekIndex;
      }
      offset = Math.floor(offset);

      let percent = this.offsetToPercent(offset);

      this.progressBar.current.style.width = ~~(10000 * percent) / 100 + '%';
    }
  }
  percentFromMouseEvent (e) {
    let boundingBox = e.currentTarget.getBoundingClientRect();
    let x = e.pageX - boundingBox.left;
    return x / boundingBox.width;
  }

  handleClick (e) {
    if (this.isDragSelecting) {
      console.log('Is a drag event');
      this.isDragSelecting = false;
      return;
    }
    if (this.props.noseek) {
      return;
    }
    console.log(e.currentTarget);
    let percent = this.percentFromMouseEvent(e);

    TimelineWorker.seek(this.percentToOffset(percent));
  }
  handleDown (e) {
    if (!this.props.dragSelection) {
      return;
    }
    // make sure they're clicking & dragging and not just moving the mouse around
    if (e.currentTarget.parentElement.querySelector('.' + this.props.classes.holder + ':active') !== e.currentTarget) {
      return;
    }

    let percent = this.percentFromMouseEvent(e);
    this.setState({
      dragStart: percent,
      dragEnd: percent
    });
  }
  handleUp (e) {
    if (!this.props.dragSelection) {
      return;
    }
    if (!this.state.dragStart) {
      return;
    }
    let selectedArea = Math.abs(this.state.dragStart - this.state.dragEnd) * 100;
    let startPercent = Math.min(this.state.dragStart, this.state.dragEnd);
    let endPercent = Math.max(this.state.dragStart, this.state.dragEnd);

    let startOffset = Math.round(this.percentToOffset(startPercent));
    let endOffset = Math.round(this.percentToOffset(endPercent));

    if (selectedArea > 0.1) {
      let currentOffset = TimelineWorker.currentOffset();
      if (currentOffset < startOffset || currentOffset > endOffset) {
        TimelineWorker.seek(startOffset);
      }
      let startTime = startOffset + this.props.start;
      let endTime = endOffset + this.props.start;

      this.isDragSelecting = true;
      setTimeout(() => this.isDragSelecting = false);
      this.props.dispatch(selectRange(startTime, endTime));
    } else if (e.currentTarget !== document) {
      this.handleClick(e);
    }

    this.setState({
      dragStart: null,
      dragEnd: null
    });
  }
  handleMove (e) {
    let boundingBox = e.currentTarget.getBoundingClientRect();
    let x = e.pageX - boundingBox.left;
    let percent = x / boundingBox.width;

    this.setState({
      mouseX: x,
      hoverPercent: percent
    });

    // make sure they're clicking & dragging and not just moving the mouse around
    if (e.currentTarget.parentElement.querySelector('.' + this.props.classes.holder + ':active') !== e.currentTarget) {
      return;
    }

    if (!this.props.dragSelection) {
      this.seekIndex = this.percentToOffset(percent);
      return this.sendSeek();
    } else if (this.state.dragStart) {
      this.setState({
        dragEnd: percent
      });
    }
    // do other things for drag selection!
  }
  percentToOffset (perc) {
    if (this.props.zoomed) {
      return perc * (this.state.zoom.end - this.state.zoom.start) + (this.state.zoom.start - this.props.start);
    } else {
      return perc * this.props.range;
    }
  }
  offsetToPercent (offset) {
    if (this.props.zoomed) {
      return (offset - (this.state.zoom.start - this.props.start)) / (this.state.zoom.end - this.state.zoom.start);
    } else {
      return offset / this.props.range;
    }
  }
  sendSeek () {
    if (this.seekIndex) {
      TimelineWorker.seek(this.seekIndex);
      this.seekIndex = null;
    }
  }
  progressBarBackground () {
    if (this.state.zoom.expanded) {
      return '';
    } else if (this.props.colored) {
      return 'linear-gradient(to left, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.1) 200px, rgba(255, 255, 255, 0) 250px)';
    } else {
      let color = theme.palette.grey[50] + '99';
      let endColor = theme.palette.grey[999] + '00';
      // return 'linear-gradient(to left, rgba(25, 255, 25, 0.5), rgba(25, 255, 25, 0.1) 200px, rgba(255, 255, 255, 0) 250px)';
      return 'linear-gradient(to left, ' + color + ', ' + endColor + ' 200px';
    }
  }
  render () {
    let hoverOffset = this.percentToOffset(this.state.hoverPercent);
    let timeString = null;

    if (Number.isNaN(hoverOffset)) {
      timeString = 'N/A';
    } else {
      let timestampAtOffset = this.props.start + hoverOffset;
      timeString = fecha.format(timestampAtOffset, 'M/D HH:mm:ss');
    }

    return (
      <div className={ this.props.className } style={ this.props.style } >
        <div
          className={ this.props.classes.holder + ' ' + (this.props.rounded ? this.props.classes.rounded : '') }
          onMouseDown={ this.handleDown }
          onMouseUp={ this.handleUp }
          onMouseMove={ this.handleMove }
          onClick={ this.handleClick } >
          <div className={ classNames(this.props.classes.segments, {
            thumbnailed: this.props.thumbnailed
          }) }>
            { this.props.segments ? this.props.segments.map(this.renderSegment) : [] }
            { this.props.gradient && <div className={this.props.classes.gradient} /> }
          </div>
          { this.renderDragger() }
          { this.renderZoom() }
          <div style={{ background: this.progressBarBackground() }} className={ this.props.classes.progressBar } ref={ this.progressBar } />
          <Tooltip
            title={ timeString }
            >
            <div
              className={ this.props.classes.hoverBead }
              ref={ this.hoverBead }
              style={{
                left: this.state.mouseX - 25
              }} />
          </Tooltip>
          { this.props.thumbnailed &&
            <Measure
              bounds
              onResize={ (rect) => this.setState({ thumbnail: rect.bounds }) }
            >
              { this.renderThumbnails }
            </Measure>
          }
        </div>
      </div>
    );
  }
  renderDragger () {
    if (!this.props.dragSelection || !this.state.dragStart) {
      return [];
    }
    let color = theme.palette.grey[50] + 'cc';
    let endColor = theme.palette.grey[200] + 'aa';
    return (
      <div style={{
        background: 'linear-gradient(to left, ' + color + ', ' + endColor + ', ' + color + ')',
        left: (100 * Math.min(this.state.dragStart, this.state.dragEnd)) + '%',
        width: (100 * Math.abs(this.state.dragStart - this.state.dragEnd)) + '%',
      }} className={ this.props.classes.progressBar } ref={ this.dragBar } />
    );
  }
  renderZoom () {
    if (!this.props.dragSelection || !this.state.zoom.expanded || this.props.zoomed) {
      return [];
    }
    let color = theme.palette.grey[50] + 'cc';
    let endColor = theme.palette.grey[200] + 'aa';
    let zoomStart = (this.state.zoom.start - this.props.start) / this.props.range;
    let zoomEnd = (this.state.zoom.end - this.props.start) / this.props.range;

    return (
      <div style={{
        background: 'linear-gradient(to left, ' + color + ', ' + endColor + ', ' + color + ')',
        left: (100 * Math.min(zoomStart, zoomEnd)) + '%',
        width: (100 * Math.abs(zoomStart - zoomEnd)) + '%',
      }} className={ this.props.classes.progressBar } />
    );
  }
  renderSegment (segment) {
    let startPerc = 100 * segment.offset / this.props.range;
    let widthPerc = 100 * segment.duration / this.props.range;

    if (this.props.zoomed) {
      let startOffset = this.state.zoom.start - this.props.start;
      let endOffset = this.state.zoom.end - this.props.start;
      let zoomDuration = endOffset - startOffset;

      if (segment.offset > endOffset) {
        return;
      }
      if (segment.offset + segment.duration < startOffset) {
        return;
      }
      startPerc = 100 * (segment.offset - startOffset) / zoomDuration;
      widthPerc = 100 * segment.duration / zoomDuration;
    }
    let style = {
      position: 'absolute',
      width: widthPerc + '%',
      left: startPerc + '%',
    }
    if (this.props.colored) {
      return (
        <div key={ segment.route + segment.offset } style={ style } className={ this.props.classes.segment }>
          { this.renderSegmentEvents(segment) }
        </div>
      );
    } else {
      return (
        <div key={ segment.route + segment.offset } style={ style } className={ this.props.classes.segment }>
          <div className={ this.props.classes.uncoloredSegment }>
          </div>
        </div>
      );
    }
  }
  renderSegmentEvents (segment) {
    return segment.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event, i) => {
        let style = {
          left: ((event.route_offset_millis / segment.duration) * 100) + '%',
          width: (((event.data.end_route_offset_millis - event.route_offset_millis) / segment.duration) * 100) + '%',
        };
        return (
          <div
            key={ segment.route + i }
            style={ style }
            className={ this.props.classes.segmentColor + ' ' + event.type + (event.data.alertStatus ? ' ' + AlertStatusCodes[event.data.alertStatus] : '') }
            >
          </div>
        );
      });
  }
  renderThumbnails (options) {
    const imgStyles = {
      display: 'inline-block',
      height: this.state.thumbnail.height,
      width: (1164 / 874) * this.state.thumbnail.height,
    };
    var imgCount = Math.ceil(this.state.thumbnail.width / imgStyles.width);
    var gutter = 0; // (this.state.thumbnail.width - (imgCount * imgStyles.width)) / imgCount;
    var blankImages = 0;
    imgStyles.marginRight = gutter / 2;

    var imgArr = [];
    for (let i = 0; i < imgCount; ++i) {
      let offset = this.percentToOffset((i + 0.5) / imgCount);
      let segment = Segments.getCurrentSegment(this.props, offset);
      if (!segment || !Segments.hasCameraAtOffset(segment, offset)) {
        blankImages++;
        continue;
      }
      let seconds = Math.floor((offset - segment.routeOffset) / 1000);
      let url = segment.url + '/sec' + seconds + '.jpg';

      imgArr.push((
        <img src={ url } style={{
          ...imgStyles,
          marginLeft: ((imgStyles.width + gutter) * blankImages) + gutter
        }} key={ i }/>
      ));
      blankImages = 0;
    }
    return (
      <div ref={ options.measureRef } className={ this.props.classes.thumbnailHolder } >
        { imgArr }
      </div>
    );
  }
}

export default connect(mapStateToProps)(withStyles(styles)(Minimap));

function mapStateToProps(state) {
  return {
    ...state.workerState,
    zoom: state.zoom
  };
}

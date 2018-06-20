// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux'
import { push } from 'react-router-redux'
import raf from 'raf';
import debounce from 'debounce';
import document from 'global/document';
import { withStyles } from '@material-ui/core/styles';

import theme from '../../theme';
import TimelineWorker from '../../timeline';
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
    },
    segment: {
      position: 'relative',
      height: '100%',
      background: 'linear-gradient(to bottom, ' + theme.palette.grey[200] + 'ff 0%, ' + theme.palette.grey[200] + '55 100%)'
    },
    segmentColor: {
      position: 'absolute',
      display: 'inline-block',
      height: '100%',
      width: '100%',
      '&.active': {
        background: 'linear-gradient(to bottom, rgb(20, 200, 20) 0%, rgb(0, 70, 0) 100%)'
      },
      '&.engage': {
        background: 'linear-gradient(to bottom, rgb(20, 200, 20) 0%, rgb(0, 70, 0) 100%)'
      },
      '&.alert': {
        '&.userPrompt': {
          background: 'linear-gradient(to bottom, ' + theme.palette.error.main + ' 0%, ' + theme.palette.error.dark + ' 100%)'
        },
        '&.critical': {
          background: 'linear-gradient(to bottom, ' + theme.palette.error.dark + ' 0%, ' + theme.palette.error.dark + ' 100%)'
        }
      }
    },
    uncoloredSegment: {
      height: '100%',
      width: '100%',
      backgroundColor: 'transparent',
      background: 'linear-gradient(to bottom, ' + theme.palette.grey[200] + 'ff 0%, ' + theme.palette.grey[200] + '55 100%)'
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

    this.sendSeek = debounce(this.sendSeek.bind(this), 1000 / 60);

    this.offsetValue = React.createRef();
    this.progressBar = React.createRef();
    this.dragBar = React.createRef();

    this.state = {
      dragStart: null,
      zoom: this.props.zoomOverride || this.props.zoom
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
    if (minOffset > TimelineWorker.currentOffset()) {
      TimelineWorker.seek(minOffset);
    }
  }
  componentWillMount () {
    document.addEventListener('mouseup', this.handleUp, false);
    this.stopListening = TimelineWorker.onIndexed(() => this.forceUpdate());
  }
  componentWillUnmount () {
    document.removeEventListener('mouseup', this.handleUp, false);
    this.stopListening();
  }
  componentDidMount () {
    raf(this.renderOffset);
  }
  renderOffset () {
    if (this.progressBar.current && this.progressBar.current.parentElement) {
      let offset = TimelineWorker.currentOffset();
      if (this.seekIndex) {
        offset = this.seekIndex;
      }
      offset = Math.floor(offset);

      let percent = this.offsetToPercent(offset);

      this.progressBar.current.style.width = ~~(10000 * percent) / 100 + '%';

      raf(this.renderOffset);
    }
  }
  handleClick (e) {
    if (this.isDragSelecting) {
      console.log('Is a drag event');
      this.isDragSelecting = false;
      return;
    }
    console.log(e.currentTarget);
    let boundingBox = e.currentTarget.getBoundingClientRect();
    let x = e.pageX - boundingBox.x;
    let percent = x / boundingBox.width;

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

    let boundingBox = e.currentTarget.getBoundingClientRect();
    let x = e.pageX - boundingBox.x;
    let percent = x / boundingBox.width;
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
    // make sure they're clicking & dragging and not just moving the mouse around
    if (e.currentTarget.parentElement.querySelector('.' + this.props.classes.holder + ':active') !== e.currentTarget) {
      return;
    }

    if (!this.props.dragSelection) {
      let boundingBox = e.currentTarget.getBoundingClientRect();
      let x = e.pageX - boundingBox.x;
      let percent = x / boundingBox.width;

      this.seekIndex = this.percentToOffset(percent);

      return this.sendSeek();
    } else if (this.state.dragStart) {
      let boundingBox = e.currentTarget.getBoundingClientRect();
      let x = e.pageX - boundingBox.x;
      let percent = x / boundingBox.width;
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
      return 'linear-gradient(to left, rgba(25, 255, 25, 0.5), rgba(25, 255, 25, 0.1) 200px, rgba(255, 255, 255, 0) 250px)';
    } else {
      let color = theme.palette.grey[50] + '99';
      let endColor = theme.palette.grey[999] + '00';
      // return 'linear-gradient(to left, rgba(25, 255, 25, 0.5), rgba(25, 255, 25, 0.1) 200px, rgba(255, 255, 255, 0) 250px)';
      return 'linear-gradient(to left, ' + color + ', ' + endColor + ' 200px';
    }
  }
  render () {
    return (
      <div className={ this.props.className } style={ this.props.style } >
        <div
          className={ this.props.classes.holder + ' ' + (this.props.rounded ? this.props.classes.rounded : '') }
          onMouseDown={ this.handleDown }
          onMouseUp={ this.handleUp }
          onMouseMove={ this.handleMove }
          onClick={ this.handleClick } >
          <div className={ this.props.classes.segments }>
            { this.props.segments ? this.props.segments.map(this.renderSegment) : [] }
          </div>
          { this.renderDragger() }
          { this.renderZoom() }
          <div style={{ background: this.progressBarBackground() }} className={ this.props.classes.progressBar } ref={this.progressBar} />
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
        <div key={ segment.route } style={ style } className={ this.props.classes.segment }>
          { this.renderSegmentEvents(segment) }
        </div>
      );
    } else {
      return (
        <div key={ segment.route } style={ style } className={ this.props.classes.segment }>
          <div className={ this.props.classes.uncoloredSegment }>
          </div>
        </div>
      );
    }
  }
  renderSegmentEvents (segment) {
    return segment.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event) => {
        let style = {
          left: ((event.route_offset_millis / segment.duration) * 100) + '%',
          width: (((event.data.end_route_offset_millis - event.route_offset_millis) / segment.duration) * 100) + '%',
        };
        return (
          <div
            key={ segment.route + event.route_offset_millis }
            style={ style }
            className={ this.props.classes.segmentColor + ' ' + event.type + (event.data.alertStatus ? ' ' + AlertStatusCodes[event.data.alertStatus] : '') }
            >
          </div>
        );
      });
  }
}

export default connect(mapStateToProps)(withStyles(styles)(Minimap));

function mapStateToProps(state) {
  return {
    ...state.workerState,
    zoom: state.zoom
  };
}

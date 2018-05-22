// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux'
import raf from 'raf';
import debounce from 'debounce';
import document from 'global/document';
import TimelineWorker from '../../timeline';
import './index.css';

class Minimap extends Component {
  constructor (props) {
    super(props);

    this.renderOffset = this.renderOffset.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.renderSegment = this.renderSegment.bind(this);

    this.sendSeek = debounce(this.sendSeek.bind(this), 1000 / 60);

    this.offsetValue = React.createRef();
    this.progressBar = React.createRef();
    this.eventView = React.createRef();
  }
  componentDidMount () {
    raf(this.renderOffset);
  }
  renderOffset () {
    if (this.offsetValue.current && this.offsetValue.current.parentElement) {
      let offset = TimelineWorker.currentOffset();
      var lastEvent = TimelineWorker.lastEvents(50, offset);
      if (!lastEvent.length) {
        this.eventView.current.innerHTML = '';
      } else if (this.lastLastEvent !== lastEvent[0].LogMonoTime) {
        this.eventView.current.innerHTML = lastEvent
          // .filter((log) => log.Can)
          // .slice(0, 10)
          .map((log) => {
            if (log.LogMessage) {
              return {
                LogMonoTime: log.LogMonoTime,
                LogMessage: JSON.parse(log.LogMessage)
              };
            }
            return log;
          })
          .map(JSON.stringify.bind(JSON)).join('\n');
        this.lastLastEvent = lastEvent[0].LogMonoTime;
      }
      if (this.seekIndex) {
        offset = this.seekIndex;
      }
      offset = Math.floor(offset);
      let seconds = Math.floor(offset / 1000);
      let minutes = Math.floor(seconds / 60);
      let hours = Math.floor(minutes / 60);
      let timeStr = [
        hours,
        ('0' + (minutes % 60)).substr(-2, 2),
        ('0' + (seconds % 60)).substr(-2, 2),
        ('00' + (offset % 1000)).substr(-3, 3)
      ].join(':');

      this.offsetValue.current.innerHTML = timeStr;
      this.progressBar.current.style.width = ~~(10000 * offset / this.props.range) / 100 + '%';

      raf(this.renderOffset);
    }
  }
  handleClick (e) {
    TimelineWorker.seek(e.pageX / this.eventView.current.clientWidth * this.props.range);
  }
  handleMove (e) {
    // make sure they're clicking & dragging and not just moving the mouse around
    if (e.currentTarget.parentElement.querySelector('.minimap-holder:active') !== e.currentTarget) {
      return;
    }
    let percent = e.pageX / this.eventView.current.clientWidth;
    this.seekIndex = percent * this.props.range;
    this.sendSeek();
  }
  sendSeek () {
    if (this.seekIndex) {
      TimelineWorker.seek(this.seekIndex);
      this.seekIndex = null;
    }
  }
  render () {
    return (
      <div>
        <div className="minimap-holder" onMouseMove={ this.handleMove } onClick={ this.handleClick }>
          <div className="segments">
            { this.props.segments ? this.props.segments.map(this.renderSegment) : [] }
          </div>
          <div className="minimap-progress-bar" ref={this.progressBar} />
          <span>
            Current offset:&nbsp;
            <span ref={this.offsetValue}>{ TimelineWorker.currentOffset() }</span>
          </span>
        </div>
        <pre style={{width: '100%', overflow: 'hidden'}} ref={this.eventView} />
        <pre>{ JSON.stringify(this.props, null, 2) }</pre>
      </div>
    );
  }
  renderSegment (segment) {
    let startPerc = 100 * segment.offset / this.props.range;
    let widthPerc = 100 * segment.duration / this.props.range;
    let style = {
      position: 'absolute',
      width: widthPerc + '%',
      left: startPerc + '%',
    }
    return (
      <div key={ segment.route } style={ style } className="segment">
        <div className="segment-color active">
        </div>
      </div>
    );
  }
}

export default connect(mapStateToProps)(Minimap);

function mapStateToProps(state) {
  return state.workerState;
}

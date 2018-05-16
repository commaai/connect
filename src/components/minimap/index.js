// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux'
import raf from 'raf';
import TimelineWorker from '../../timeline';
import document from 'global/document';
import './index.css';

class Minimap extends Component {
  constructor (props) {
    super(props);
    this.renderOffset = this.renderOffset.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleMove = this.handleMove.bind(this);

    this.offsetValue = React.createRef();
    this.progressBar = React.createRef();
  }
  componentDidMount () {
    raf(this.renderOffset);
  }
  renderOffset () {
    if (this.offsetValue.current && this.offsetValue.current.parentElement) {
      let offset = TimelineWorker.currentOffset();
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
      this.progressBar.current.style.width = ~~(10000 * TimelineWorker.currentOffset() / this.props.workerState.range) / 100 + '%';
      raf(this.renderOffset);
    }
  }
  handleClick (e) {
    TimelineWorker.seek(e.pageX / document.body.clientWidth * this.props.workerState.range);
  }
  handleMove (e) {
    // make sure they're clicking & dragging and not just moving the mouse around
    if (e.currentTarget.parentElement.querySelector('.minimap-holder:active') !== e.currentTarget) {
      return;
    }
    TimelineWorker.seek(e.pageX / document.body.clientWidth * this.props.workerState.range);
  }
  render () {
    return (
      <div>
        <div className="minimap-holder" onMouseMove={ this.handleMove } onClick={ this.handleClick }>
          <div className="minimap-progress-bar" ref={this.progressBar} />
          <span>
            Current offset:&nbsp;
            <span ref={this.offsetValue}>{ TimelineWorker.currentOffset() }</span>
          </span>
        </div>
        <pre>{ JSON.stringify(this.props, null, 2) }</pre>
      </div>
    );
  }
}

export default connect(mapStateToProps)(Minimap);

function mapStateToProps(state) {
  return state;
}

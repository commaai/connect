// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc
import React, { Component } from 'react';
import { connect } from 'react-redux'
import raf from 'raf';
import debounce from 'debounce';
import document from 'global/document';
import { withStyles } from '@material-ui/core/styles';

import theme from '../../theme';
import TimelineWorker from '../../timeline';

const styles = (theme) => {
  /* MINIMAP / PROGRESS BAR */
  return {
    holder: {
      position: 'relative',
      width: '100%',
      backgroundColor: '#000',
      minHeight: '45px',
      borderRadius: '10px 10px 0px 0px',
      overflow: 'hidden',
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
      height: '100%'
    },
    activeSegment: {
      height: '100%',
      width: '100%',
      backgroundColor: 'rgb(20, 200, 20)',
    },
    uncoloredSegment: {
      height: '100%',
      width: '100%',
      backgroundColor: 'transparent',
      background: 'linear-gradient(to bottom, ' + theme.palette.grey[200] + 'ff 0%, ' + theme.palette.grey[200] + '55 100%)'
    }
  };
};

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
      dragStart: null
    };
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

      this.progressBar.current.style.width = ~~(10000 * offset / this.props.range) / 100 + '%';

      raf(this.renderOffset);
    }
  }
  handleClick (e) {
    if (this.isDragSelecting) {
      console.log('Is a drag event');
      this.isDragSelecting = false;
      return;
    }
    let boundingBox = e.currentTarget.getBoundingClientRect();
    let x = e.pageX - boundingBox.x;
    TimelineWorker.seek(x / boundingBox.width * this.props.range);
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
    let selectedArea = Math.abs(this.state.dragStart - this.state.dragEnd) * 100;
    let startPercent = Math.min(this.state.dragStart, this.state.dragEnd);
    console.log(selectedArea);
    if (selectedArea > 0.5) {
      TimelineWorker.seek(startPercent * this.props.range);
      this.isDragSelecting = true;
      setTimeout(() => this.isDragSelecting = false);
    } else {
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
      this.seekIndex = percent * this.props.range;

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
  sendSeek () {
    if (this.seekIndex) {
      TimelineWorker.seek(this.seekIndex);
      this.seekIndex = null;
    }
  }
  progressBarBackground () {
    if (this.props.colored) {
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
          className={ this.props.classes.holder }
          onMouseDown={ this.handleDown }
          onMouseUp={ this.handleUp }
          onMouseMove={ this.handleMove }
          onClick={ this.handleClick } >
          <div className={ this.props.classes.segments }>
            { this.props.segments ? this.props.segments.map(this.renderSegment) : [] }
          </div>
          { this.renderDragger() }
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
    let endColor = theme.palette.grey[200] + '55';
    return (
      <div style={{
        background: 'linear-gradient(to left, ' + color + ', ' + endColor + ', ' + color + ')',
        left: (100 * Math.min(this.state.dragStart, this.state.dragEnd)) + '%',
        width: (100 * Math.abs(this.state.dragStart - this.state.dragEnd)) + '%',
      }} className={ this.props.classes.progressBar } ref={ this.dragBar } />
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
    if (this.props.colored) {
      return (
        <div key={ segment.route } style={ style } className={ this.props.classes.segment }>
          <div className={ this.props.classes.activeSegment }>
          </div>
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
}

export default connect(mapStateToProps)(withStyles(styles)(Minimap));

function mapStateToProps(state) {
  return state.workerState;
}

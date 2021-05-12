import { Component } from 'react';

class ResizeHandler extends Component {
  constructor(props) {
    super(props);

    this.resizeTimeout = null;
    this.handleResize = this.handleResize.bind(this);
  }

  componentWillMount() {
    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  handleResize() {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      this.props.onResize(window.innerWidth, window.innerHeight);
      this.resizeTimeout = null;
    }, 150);
  }

  render() {
    return null;
  }
}

export default ResizeHandler;

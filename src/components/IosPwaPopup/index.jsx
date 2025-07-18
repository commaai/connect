import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import localforage from 'localforage';
import { withStyles, Typography } from '@material-ui/core';
import { Clear } from '@material-ui/icons';

import MyCommaAuth from '@commaai/my-comma-auth';

import Colors from '../../colors';
import { IosShareIcon } from '../../icons';
import { isIos } from '../../utils/browser.js';

const styles = () => ({
  box: {
    margin: '0 auto',
    borderRadius: 22,
    padding: '12px 20px',
    color: Colors.white,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: Colors.grey500,
    border: `1px solid ${Colors.grey700}`,
  },
  hide: {
    cursor: 'pointer',
    padding: 5,
    fontSize: 20,
    position: 'relative',
    left: -30,
    top: -24,
    marginBottom: -32,
    height: 32,
    width: 32,
    borderRadius: 16,
    backgroundColor: Colors.grey900,
    color: Colors.white,
    border: `1px solid ${Colors.grey600}`,
  },
  title: {
    lineHeight: '31px',
    fontSize: 20,
    fontWeight: 600,
  },
  icon: {
    display: 'inline',
    verticalAlign: 'text-bottom',
    margin: '0 3px',
  },
});

class IosPwaPopup extends Component {
  constructor(props) {
    super(props);

    this.state = {
      show: false,
    };

    this.hide = this.hide.bind(this);
    this.onWindowClick = this.onWindowClick.bind(this);

    this.windowEvents = 0;
  }

  async componentDidMount() {
    if (window && window.navigator) { 
      const isStandalone = window.navigator.standalone === true;
      if (isIos() && !isStandalone && MyCommaAuth.isAuthenticated()) {
        let isHidden;
        try {
          isHidden = await localforage.getItem('hideIosPwaPopup');
        } catch (err) {
          isHidden = true;
        }
        this.setState({ show: !isHidden });
      }
    }
  }

  async componentDidUpdate(prevProps, prevState) {
    if (!prevState.show && this.state.show) {
      window.addEventListener('click', this.onWindowClick);
    } else if (prevState.show && !this.state.show) {
      window.removeEventListener('click', this.onWindowClick);
    }

    if (prevProps.pathname !== this.props.pathname) {
      this.hide();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('click', this.onWindowClick);
  }

  onWindowClick() {
    this.windowEvents += 1;
    if (this.windowEvents >= 3) {
      this.hide();
    }
  }

  hide() {
    try {
      localforage.setItem('hideIosPwaPopup', true);
    } catch (err) {
      // pass
    }
    this.setState({ show: false });
  }

  render() {
    const { classes } = this.props;
    const { show } = this.state;
    if (!show) {
      return null;
    }

    return (
      <div className="fixed bottom-3 left-3 right-3 z-20">
        <div className={`${classes.box} xs:w-fit`}>
          <Clear className={ classes.hide } onClick={ this.hide } />
          <Typography className={ classes.title }>Add to home screen</Typography>
          <Typography>
            Install this webapp on your home screen:
            {' '}
            <br />
            tap
            {' '}
            <img className={classes.icon} src={IosShareIcon} width={35 / 2.2} height={44 / 2.2} alt="share" />
            {' '}
            and then &lsquo;Add to Home Screen&rsquo;
          </Typography>
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  pathname: 'router.location.pathname',
});

export default connect(stateToProps)(withStyles(styles)(IosPwaPopup));

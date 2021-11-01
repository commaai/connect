import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';
import * as Sentry from '@sentry/react';
import { withStyles, Typography, IconButton, Button, CircularProgress } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import WarningIcon from '@material-ui/icons/Warning';

import { billing as Billing } from '@commaai/comma-api';

import { deviceTypePretty } from '../../utils';
import PrimeChecklist from './PrimeChecklist';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { primeNav } from '../../actions';

const styles = (theme) => ({
  primeBox: {
    display: 'flex',
    flexDirection: 'column',
    color: '#fff',
  },
  primeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 410,
    flexDirection: 'row',
    paddingRight: 20,
  },
  headerDevice: {
    display: 'flex',
    alignItems: 'center',
    '& :first-child': { marginRight: 8 },
  },
  primeBlock: {
    marginTop: 10,
  },
  moreInfoContainer: {
    '& p': { display: 'inline' },
    '& button': { display: 'inline', marginLeft: '15px' },
  },
  introLine: {
    fontWeight: 500,
    lineHeight: '23px',
  },
  checkList: {
    marginLeft: 10,
    marginBottom: 10,
  },
  checkListItem: {
    padding: '5px 0',
    '& svg': { margin: 0 },
  },
  deviceId: {
    color: '#525E66',
  },
  leftMargin: {
    marginLeft: 10,
  },
  deviceBlock: {
    marginLeft: 10,
    '& aside': { display: 'inline', marginRight: 5, },
    '& span': { display: 'inline', },
  },
  overviewBlock: {
    marginTop: 10,
  },
  overviewBlockError: {
    marginTop: 10,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockWarning: {
    marginTop: 10,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 100, 0, 0.3)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockLoading: {
    marginTop: 10,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  chargeText: {
    fontSize: 13,
  },
  buttons: {
    height: 48,
    background: Colors.white,
    borderRadius: 24,
    color: '#404B4F',
    textTransform: 'none',
    width: 200,
    '&:hover': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
    },
    '&:disabled': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
    },
    '&:disabled:hover': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
    }
  },
});

class PrimeCheckout extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      loadingCheckout: false,
      windowWidth: window.innerWidth,
    };

    this.gotoCheckout = this.gotoCheckout.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.stripe_cancelled && this.props.stripe_cancelled) {
      this.setState({ error: 'Checkout cancelled' });
    }
  }

  onPrimeActivated(resp) {
    if (resp.success) {
      this.setState({ activated: resp, error: null });
      Billing.getSubscription(this.props.dongleId).then((subscription) => {
        this.setState({ new_subscription: subscription });
      }).catch((err) => {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'prime_checkout_activated_fetch_sub' });
      });
    } else if (resp.error) {
      this.setState({ error: resp.error });
    }
  }

  async gotoCheckout() {
    this.setState({ loadingCheckout: true });
    try {
      const resp = await Billing.getStripeCheckout(this.props.dongleId, this.props.subscribeInfo.sim_id);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_checkout' });
    }
  }

  render() {
    const { classes, device, subscribeInfo } = this.props;
    const { windowWidth, error, loadingCheckout } = this.state;

    let chargeText = null;
    if (subscribeInfo) {
      chargeText = 'You will be charged $24.00 today and monthly thereafter.';
      if (subscribeInfo.trial_claimable) {
        const trialEndDate = fecha.format(this.props.subscribeInfo.trial_end * 1000, "MMMM Do");
        const claimEndDate =
          subscribeInfo.trial_claim_end ? fecha.format(subscribeInfo.trial_claim_end * 1000, "MMMM Do") : null;
        chargeText = `You will be charged $24.00 on ${trialEndDate} and monthly thereafter.` +
          (claimEndDate ? ` Trial offer only valid until ${claimEndDate}.` : '');
      }
    }

    const alias = device.alias || deviceTypePretty(device.device_type);
    const containerPadding = windowWidth > 520 ? '24px 36px 36px' : '2px 12px 12px';
    const buttonSmallStyle = windowWidth < 514 ? { width: '100%' } : {};

    return ( <>
      <div className={ classes.primeBox } style={{ padding: containerPadding }}>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <div className={ classes.primeHeader }>
          <IconButton aria-label="Go Back" onClick={() => this.props.dispatch(primeNav(false)) }>
            <KeyboardBackspaceIcon />
          </IconButton>
          <div className={ classes.headerDevice }>
            <Typography variant="body2">{ alias }</Typography>
            <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
          </div>
        </div>
        <Typography className={ classes.introLine }>Become a comma prime member today for only $24/month</Typography>
        <PrimeChecklist />
        { error && <div className={ classes.overviewBlockError }>
          <ErrorIcon />
          <Typography>{ error }</Typography>
        </div> }
        { !subscribeInfo && <div className={ classes.overviewBlockLoading }>
          <CircularProgress size={ 19 } style={{ color: Colors.white }} />
          <Typography>Fetching SIM data</Typography>
        </div> }
        { Boolean(subscribeInfo && !subscribeInfo.sim_id) &&
          <div className={ classes.overviewBlockError }>
            <ErrorIcon />
            <Typography>
              { subscribeInfo.device_online ?
                'No SIM detected. Ensure SIM is securely inserted and try again.' :
                'Could not reach device, connect device to the internet and try again.' }
            </Typography>
          </div>
        }
        { Boolean(subscribeInfo && subscribeInfo.sim_id && !subscribeInfo.is_prime_sim) &&
          <div className={ classes.overviewBlockWarning }>
            <WarningIcon />
            <Typography>
              Third-party SIM detected, comma prime can be activated, but no data connection will be provided.
            </Typography>
          </div>
        }
        <div className={ classes.overviewBlock }>
          <Button className={ `${classes.buttons} gotoCheckout` } style={ buttonSmallStyle } onClick={ this.gotoCheckout }
            disabled={ Boolean(!subscribeInfo || !subscribeInfo.sim_id || loadingCheckout) }>
            { loadingCheckout ?
              <CircularProgress size={ 19 } /> :
              ((subscribeInfo && subscribeInfo.trial_claimable) ? 'Claim trial' : 'Go to checkout')
            }
          </Button>
        </div>
        { chargeText &&
          <div className={ classes.overviewBlock }>
            <Typography className={ classes.chargeText }>{ chargeText }</Typography>
          </div>
        }
      </div>
    </> );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  device: 'workerState.device',
  subscribeInfo: 'workerState.subscribeInfo',
});

export default connect(stateToProps)(withStyles(styles)(PrimeCheckout));


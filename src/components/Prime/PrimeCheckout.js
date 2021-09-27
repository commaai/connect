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
import { primeNav, primeFetchSubscription } from '../../actions';

const styles = (theme) => ({
  primeBox: {
    display: 'flex',
    flexDirection: 'column',
  },
  primeContainer: {
    borderBottom: `1px solid ${Colors.white10}`,
    color: '#fff',
  },
  primeBlock: {
    marginTop: 10,
  },
  moreInfoContainer: {
    '& p': { display: 'inline' },
    '& button': { display: 'inline', marginLeft: '15px' },
  },
  introLine: {
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
    marginTop: 20,
  },
  overviewBlockError: {
    marginTop: 15,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockWarning: {
    marginTop: 15,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 100, 0, 0.3)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockLoading: {
    marginTop: 15,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  chargeText: {
    marginBottom: 10,
  },
  buttons: {
    marginTop: 10,
    background: Colors.white,
    borderRadius: 18,
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
      windowWidth: window.innerWidth,
    };

    this.gotoCheckout = this.gotoCheckout.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.stripe_cancelled && this.props.stripe_cancelled) {
      this.setState({ error: 'checkout cancelled' });
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
    try {
      const resp = await Billing.getStripeCheckout(this.props.dongleId, this.state.simInfo.sim_id);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_checkout' });
    }
  }

  render() {
    const { windowWidth, error } = this.state;

    let chargeText = [];
    if (subscribeInfo) {
      chargeText = ['You will be charged $24.00 today and monthly thereafter.'];
      if (subscribeInfo.trial_claimable) {
        const trialEndDate = fecha.format(this.props.subscribeInfo.trial_end * 1000, "MMMM Do");
        chargeText = [`Fill in your payment information to claim your trial.`,
        `You will be charged $24.00 on ${trialEndDate} and monthly thereafter.`];
        if (subscribeInfo.trial_claim_end) {
          const claimEndDate = fecha.format(this.props.subscribeInfo.trial_claim_end * 1000, "MMMM Do");
          chargeText.push(`Offer only valid until ${claimEndDate}.`);
        }
      }
    }

    const alias = device.alias || deviceTypePretty(device.device_type);
    const containerPadding = windowWidth > 520 ? 36 : 16;

    return ( <>
      <div className={ classes.primeBox }>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <div className={ classes.primeContainer } style={{ padding: `8px ${containerPadding}px` }}>
          <IconButton aria-label="Go Back" onClick={() => this.props.dispatch(primeNav(false)) }>
            <KeyboardBackspaceIcon />
          </IconButton>
        </div>
        <div className={ classes.primeContainer } style={{ padding: `16px ${containerPadding}px` }}>
          <Typography variant="title">comma prime</Typography>
          <Typography className={ classes.introLine }>Become a comma prime member today for only $24/month</Typography>
          <PrimeChecklist />
        </div>
        <div className={ classes.primeContainer } style={{ padding: `16px ${containerPadding}px` }}>
          <Typography variant="title">checkout</Typography>
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
            <Typography variant="subheading">Device</Typography>
            <div className={ classes.deviceBlock }>
              <Typography variant="body2">{ alias }</Typography>
              <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
            </div>
          </div>
          <div className={ classes.overviewBlock }>
            { chargeText.map((txt, i) => {
              return <Typography key={i} className={ classes.chargeText }>{ txt }</Typography>
            }) }
          </div>
          <div className={ classes.overviewBlock + " " + classes.paymentElement }>
            <Button className={ classes.buttons } onClick={ this.gotoCheckout }
              disabled={ Boolean(!subscribeInfo || !subscribeInfo.sim_id) }>
              Go to checkout
            </Button>
          </div>
        </div>
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


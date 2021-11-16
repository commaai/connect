import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';
import * as Sentry from '@sentry/react';
import { withStyles, Typography, IconButton, Button, CircularProgress, List, ListItem, ListItemIcon, ListItemText
  } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import WarningIcon from '@material-ui/icons/Warning';
import CheckIcon from '@material-ui/icons/Check';

import { billing as Billing } from '@commaai/comma-api';

import { deviceTypePretty } from '../../utils';
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
    height: 32,
    width: '100%',
    background: Colors.white,
    borderRadius: 18,
    color: '#404B4F',
    textTransform: 'none',
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
  checkList: {
    marginLeft: 12,
    '& span': { fontSize: 14 },
  },
  checkListItem: {
    padding: 0,
    '& svg': {
      alignSelf: 'flex-start',
      fontSize: 21,
      marginRight: 0,
    },
  },
  learnMore: {
    '& a': { color: 'white' },
  },
  primeTitle: {
    margin: '0 12px',
  },
  planBox: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  plan: {
    cursor: 'pointer',
    height: 140,
    width: 165,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-around',
    border: `1px solid transparent`,
    backgroundColor: Colors.white10,
    padding: '8px 0',
    borderRadius: 18,
    fontWeight: 600,
    textAlign: 'center',
    '&:first-child': { marginRight: 2 },
    '&:last-child': { marginLeft: 2 },
    '& p': {
      margin: 0,
    },
  },
  planName: {
    fontSize: '1.2rem',
  },
  planPrice: {
    fontSize: '1.5rem',
  },
  planSubtext: {
      fontWeight: 'normal',
      fontSize: '0.8rem',
  },
});

class PrimeCheckout extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      loadingCheckout: false,
      selectedPlan: null,
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

  async gotoCheckout(plan) {
    const { dongleId, subscribeInfo } =  this.props;
    this.setState({ loadingCheckout: true });
    try {
      const resp = await Billing.getStripeCheckout(dongleId, subscribeInfo.sim_id, plan);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_checkout' });
    }
  }

  render() {
    const { classes, device, subscribeInfo } = this.props;
    const { windowWidth, error, loadingCheckout, selectedPlan } = this.state;

    const listItems = [
      ['24/7 connectivity', null],
      ['Take pictures remotely', null],
      ['1 year storage of drive videos', null],
      ['Simple SSH for developers', null],
      ['Turn-by-turn navigation', 'comma three only'],
    ];

    let chargeText = null;
    if (selectedPlan && subscribeInfo) {
      const price = selectedPlan === 'data' ? '$24.00' : '$16.00';
      chargeText = `You will be charged ${price} today and monthly thereafter.`;
      if (subscribeInfo.trial_claimable) {
        const trialEndDate = fecha.format(this.props.subscribeInfo.trial_end * 1000, "MMMM Do");
        const claimEndDate =
          subscribeInfo.trial_claim_end ? fecha.format(subscribeInfo.trial_claim_end * 1000, "MMMM Do") : null;
        chargeText = `You will be charged ${price} on ${trialEndDate} and monthly thereafter.` +
          (claimEndDate ? ` Trial offer only valid until ${claimEndDate}.` : '');
      }
    }

    const alias = device.alias || deviceTypePretty(device.device_type);
    const containerPadding = windowWidth > 520 ? '24px 36px 36px' : '2px 12px 12px';
    const paddingStyle = windowWidth > 520 ? { paddingLeft: 7, paddingRight: 7 } : { paddingLeft: 8, paddingRight: 8 };
    const selectedStyle = { border: '1px solid white' };

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
        <h2 className={ classes.primeTitle }>comma prime</h2>
        <div className={ classes.overviewBlock }>
          <List className={ classes.checkList }>
            { listItems.map((listItemText, i) => {
              return <ListItem key={ i } className={ classes.checkListItem } style={ paddingStyle }>
                <ListItemIcon><CheckIcon /></ListItemIcon>
                <ListItemText primary={ listItemText[0] } secondary={ listItemText[1] } />
              </ListItem>;
            }) }
          </List>
        </div>
        <div className={ classes.overviewBlock }>
          <div className={ classes.planBox }>
            <div className={ classes.plan } style={ selectedPlan === 'nodata' ? selectedStyle : {} }
              onClick={ () => this.setState({ selectedPlan: 'nodata' }) }>
              <p className={ classes.planName }>basic</p>
              <p className={ classes.planPrice }>$16/month</p>
              <p className={ classes.planSubtext }>external internet<br />connection required</p>
            </div>
            <div className={ classes.plan } style={ selectedPlan === 'data' ? selectedStyle : {} }
              onClick={ () => this.setState({ selectedPlan: 'data' }) }>
              <p className={ classes.planName }>unlimited</p>
              <p className={ classes.planPrice }>$24/month</p>
              <p className={ classes.planSubtext }>unlimited 512kbps data<br />only offered in the U.S.</p>
            </div>
          </div>
        </div>
        <div className={ classes.overviewBlock }>
          <Typography className={ classes.learnMore }>
            Learn more about comma prime from our <a target="_blank" href="https://comma.ai/prime#faq">FAQ</a>
          </Typography>
        </div>
        { error && <div className={ classes.overviewBlockError }>
          <ErrorIcon />
          <Typography>{ error }</Typography>
        </div> }
        { Boolean(selectedPlan === 'data' && !subscribeInfo) && <div className={ classes.overviewBlockLoading }>
          <CircularProgress size={ 19 } style={{ color: Colors.white }} />
          <Typography>Fetching SIM data</Typography>
        </div> }
        { Boolean(selectedPlan === 'data' && subscribeInfo && !subscribeInfo.sim_id) &&
          <div className={ classes.overviewBlockError }>
            <ErrorIcon />
            <Typography>
              { subscribeInfo.device_online ?
                'No SIM detected. Ensure SIM is securely inserted and try again.' :
                'Could not reach device, connect device to the internet and try again.' }
            </Typography>
          </div>
        }
        { Boolean(selectedPlan === 'data' && subscribeInfo && subscribeInfo.sim_id && !subscribeInfo.is_prime_sim) &&
          <div className={ classes.overviewBlockError }>
            <ErrorIcon />
            <Typography>
              Third-party SIM detected, comma prime with data plan cannot be activated.
            </Typography>
          </div>
        }
        <div className={ classes.overviewBlock }>
          <Button className={ `${classes.buttons} gotoCheckout` } onClick={ () => this.gotoCheckout('nodata') }
            disabled={ Boolean(!subscribeInfo || !subscribeInfo.sim_id || loadingCheckout || !selectedPlan) }>
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


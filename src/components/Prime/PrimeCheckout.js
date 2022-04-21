import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';
import * as Sentry from '@sentry/react';
import { withStyles, Typography, IconButton, Button, CircularProgress } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import InfoOutlineIcon from '@material-ui/icons/InfoOutline';
import CheckIcon from '@material-ui/icons/Check';

import { billing as Billing } from '@commaai/comma-api';

import { deviceTypePretty } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { primeNav, analyticsEvent } from '../../actions';

const styles = (theme) => ({
  primeBox: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 430,
    color: '#fff',
  },
  primeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 410,
    flexDirection: 'row',
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
  overviewBlockError: {
    borderRadius: 12,
    marginTop: 8,
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  overviewBlockDisabled: {
    marginTop: 12,
    borderRadius: 12,
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: Colors.white08,
    '& p': { display: 'inline-block', marginLeft: 10 },
    '& a': { color: Colors.white },
  },
  chargeText: {
    fontSize: 13,
  },
  buttons: {
    width: '100%',
    height: 42,
    borderRadius: 21,
    background: Colors.white,
    color: Colors.grey900,
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
    '&:disabled': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    },
    '&:disabled:hover': {
      backgroundColor: Colors.white70,
      color: Colors.grey900,
    }
  },
  checkList: {
    marginLeft: 12,
  },
  checkListItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 4,
    '& svg': {
      alignSelf: 'flex-start',
      fontSize: 21,
    },
    '& p': {
      fontSize: 14,
      margin: '0 0 0 14px',
    },
    '& span': {
      color: Colors.white70,
      fontSize: 12,
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
    height: 140,
  },
  planBoxContainer: {
    position: 'relative',
    marginLeft: -6,
    marginRight: -6,
  },
  plan: {
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    width: 160,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-around',
    border: '2px solid transparent',
    backgroundColor: Colors.white10,
    padding: '8px 0',
    borderRadius: 18,
    fontWeight: 600,
    textAlign: 'center',
    position: 'relative',
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
  planDisabled: {
    backgroundColor: Colors.white05,
    color: Colors.white40,
    cursor: 'default',
  },
  planInfoLoading: {
    backgroundColor: Colors.white03,
    color: Colors.white20,
    cursor: 'default',
  },
  planLoading: {
    position: 'absolute',
    top: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    '& p': {
      marginTop: 10,
      fontSize: '0.9rem',
    },
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
      windowHeight: window.innerHeight,
    };

    this.gotoCheckout = this.gotoCheckout.bind(this);
    this.trialClaimable = this.trialClaimable.bind(this);
    this.dataPlanAvailable = this.dataPlanAvailable.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    const { stripe_cancelled, subscribeInfo } = this.props;
    if (!prevProps.stripe_cancelled && stripe_cancelled) {
      this.setState({ error: 'Checkout cancelled' });
    }

    if (this.state.selectedPlan === null && subscribeInfo) {
      const plan = this.dataPlanAvailable() ? 'data' : 'nodata';
      this.setState({ selectedPlan: plan });
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
    const { dongleId, subscribeInfo } =  this.props;
    this.setState({ loadingCheckout: true });
    try {
      const resp = await Billing.getStripeCheckout(dongleId, subscribeInfo.sim_id, this.state.selectedPlan);
      this.props.dispatch(analyticsEvent('prime_checkout', { plan: this.state.selectedPlan }));
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_checkout' });
    }
  }

  dataPlanAvailable() {
    const { device, subscribeInfo } = this.props;
    if (!device || !subscribeInfo) {
      return null;
    }

    return Boolean(
      device.device_type === 'three' &&
      subscribeInfo &&
      subscribeInfo.sim_id &&
      subscribeInfo.is_prime_sim &&
      subscribeInfo.sim_usable !== false &&
      ['blue', 'magenta_new'].includes(subscribeInfo.sim_type)
    );
  }

  trialClaimable() {
    const { subscribeInfo } = this.props;
    const { selectedPlan } = this.state;
    if (!subscribeInfo) {
      return null;
    }
    if (selectedPlan === 'data') {
      return Boolean(subscribeInfo.trial_end_data);
    } else if (selectedPlan === 'nodata') {
      return Boolean(subscribeInfo.trial_end_nodata);
    } else {
      return Boolean(subscribeInfo.trial_end_data && subscribeInfo.trial_end_nodata);
    }
  }

  render() {
    const { classes, device, subscribeInfo } = this.props;
    const { windowWidth, windowHeight, error, loadingCheckout, selectedPlan } = this.state;

    let chargeText = null;
    if (selectedPlan && this.trialClaimable()) {
      let trialEndDate = null;
      let claimEndDate = null;
      if (selectedPlan === 'data') {
        trialEndDate = fecha.format(subscribeInfo.trial_end_data * 1000, "MMMM Do");
        claimEndDate = fecha.format(subscribeInfo.claim_end_data * 1000, "MMMM Do");
      } else if (selectedPlan === 'nodata') {
        trialEndDate = fecha.format(subscribeInfo.trial_end_nodata * 1000, "MMMM Do");
      }
      chargeText = `Your first charge will be on ${trialEndDate}, then monthly thereafter.` +
        (claimEndDate ? ` Trial offer only valid until ${claimEndDate}.` : '');
    }

    const alias = device.alias || deviceTypePretty(device.device_type);
    const containerPadding = windowWidth > 520 ? { margin: '18px 24px' } : { margin: '6px 12px' };
    const blockMargin = windowWidth > 520 ? { marginTop: 24 } : { marginTop: 8 };
    const paddingStyle = windowWidth > 520 ? { paddingLeft: 7, paddingRight: 7 } : { paddingLeft: 8, paddingRight: 8 };
    const selectedStyle = { border: '2px solid white' };
    const plansLoadingClass = !subscribeInfo ? classes.planInfoLoading : '';
    const disabledDataPlan = Boolean(!subscribeInfo || !this.dataPlanAvailable());
    const boxHeight = windowHeight > 600 ? { height: 140 } : { height: 110 };

    let disabledDataPlanText;
    if (subscribeInfo && disabledDataPlan) {
      if (device.device_type !== 'three') {
        disabledDataPlanText = 'Standard plan is only available for comma three.';
      } else if (!subscribeInfo.sim_id && subscribeInfo.device_online) {
        disabledDataPlanText = 'Standard plan not available, no SIM was detected. Ensure SIM is securely inserted and try again.';
      } else if (!subscribeInfo.sim_id) {
        disabledDataPlanText = 'Standard plan not available, device could not be reached. Connect device to the internet and try again.';
      } else if (!subscribeInfo.is_prime_sim) {
        disabledDataPlanText = 'Standard plan not available, detected a third-party SIM.';
      } else if (!['blue', 'magenta_new'].includes(subscribeInfo.sim_type)) {
        disabledDataPlanText = ['Standard plan not available, old SIM type detected, new SIM cards are available in the ',
          <a key={1} href="https://comma.ai/shop/products/comma-prime-sim-card">shop</a>];
      } else if (subscribeInfo.sim_usable === false && subscribeInfo.sim_type === 'blue') {
        disabledDataPlanText = ['Standard plan not available, SIM has been canceled and is therefore no longer usable, new SIM cards are available in the ',
          <a key={1} href="https://comma.ai/shop/products/comma-prime-sim-card">shop</a>];
      } else if (subscribeInfo.sim_usable === false) {
        disabledDataPlanText = ['Standard plan not available, SIM is no longer usable, new SIM cards are available in the ',
          <a key={1} href="https://comma.ai/shop/products/comma-prime-sim-card">shop</a>];
      }
    }

    return ( <>
      <div className={ classes.primeBox } style={ containerPadding }>
        <ResizeHandler onResize={ (windowWidth, windowHeight) => this.setState({ windowWidth, windowHeight }) } />
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
        <div style={ blockMargin }>
          <div className={ classes.checkList }>
            <div className={ classes.checkListItem } style={ paddingStyle }>
              <CheckIcon /><p>24/7 connectivity</p>
            </div>
            <div className={ classes.checkListItem } style={ paddingStyle }>
              <CheckIcon /><p>Take pictures remotely</p>
            </div>
            <div className={ classes.checkListItem } style={ paddingStyle }>
              <CheckIcon /><p>1 year storage of drive videos</p>
            </div>
            <div className={ classes.checkListItem } style={ paddingStyle }>
              <CheckIcon /><p>Simple SSH for developers</p>
            </div>
            <div className={ classes.checkListItem } style={ paddingStyle }>
              <CheckIcon /><p>Turn-by-turn navigation <span>comma three only</span></p>
            </div>
          </div>
        </div>
        <div className={ classes.planBoxContainer } style={ blockMargin }>
          <div className={ classes.planBox } style={ boxHeight }>
            <div className={ `${classes.plan} ${plansLoadingClass}` }
              style={ selectedPlan === 'nodata' ? selectedStyle : {} }
              onClick={ Boolean(subscribeInfo) ? () => this.setState({ selectedPlan: 'nodata' }) : null }>
              <p className={ classes.planName }>lite</p>
              <p className={ classes.planPrice }>$16/month</p>
              <p className={ classes.planSubtext }>bring your own<br />sim card</p>
            </div>
            <div className={ `${classes.plan} ${disabledDataPlan ? classes.planDisabled : ''} ${plansLoadingClass}` }
              style={ selectedPlan === 'data' ? selectedStyle : {} }
              onClick={ !disabledDataPlan ? () => this.setState({ selectedPlan: 'data' }) : null }>
              <p className={ classes.planName }>standard</p>
              <p className={ classes.planPrice }>$24/month</p>
              <p className={ classes.planSubtext }>including data plan<br />only offered in the U.S.</p>
            </div>
          </div>
          { !subscribeInfo &&
            <div className={ classes.planLoading }>
              <CircularProgress size={ 38 } style={{ color: Colors.white }} />
              <Typography>Fetching SIM data</Typography>
            </div>
          }
        </div>
        { disabledDataPlanText && <div className={ classes.overviewBlockDisabled } style={ blockMargin }>
          <InfoOutlineIcon />
          <Typography>{ disabledDataPlanText }</Typography>
        </div> }
        <div style={ blockMargin }>
          <Typography className={ classes.learnMore }>
            Learn more about comma prime from our <a target="_blank" href="https://comma.ai/prime#faq">FAQ</a>
          </Typography>
        </div>
        { error && <div className={ classes.overviewBlockError }>
          <ErrorIcon />
          <Typography>{ error }</Typography>
        </div> }
        <div style={ blockMargin }>
          <Button className={ `${classes.buttons} gotoCheckout` }
            onClick={ () => this.gotoCheckout() }
            disabled={ Boolean(!subscribeInfo || loadingCheckout || !selectedPlan) }>
            { loadingCheckout ?
              <CircularProgress size={ 19 } /> :
              (this.trialClaimable() ? 'Claim trial' : 'Go to checkout')
            }
          </Button>
        </div>
        { chargeText &&
          <div style={ blockMargin }>
            <Typography className={ classes.chargeText }>{ chargeText }</Typography>
          </div>
        }
      </div>
    </> );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  device: 'device',
  subscribeInfo: 'subscribeInfo',
});

export default connect(stateToProps)(withStyles(styles)(PrimeCheckout));


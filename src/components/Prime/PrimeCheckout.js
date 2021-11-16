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
    marginLeft: 24,
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
  plan: {
    '& > div': {
      borderLeft: `1px solid ${Colors.white50}`,
      borderRight: `1px solid ${Colors.white50}`,
      '&:first-child': {
        borderRadius: '18px 18px 0 0',
        borderTop: `1px solid ${Colors.white50}`,
      },
      '&:last-child': {
        paddingBottom: 8,
        borderRadius: '0 0 18px 18px',
        borderBottom: `1px solid ${Colors.white50}`,
      },
    },
  },
  planHeaderBox: {
    paddingTop: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  planHeader: {
    fontWeight: 600,
    '& span': {
      fontWeight: 'normal',
      fontSize: '0.8rem',
    },
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
      ['On-device navigation', null],
      ['1 year storage of drive videos', null],
      ['Simple SSH for developers', null],
    ];

    const listItems2 = [
      ['All basic comma prime perks', null],
      ['24/7 connectivity', null],
      ['Unlimited data at 512kbps', 'only offered in the United States'],
    ]

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
    const paddingStyle = windowWidth > 520 ? { paddingLeft: 7, paddingRight: 7 } : { paddingLeft: 8, paddingRight: 8 };

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
        <div className={ classes.overviewBlock }>
          <div className={ classes.plan }>
            <div className={ classes.planHeaderBox }>
              <div className={ classes.planHeader } style={ paddingStyle }>
                basic comma prime ($16/month)<br />
                <span>internet connection required</span>
              </div>
            </div>
            <div style={ paddingStyle }>
              <List className={ classes.checkList }>
                { listItems.map((listItemText, i) => {
                  return <ListItem key={ i } className={ classes.checkListItem } style={ paddingStyle }>
                    <ListItemIcon><CheckIcon /></ListItemIcon>
                    <ListItemText primary={ listItemText[0] } secondary={ listItemText[1] } />
                  </ListItem>;
                }) }
              </List>
            </div>
            <div style={ paddingStyle }>
              <Button className={ `${classes.buttons} gotoCheckout` } onClick={ () => this.gotoCheckout('nodata') }
                disabled={ Boolean(!subscribeInfo || !subscribeInfo.sim_id || loadingCheckout) }>
                { loadingCheckout ?
                  <CircularProgress size={ 19 } /> :
                  ((subscribeInfo && subscribeInfo.trial_claimable) ? 'Claim trial' : 'Go to checkout')
                }
              </Button>
            </div>
          </div>
        </div>
        <div className={ classes.overviewBlock }>
          <div className={ classes.plan }>
            <div className={ classes.planHeaderBox }>
              <div className={ classes.planHeader } style={ paddingStyle }>
                unlimited comma prime ($24/month)
              </div>
            </div>
            <div style={ paddingStyle }>
              <List className={ classes.checkList }>
                { listItems2.map((listItemText, i) => {
                  return <ListItem key={ i } className={ classes.checkListItem } style={ paddingStyle }>
                    <ListItemIcon><CheckIcon /></ListItemIcon>
                    <ListItemText primary={ listItemText[0] } secondary={ listItemText[1] } />
                  </ListItem>;
                }) }
              </List>
            </div>
            <div style={ paddingStyle }>
              <Button className={ `${classes.buttons} gotoCheckout` } onClick={ () => this.gotoCheckout('nodata') }
                disabled={ Boolean(!subscribeInfo || !subscribeInfo.sim_id || loadingCheckout) }>
                { loadingCheckout ?
                  <CircularProgress size={ 19 } /> :
                  ((subscribeInfo && subscribeInfo.trial_claimable) ? 'Claim trial' : 'Go to checkout')
                }
              </Button>
            </div>
          </div>
        </div>
        <div className={ classes.overviewBlock }>
          <Typography className={ classes.learnMore }>
            Learn more about comma prime from our <a rel="noreferrer" target="_blank" href="https://comma.ai/prime#faq">FAQ</a>
          </Typography>
        </div>
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


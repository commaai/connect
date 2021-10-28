import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';
import * as Sentry from '@sentry/react';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import { withStyles, Typography, Button, Modal, Paper, IconButton, CircularProgress } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';

import { billing as Billing} from '@commaai/comma-api'
import { deviceTypePretty } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import Timelineworker from '../../timeline';
import { primeNav } from '../../actions';

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
  overviewBlockSuccess: {
    marginTop: 15,
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    '& p': {
      display: 'inline-block',
      marginLeft: 10,
      '&:first-child': { fontWeight: 600 },
    },
  },
  overviewBlockLoading: {
    marginTop: 15,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  manageItem: {
    marginLeft: 10,
  },
  buttons: {
    marginTop: 10,
    background: Colors.white,
    borderRadius: 18,
    color: '#404B4F',
    textTransform: 'none',
    width: 220,
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
  cancelButton: {
    color: Colors.white,
    background: 'transparent',
    border: `1px solid ${Colors.grey500}`,
    '&:hover': {
      backgroundColor: Colors.white10,
      color: Colors.white,
    },
    '&:disabled': {
      backgroundColor: 'transparent',
      color: '#404B4F',
    },
    '&:disabled:hover': {
      backgroundColor: 'transparent',
      color: '#404B4F',
    }
  },
  modal: {
    position: 'absolute',
    padding: theme.spacing.unit * 2,
    width: theme.spacing.unit * 50,
    maxWidth: '90%',
    left: '50%',
    top: '40%',
    transform: 'translate(-50%, -50%)',
    '& p': {
      marginTop: 10,
    },
  },
  closeButton: {
    marginTop: 10,
    float: 'right',
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
  },
  cancelModalButton: {
    width: 170,
    marginTop: 10,
    backgroundColor: Colors.grey200,
    color: Colors.white,
    '&:hover': {
      backgroundColor: Colors.grey400,
    },
    '&:disabled': {
      backgroundColor: Colors.grey400,
    },
    '&:disabled:hover': {
      backgroundColor: Colors.grey400,
    },
  },
  cancelError: {
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    marginTop: 10,
    padding: 10,
    '& p': { margin: 0 },
  },
  cancelSuccess: {
    backgroundColor: 'rgba(0, 255, 0, 0.3)',
    marginTop: 10,
    padding: 10,
    '& p': { margin: 0 },
  },
  paymentElement: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    maxWidth: 450,
  },
});

class PrimeManage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      cancelError: null,
      cancelModal: false,
      canceling: false,
      stripeStatus: null,
      windowWidth: window.innerWidth,
    };

    this.cancelPrime = this.cancelPrime.bind(this);
    this.modalClose = this.modalClose.bind(this);
    this.fetchStripeSession = this.fetchStripeSession.bind(this);
    this.gotoUpdate = this.gotoUpdate.bind(this);
    this.fetchSubscription = this.fetchSubscription.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({});
    this.mounted = true;
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.stripe_success && this.props.stripe_success) {
      this.setState({
        stripeStatus: { sessionId: this.props.stripe_success, loading: true, paid: null },
      }, this.fetchStripeSession);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  cancelPrime() {
    this.setState({ canceling: true });
    Billing.cancelPrime(this.props.dongleId).then((resp) => {
      if (resp.success) {
        this.setState({ canceling: false, cancelError: null, cancelSuccess: 'Cancelled subscription.' });
      } else if (resp.error) {
        this.setState({ canceling: false, cancelError: resp.description });
      } else {
        this.setState({ canceling: false, cancelError: 'Could not cancel due to unknown error. Please try again.'})
      }
    }).catch((err) => {
      Sentry.captureException(err, { fingerprint: 'primemanage_cancel_prime' });
      this.setState({ canceling: false, cancelError: 'Could not cancel due to unknown error. Please try again.' });
    });
  }

  modalClose() {
    if (this.state.cancelSuccess) {
      window.location = window.location.origin + '/' + this.props.dongleId;
    } else {
      this.setState({ cancelModal: false });
    }
  }

  async gotoUpdate() {
    try {
      const resp = await Billing.getStripePortal(this.props.dongleId);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_update' });
    }
  }

  async fetchStripeSession() {
    const { dongleId } = this.props;
    const { stripeStatus } = this.state;
    if (!stripeStatus || !this.mounted) {
      return
    }

    try {
      const resp = await Billing.getStripeSession(dongleId, stripeStatus.sessionId);
      const status = resp['payment_status'];
      this.setState({ stripeStatus: {
        ...stripeStatus,
        paid: status,
        loading: status !== 'paid',
      }});
      if (status === 'paid') {
        this.fetchSubscription(true);
      } else {
        setTimeout(this.fetchStripeSession, 2000);
      }
    } catch (err) {
      // TODO error handling
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'prime_fetch_stripe_session' });
    }
  }

  async fetchSubscription(repeat = false) {
    const { dongleId, } = this.props;
    if (!this.mounted) {
      return;
    }
    try {
      const subscription = await Billing.getSubscription(dongleId);
      if (subscription.user_id) {
        Timelineworker.primeGetSubscription(dongleId, subscription);
      } else {
        setTimeout(() => this.fetchSubscription(true), 2000);
      }
    } catch (err) {
      if (err.message && err.message.indexOf('404') === 0) {
        if (repeat) {
          setTimeout(() => this.fetchSubscription(true), 2000);
        }
      } else {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'prime_fetch_subscription' });
      }
    }
  }

  render() {
    const { dongleId, subscription, classes, device } = this.props;
    const { windowWidth, stripeStatus } = this.state;

    const hasPrimeSub = subscription && subscription.user_id;

    if (!hasPrimeSub && !stripeStatus) {
      console.log('device has prime, but no subscription or stripe session');
      return null;
    }

    let joinDate, nextPaymentDate;
    if (hasPrimeSub) {
      joinDate = fecha.format(subscription.subscribed_at ? subscription.subscribed_at * 1000 : 0, 'MMMM Do, YYYY');
      nextPaymentDate = fecha.format(
        subscription.next_charge_at ? subscription.next_charge_at * 1000 : 0, 'MMMM Do, YYYY');
    }

    const alias = device.alias || deviceTypePretty(device.device_type);
    const containerPadding = windowWidth > 520 ? 36 : 16;
    const buttonSmallStyle = windowWidth < 514 ? { width: '100%' } : {};

    return (
      <>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <div className={ classes.primeBox }>
          <div className={ classes.primeContainer } style={{ padding: `8px ${containerPadding}px` }}>
            <IconButton aria-label="Go Back" onClick={() => this.props.dispatch(primeNav(false)) }>
              <KeyboardBackspaceIcon />
            </IconButton>
          </div>
          <div className={ classes.primeContainer } style={{ padding: `16px ${containerPadding}px` }}>
            <Typography variant="title">comma prime</Typography>
            { stripeStatus && <>
              { stripeStatus.paid !== 'paid' &&
                <div className={ classes.overviewBlockLoading }>
                  <CircularProgress size={ 19 } style={{ color: Colors.white }} />
                  <Typography>Waiting for confirmed payment</Typography>
                </div>
              }
              { Boolean(stripeStatus.paid === 'paid' && !hasPrimeSub) &&
                <div className={ classes.overviewBlockLoading }>
                  <CircularProgress size={ 19 } style={{ color: Colors.white }} />
                  <Typography>Processing subscription</Typography>
                </div>
              }
              { Boolean(stripeStatus.paid === 'paid' && hasPrimeSub) &&
                <div className={ classes.overviewBlockSuccess }>
                  <Typography>comma prime activated</Typography>
                  { subscription.is_prime_sim &&
                    <Typography>
                      Connectivity will be enabled as soon as activation propagates to your local cell tower.
                      Rebooting your device may help.
                    </Typography>
                  }
                </div>
              }
            </> }
            <div className={ classes.overviewBlock }>
              <Typography variant="subheading">Device</Typography>
              <div className={ classes.manageItem }>
                <Typography variant="body2">{ alias }</Typography>
                <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
              </div>
            </div>
            { hasPrimeSub && <>
              <div className={ classes.overviewBlock }>
                <Typography variant="subheading">Joined</Typography>
                <Typography className={ classes.manageItem }>{ joinDate }</Typography>
              </div>
              <div className={ classes.overviewBlock }>
                <Typography variant="subheading">Next payment</Typography>
                <Typography className={ classes.manageItem }>{ nextPaymentDate }</Typography>
              </div>
              <div className={ classes.overviewBlock }>
                <Typography variant="subheading">Amount</Typography>
                <Typography className={ classes.manageItem }>$24.00</Typography>
              </div>
              { this.state.error && <div className={ classes.overviewBlockError }>
                <ErrorIcon />
                <Typography>{ this.state.error }</Typography>
              </div> }
              <div className={ classes.overviewBlock + " " + classes.paymentElement }>
                <Button className={ classes.buttons } style={ buttonSmallStyle } onClick={ this.gotoUpdate }
                   disabled={ !hasPrimeSub }>
                  Update payment method
                </Button>
                <Button className={ `${classes.buttons} ${classes.cancelButton} primeCancel` } style={ buttonSmallStyle }
                  onClick={ () => this.setState({ cancelModal: true }) } disabled={ !hasPrimeSub }>
                  Cancel subscription
                </Button>
              </div>
            </> }
          </div>
        </div>
        <Modal open={ this.state.cancelModal } onClose={ this.modalClose }>
          <Paper className={classes.modal}>
            <Typography variant="title">Cancel prime subscription</Typography>
            { this.state.cancelError && <div className={ classes.cancelError }>
              <Typography>{ this.state.cancelError }</Typography>
            </div> }
            { this.state.cancelSuccess && <div className={ classes.cancelSuccess }>
              <Typography>{ this.state.cancelSuccess }</Typography>
            </div> }
            <Typography>Device: {alias} ({ dongleId })</Typography>
            <Typography>We're sorry to see you go.</Typography>
            <Typography>
              Cancelling will immediately suspend billing and comma prime membership benefits.
            </Typography>
            <Button variant="contained" className={ `${classes.cancelModalButton} primeModalCancel` }
              onClick={ this.cancelPrime } disabled={ Boolean(this.state.cancelSuccess || this.state.canceling) }>
              { this.state.canceling ?
                <CircularProgress size={ 19 } style={{ color: Colors.white }} /> :
                'Cancel subscription'
              }
            </Button>
            <Button variant="contained" className={ `${classes.closeButton} primeModalClose` }
              onClick={ this.modalClose }>
              Close
            </Button>
          </Paper>
        </Modal>
      </>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  device: 'workerState.device',
  subscription: 'workerState.subscription',
});

export default connect(stateToProps)(withStyles(styles)(PrimeManage));

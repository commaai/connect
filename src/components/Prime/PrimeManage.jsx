import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';
import * as Sentry from '@sentry/react';

import { withStyles, Typography, Button, Modal, Paper, IconButton, CircularProgress } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';
import PriorityHighIcon from '@material-ui/icons/PriorityHigh';

import { deviceNamePretty, deviceTypePretty } from '../../utils';
import { billing as Billing } from '../../api';
import Colors from '../../colors';
import { subscribeWindowSize } from '../../hooks/window';
import { ErrorOutline, InfoOutline } from '../../icons';
import { primeNav, primeGetSubscription, analyticsEvent } from '../../actions';
import CommacareBadge, { COMMACARE_URL } from '../CommacareBadge';
import { otherPrimePlan, primePlanName } from './primePlans';

export function primeSwitchErrorMessage(error, plan = 'data') {
  const status = error?.resp?.status;
  const planName = primePlanName(plan);

  if (error?.code === 'unexpected_response') {
    return `Billing returned an unexpected response. Your plan may not have changed. Please try switching to ${planName} again.`;
  }
  if (status === 400) {
    if (plan === 'data') {
      return 'Standard could not be activated. Make sure this device is eligible and has a usable, supported comma SIM, then try again.';
    }
    return `This subscription could not be switched to ${planName}. Please refresh the page and try again.`;
  }
  if (status === 401) {
    return 'Your session has expired. Sign in again, then try switching plans.';
  }
  if (status === 403) {
    return "You don't have permission to change this device's subscription.";
  }
  if (status >= 500) {
    return 'The billing service is having trouble right now. Your plan was not changed. Please try again later.';
  }
  return 'Could not reach the billing service. Check your internet connection and try again.';
}

const styles = (theme) => ({
  linkHighlight: {
    '&:link': {
      textDecoration: "underline",
      color: Colors.green300,
    },
    '&:visited': {
      textDecoration: "underline",
      color: Colors.green300,
    },
    '&:active': {
      textDecoration: "underline",
      color: Colors.green300,
    },
    '&:hover': {
      textDecoration: "underline",
      color: Colors.green400,
    },
  },
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
  overviewBlockDisabled: {
    marginTop: 12,
    borderRadius: 12,
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: Colors.white08,
    '& p': { display: 'inline-block', marginLeft: 10 },
    '& a': { color: 'white' },
  },
  manageItem: {
    marginLeft: 10,
    '& span': {
      color: Colors.white70,
      fontSize: '0.9em',
    },
  },
  buttons: {
    marginTop: 10,
    background: Colors.white,
    borderRadius: 18,
    color: Colors.grey900,
    textTransform: 'none',
    width: 220,
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
    },
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
      color: Colors.grey500,
    },
    '&:disabled:hover': {
      backgroundColor: 'transparent',
      color: Colors.grey500,
    },
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
    flexDirection: 'column',
    maxWidth: 450,
  },
  commacareWarning: {
    marginTop: 12,
    padding: 10,
    backgroundColor: Colors.orange200,
    color: Colors.white,
    '& a': { color: Colors.white, textDecoration: 'underline' },
    '& p': {
      marginTop: 0,
    },
  },
});

export class PrimeManage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      cancelError: null,
      cancelModal: false,
      canceling: false,
      planSwitchModal: false,
      planSwitchStatus: 'confirm',
      planSwitchMessage: null,
      planSwitchTarget: null,
      switchingPlan: false,
      stripeStatus: null,
      windowWidth: window.innerWidth,
    };

    this.cancelPrime = this.cancelPrime.bind(this);
    this.fetchStripeSession = this.fetchStripeSession.bind(this);
    this.gotoUpdate = this.gotoUpdate.bind(this);
    this.switchPlan = this.switchPlan.bind(this);
    this.fetchSubscription = this.fetchSubscription.bind(this);
  }

  componentDidMount() {
    this.unsubscribeWindowSize = subscribeWindowSize(({ width }) => {
      this.setState({ windowWidth: width });
    });
    this.componentDidUpdate({}, {});
    this.mounted = true;
  }

  componentDidUpdate(prevProps, prevState) {
    const { subscription } = this.props;
    const { stripeStatus } = this.state;

    if (!prevProps.stripeSuccess && this.props.stripeSuccess) {
      this.setState({
        stripeStatus: { sessionId: this.props.stripeSuccess, loading: true, paid: null },
      }, this.fetchStripeSession);
    }

    if ((subscription?.user_id && prevState.stripeStatus?.paid !== 'paid' && stripeStatus?.paid === 'paid')
      || (stripeStatus?.paid === 'paid' && !prevProps.subscription?.user_id && subscription?.user_id)) {
      this.props.dispatch(analyticsEvent('prime_paid', { plan: subscription.plan }));
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribeWindowSize?.();
  }

  cancelPrime() {
    this.setState({ canceling: true });
    this.props.dispatch(analyticsEvent('prime_cancel', { plan: this.props.subscription.plan }));
    Billing.cancelPrime(this.props.dongleId).then((resp) => {
      if (resp.success) {
        this.setState({ canceling: false, cancelError: null, cancelSuccess: 'Cancelled subscription.' });
        this.fetchSubscription();
      } else if (resp.error) {
        this.setState({ canceling: false, cancelError: resp.description });
      } else {
        this.setState({ canceling: false, cancelError: 'Could not cancel due to unknown error. Please try again.' });
      }
    }).catch((err) => {
      Sentry.captureException(err, { fingerprint: 'primemanage_cancel_prime' });
      this.setState({ canceling: false, cancelError: 'Could not cancel due to unknown error. Please try again.' });
    });
  }

  async gotoUpdate() {
    this.props.dispatch(analyticsEvent('prime_stripe_update', { plan: this.props.subscription.plan }));
    try {
      const resp = await Billing.getStripePortal(this.props.dongleId);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_update' });
    }
  }

  async switchPlan() {
    const { dispatch, dongleId, subscription } = this.props;
    const plan = this.state.planSwitchTarget || otherPrimePlan(subscription.plan);
    const planName = primePlanName(plan);
    this.setState({
      switchingPlan: true,
      error: null,
      planSwitchStatus: 'loading',
      planSwitchMessage: null,
    });
    try {
      const subscribeInfo = plan === 'data' ? await Billing.getSubscribeInfo(dongleId) : null;
      const response = await Billing.switchPrimePlan(dongleId, plan, subscribeInfo?.sim_id);
      if (!response?.success) {
        const error = new Error('Unexpected billing response');
        error.code = 'unexpected_response';
        throw error;
      }
      dispatch(analyticsEvent('prime_switch_plan', { from: subscription.plan, to: plan }));
      await this.fetchSubscription();
      if (this.mounted) {
        this.setState({
          planSwitchStatus: 'success',
          planSwitchMessage: `Your subscription has been switched to ${planName} successfully.`,
        });
      }
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'primemanage_switch_plan' });
      const message = primeSwitchErrorMessage(err, plan);
      if (this.mounted) {
        this.setState({ planSwitchStatus: 'error', planSwitchMessage: message });
      }
    } finally {
      if (this.mounted) {
        this.setState({ switchingPlan: false });
      }
    }
  }

  async fetchStripeSession() {
    const { dongleId } = this.props;
    const { stripeStatus } = this.state;
    if (!stripeStatus || !this.mounted) {
      return;
    }

    try {
      const resp = await Billing.getStripeSession(dongleId, stripeStatus.sessionId);
      const status = resp.payment_status;
      this.setState({ stripeStatus: {
        ...stripeStatus,
        paid: status,
        loading: status !== 'paid',
      } });
      if (status === 'paid') {
        this.fetchSubscription(true);
      } else {
        setTimeout(this.fetchStripeSession, 2000);
      }
    } catch (err) {
      // TODO error handling
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_fetch_stripe_session' });
    }
  }

  async fetchSubscription(repeat = false) {
    const { dongleId } = this.props;
    if (!this.mounted) {
      return;
    }
    try {
      const subscription = await Billing.getSubscription(dongleId);
      if (subscription.user_id) {
        this.props.dispatch(primeGetSubscription(dongleId, subscription));
      } else {
        setTimeout(() => this.fetchSubscription(true), 2000);
      }
    } catch (err) {
      if (err.message && err.message.indexOf('404') === 0) {
        if (repeat) {
          setTimeout(() => this.fetchSubscription(true), 2000);
        }
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'prime_fetch_subscription' });
      }
    }
  }

  render() {
    const { dispatch, dongleId, subscription, classes, device } = this.props;
    const { windowWidth, stripeStatus } = this.state;
    const commacare = device?.commacare;

    const hasPrimeSub = subscription && subscription.user_id;

    if (!hasPrimeSub && !stripeStatus) {
      return null;
    }

    let joinDate;
    let nextPaymentDate;
    let cancelAtDate;
    let planName;
    let planSubtext;
    if (hasPrimeSub) {
      joinDate = dayjs(subscription.subscribed_at ? subscription.subscribed_at * 1000 : 0).format('MMMM D, YYYY');
      nextPaymentDate = dayjs(subscription.next_charge_at ? subscription.next_charge_at * 1000 : 0).format('MMMM D, YYYY');
      cancelAtDate = dayjs(subscription.cancel_at ? subscription.cancel_at * 1000 : 0).format('MMMM D, YYYY');
      planName = primePlanName(subscription.plan);
      planSubtext = subscription.plan === 'nodata' ? '(without data plan)' : '(with data plan)';
    }

    const hasCancelAt = Boolean(hasPrimeSub && subscription.cancel_at && subscription.cancel_at <= subscription.next_charge_at);
    const alias = deviceNamePretty(device);
    const containerPadding = windowWidth > 520 ? 36 : 16;
    const buttonSmallStyle = windowWidth < 514 ? { width: '100%' } : {};

    return (
      <>
        <div className={classes.primeBox}>
          <div className={classes.primeContainer} style={{ padding: `8px ${containerPadding}px` }}>
            <IconButton aria-label="Go Back" onClick={() => dispatch(primeNav(false))}>
              <KeyboardBackspaceIcon />
            </IconButton>
          </div>
          <div className={classes.primeContainer} style={{ padding: `16px ${containerPadding}px` }}>
            <Typography variant="title">comma prime</Typography>
            {stripeStatus && (
              <>
                {stripeStatus.paid !== 'paid'
                  && (
                    <div className={classes.overviewBlockLoading}>
                      <CircularProgress size={19} style={{ color: Colors.white }} />
                      <Typography>Waiting for confirmed payment</Typography>
                    </div>
                  )}
                {Boolean(stripeStatus.paid === 'paid' && !hasPrimeSub)
                  && (
                    <div className={classes.overviewBlockLoading}>
                      <CircularProgress size={19} style={{ color: Colors.white }} />
                      <Typography>Processing subscription</Typography>
                    </div>
                  )}
                {Boolean(stripeStatus.paid === 'paid' && hasPrimeSub)
                  && (
                    <div className={classes.overviewBlockSuccess}>
                      <Typography>comma prime activated</Typography>
                      {subscription.is_prime_sim && (
                        <Typography>
                          Connectivity will be enabled as soon as activation propagates to your
                          local cell tower. Rebooting your device may help.
                        </Typography>
                      )}
                    </div>
                  )}
              </>
            )}
            <div className={classes.overviewBlock}>
              <Typography variant="subheading">Device</Typography>
              <div className={classes.manageItem}>
                <Typography variant="body2">{alias}</Typography>
                <Typography variant="caption" className={classes.deviceId}>
                  {`(${device.dongle_id})`}
                </Typography>
              </div>
            </div>
            {hasPrimeSub && (
              <>
                <div className={classes.overviewBlock}>
                  <Typography variant="subheading">Plan</Typography>
                  <Typography className={classes.manageItem}>
                    {planName}
                    <span>{` ${planSubtext}`}</span>
                  </Typography>
                </div>
                <div className={classes.overviewBlock}>
                  <Typography variant="subheading">Joined</Typography>
                  <Typography className={classes.manageItem}>{joinDate}</Typography>
                </div>
                {!hasCancelAt
                  && (
                    <div className={classes.overviewBlock}>
                      <Typography variant="subheading">Next payment</Typography>
                      <Typography className={classes.manageItem}>{nextPaymentDate}</Typography>
                    </div>
                  )}
                {hasCancelAt
                  && (
                    <div className={classes.overviewBlock}>
                      <Typography variant="subheading">Subscription end</Typography>
                      <Typography className={classes.manageItem}>{cancelAtDate}</Typography>
                    </div>
                  )}
                <div className={classes.overviewBlock}>
                  <Typography variant="subheading">Amount</Typography>
                  <Typography className={classes.manageItem}>
                    {`$${(subscription.amount / 100).toFixed(2)}`}
                  </Typography>
                </div>
                {commacare && <CommacareBadge variant="pill" style={{ marginTop: 14 }} />}
                {this.state.error && (
                  <div className={classes.overviewBlockError}>
                    <ErrorOutline />
                    <Typography>{this.state.error}</Typography>
                  </div>
                )}
                <div className={`${classes.overviewBlock} ${classes.paymentElement}`}>
                  <Button
                    className={classes.buttons}
                    style={buttonSmallStyle}
                    onClick={this.gotoUpdate}
                    disabled={!hasPrimeSub || (hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data')}
                  >
                    {hasCancelAt ? 'Renew subscription' : 'Update payment method'}
                  </Button>
                  {!hasCancelAt
                    && (
                      <Button
                        className={classes.buttons}
                        style={buttonSmallStyle}
                        onClick={() => this.setState({
                          planSwitchModal: true,
                          planSwitchStatus: 'confirm',
                          planSwitchMessage: null,
                          planSwitchTarget: otherPrimePlan(subscription.plan),
                          error: null,
                        })}
                        disabled={this.state.switchingPlan}
                      >
                        {this.state.switchingPlan
                          ? <CircularProgress size={19} style={{ color: Colors.white }} />
                          : `Switch to ${primePlanName(otherPrimePlan(subscription.plan))} plan`}
                      </Button>
                    )}
                  {!hasCancelAt
                    && (
                      <Button
                        className={`${classes.buttons} ${classes.cancelButton} primeCancel`}
                        style={buttonSmallStyle}
                        onClick={() => this.setState({ cancelModal: true })}
                        disabled={Boolean(!hasPrimeSub)}
                      >
                        Cancel subscription
                      </Button>
                    )}
                </div>
                {hasPrimeSub && subscription.requires_migration
                  && (
                    <div className={classes.overviewBlockDisabled}>
                      <PriorityHighIcon />
                      <Typography>
                        Your prime subscription will be canceled on May 15th unless you replace the
                        SIM
                        card in your device. A new SIM card can be ordered from the
                        <a className={ classes.linkHighlight} href="https://comma.ai/shop/comma-prime-sim">shop</a>
                        .
                        Use discount code SIMSWAP at checkout to receive a free SIM card.
                      </Typography>
                    </div>
                  )}
                {hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data'
                  && (
                    <div className={classes.overviewBlockDisabled}>
                      <InfoOutline />
                      <Typography>
                        Standard comma prime discontinued for
                        {deviceTypePretty(device.device_type)}
                      </Typography>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
        <Modal
          open={this.state.planSwitchModal}
          onClose={() => {
            if (!this.state.switchingPlan) {
              this.setState({
                planSwitchModal: false,
                planSwitchStatus: 'confirm',
                planSwitchMessage: null,
                planSwitchTarget: null,
              });
            }
          }}
        >
          <Paper className="absolute left-1/2 top-[40%] w-[400px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 p-4">
            {this.state.planSwitchStatus === 'success'
              ? (
                <>
                  <Typography variant="title" className="text-white">
                    {`Welcome to ${primePlanName(this.state.planSwitchTarget)}`}
                  </Typography>
                  <div className="mt-4 rounded-lg bg-green-500/20 p-3 text-green-100">
                    <Typography>{this.state.planSwitchMessage}</Typography>
                  </div>
                  <Typography className="mt-3 text-white/80">
                    {this.state.planSwitchTarget === 'data'
                      ? 'Your plan now includes data for $24/month.'
                      : 'Your plan no longer includes data and costs $14/month.'}
                  </Typography>
                  <div className="mt-4">
                    <Button
                      variant="contained"
                      className={classes.closeButton}
                      onClick={() => this.setState({
                        planSwitchModal: false,
                        planSwitchStatus: 'confirm',
                        planSwitchMessage: null,
                        planSwitchTarget: null,
                      })}
                    >
                      Done
                    </Button>
                  </div>
                </>
              )
              : (
                <>
                  <Typography variant="title" className="text-white">
                    {`Switch to ${primePlanName(this.state.planSwitchTarget)} plan`}
                  </Typography>
                  <Typography className="mt-3 text-white/80">
                    {this.state.planSwitchTarget === 'data'
                      ? (
                        <>
                          The Standard plan costs $24/month, includes a data plan, and is
                          {' '}
                          <strong className="font-bold text-white">only available in the U.S.</strong>
                        </>
                      )
                      : 'The Lite plan costs $14/month and does not include a data plan.'}
                  </Typography>
                </>
              )}
            {this.state.planSwitchStatus === 'loading' && (
              <div className="mt-4 flex flex-col items-center justify-center rounded-lg bg-black/20 p-5 text-center">
                <CircularProgress size={19} style={{ color: Colors.white }} />
                <Typography className="mt-2 text-white/80">Switching your plan…</Typography>
              </div>
            )}
            {this.state.planSwitchStatus === 'error' && (
              <div className="mt-4 rounded-lg bg-red-500/20 p-3 text-red-100">
                <Typography className="text-inherit">{this.state.planSwitchMessage}</Typography>
              </div>
            )}
            {this.state.planSwitchStatus !== 'success' && (
              <div className="mt-4">
                <Button
                  variant="contained"
                  className={classes.cancelModalButton}
                  onClick={this.switchPlan}
                  disabled={this.state.switchingPlan}
                >
                  {this.state.planSwitchStatus === 'error' ? 'Try again' : 'Confirm switch'}
                </Button>
                <Button
                  variant="contained"
                  className={classes.closeButton}
                  onClick={() => this.setState({
                    planSwitchModal: false,
                    planSwitchStatus: 'confirm',
                    planSwitchMessage: null,
                    planSwitchTarget: null,
                  })}
                  disabled={this.state.switchingPlan}
                >
                  Cancel
                </Button>
              </div>
            )}
          </Paper>
        </Modal>
        <Modal
          open={this.state.cancelModal}
          onClose={() => this.setState({ cancelModal: false })}
        >
          <Paper className={classes.modal}>
            <Typography variant="title">Cancel prime subscription</Typography>
            {this.state.cancelError && (
              <div className={classes.cancelError}>
                <Typography>{this.state.cancelError}</Typography>
              </div>
            )}
            {this.state.cancelSuccess && (
              <div className={classes.cancelSuccess}>
                <Typography>{this.state.cancelSuccess}</Typography>
              </div>
            )}
            <Typography>
              {`Device: ${alias} (${dongleId})`}
            </Typography>
            <Typography>
              We&apos;re sorry to see you go.
            </Typography>
            <Typography>
              Your subscription will be cancelled immediately and can be resumed at any time.
            </Typography>
            {commacare && (
              <div className={classes.commacareWarning}>
                <Typography>
                  Cancelling will <strong>permanently end your extended warranty coverage.</strong>
                  {' '}
                  Your standard 1-year warranty still applies for any remaining time.
                  {' '}
                  <a href={COMMACARE_URL} target="_blank" rel="noreferrer">What is commacare?</a>
                </Typography>
              </div>
            )}
            <Button
              variant="contained"
              className={`${classes.cancelModalButton} primeModalCancel`}
              onClick={this.cancelPrime}
              disabled={Boolean(this.state.cancelSuccess || this.state.canceling)}
            >
              {this.state.canceling
                ? <CircularProgress size={19} style={{ color: Colors.white }} />
                : 'Cancel subscription'}
            </Button>
            <Button
              variant="contained"
              className={`${classes.closeButton} primeModalClose`}
              onClick={() => this.setState({ cancelModal: false })}
            >
              Close
            </Button>
          </Paper>
        </Modal>
      </>
    );
  }
}

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  device: state.device,
  subscription: state.subscription,
});

export default connect(stateToProps)(withStyles(styles)(PrimeManage));

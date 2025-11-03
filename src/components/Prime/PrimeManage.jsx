import { billing as Billing } from '@commaai/api';
import { Button, CircularProgress, IconButton, Modal, Paper, Typography } from '@mui/material';
import { withStyles } from '@mui/styles';
import KeyboardBackspaceIcon from '@mui/icons-material/KeyboardBackspace';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { primeGetSubscription } from '../../actions';
import Colors from '../../colors';
import { ErrorOutline, InfoOutline } from '../../icons';
import { navigate } from '../../navigation';
import { deviceNamePretty, deviceTypePretty } from '../../utils';
import ResizeHandler from '../ResizeHandler';

const styles = (theme) => ({
  linkHighlight: {
    '&:link': {
      textDecoration: 'underline',
      color: Colors.green300,
    },
    '&:visited': {
      textDecoration: 'underline',
      color: Colors.green300,
    },
    '&:active': {
      textDecoration: 'underline',
      color: Colors.green300,
    },
    '&:hover': {
      textDecoration: 'underline',
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
    padding: theme.spacing(2),
    width: theme.spacing(50),
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

const PrimeManage = ({ classes }) => {
  const dispatch = useDispatch();
  const dongleId = useSelector((state) => state.dongleId);
  const device = useSelector((state) => state.device);
  const subscription = useSelector((state) => state.subscription);
  const stripeSuccess = useSelector((state) => state.stripeSuccess);

  const [error] = useState(null);
  const [cancelError, setCancelError] = useState(null);
  const [cancelSuccess, setCancelSuccess] = useState(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [stripeStatus, setStripeStatus] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const mounted = useRef(false);

  const onResize = (width) => {
    setWindowWidth(width);
  };

  const fetchSubscription = useCallback(
    async (repeat = false) => {
      if (!mounted.current) {
        return;
      }
      try {
        const subscriptionData = await Billing.getSubscription(dongleId);
        if (subscriptionData.user_id) {
          dispatch(primeGetSubscription(dongleId, subscriptionData));
        } else {
          setTimeout(() => fetchSubscription(true), 2000);
        }
      } catch (err) {
        if (err.message && err.message.indexOf('404') === 0) {
          if (repeat) {
            setTimeout(() => fetchSubscription(true), 2000);
          }
        } else {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'prime_fetch_subscription' });
        }
      }
    },
    [dongleId, dispatch],
  );

  const fetchStripeSession = useCallback(async () => {
    if (!stripeStatus || !mounted.current) {
      return;
    }

    try {
      const resp = await Billing.getStripeSession(dongleId, stripeStatus.sessionId);
      const status = resp.payment_status;
      setStripeStatus({
        ...stripeStatus,
        paid: status,
        loading: status !== 'paid',
      });
      if (status === 'paid') {
        fetchSubscription(true);
      } else {
        setTimeout(fetchStripeSession, 2000);
      }
    } catch (err) {
      // TODO error handling
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_fetch_stripe_session' });
    }
  }, [dongleId, stripeStatus, fetchSubscription]);

  const cancelPrime = () => {
    setCanceling(true);
    Billing.cancelPrime(dongleId)
      .then((resp) => {
        if (resp.success) {
          setCanceling(false);
          setCancelError(null);
          setCancelSuccess('Cancelled subscription.');
          fetchSubscription();
        } else if (resp.error) {
          setCanceling(false);
          setCancelError(resp.description);
        } else {
          setCanceling(false);
          setCancelError('Could not cancel due to unknown error. Please try again.');
        }
      })
      .catch((err) => {
        Sentry.captureException(err, { fingerprint: 'primemanage_cancel_prime' });
        setCanceling(false);
        setCancelError('Could not cancel due to unknown error. Please try again.');
      });
  };

  const gotoUpdate = async () => {
    try {
      const resp = await Billing.getStripePortal(dongleId);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_update' });
    }
  };

  // Set mounted ref
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Handle stripe success
  useEffect(() => {
    if (stripeSuccess) {
      setStripeStatus({ sessionId: stripeSuccess, loading: true, paid: null });
      fetchStripeSession();
    }
  }, [stripeSuccess, fetchStripeSession]);

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
    planName = subscription.plan === 'nodata' ? 'Lite' : 'Standard';
    planSubtext = subscription.plan === 'nodata' ? '(without data plan)' : '(with data plan)';
  }

  const hasCancelAt = Boolean(hasPrimeSub && subscription.cancel_at && subscription.cancel_at <= subscription.next_charge_at);
  const alias = deviceNamePretty(device);
  const containerPadding = windowWidth > 520 ? 36 : 16;
  const buttonSmallStyle = windowWidth < 514 ? { width: '100%' } : {};

  return (
    <>
      <ResizeHandler onResize={onResize} />
      <div className={classes.primeBox}>
        <div className={classes.primeContainer} style={{ padding: `8px ${containerPadding}px` }}>
          <IconButton aria-label="Go Back" onClick={() => navigate(`/${dongleId}`)}>
            <KeyboardBackspaceIcon />
          </IconButton>
        </div>
        <div className={classes.primeContainer} style={{ padding: `16px ${containerPadding}px` }}>
          <Typography variant="h6">comma prime</Typography>
          {stripeStatus && (
            <>
              {stripeStatus.paid !== 'paid' && (
                <div className={classes.overviewBlockLoading}>
                  <CircularProgress size={19} style={{ color: Colors.white }} />
                  <Typography>Waiting for confirmed payment</Typography>
                </div>
              )}
              {Boolean(stripeStatus.paid === 'paid' && !hasPrimeSub) && (
                <div className={classes.overviewBlockLoading}>
                  <CircularProgress size={19} style={{ color: Colors.white }} />
                  <Typography>Processing subscription</Typography>
                </div>
              )}
              {Boolean(stripeStatus.paid === 'paid' && hasPrimeSub) && (
                <div className={classes.overviewBlockSuccess}>
                  <Typography>comma prime activated</Typography>
                  {subscription.is_prime_sim && (
                    <Typography>Connectivity will be enabled as soon as activation propagates to your local cell tower. Rebooting your device may help.</Typography>
                  )}
                </div>
              )}
            </>
          )}
          <div className={classes.overviewBlock}>
            <Typography variant="subtitle1">Device</Typography>
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
                <Typography variant="subtitle1">Plan</Typography>
                <Typography className={classes.manageItem}>
                  {planName}
                  <span>{` ${planSubtext}`}</span>
                </Typography>
              </div>
              <div className={classes.overviewBlock}>
                <Typography variant="subtitle1">Joined</Typography>
                <Typography className={classes.manageItem}>{joinDate}</Typography>
              </div>
              {!hasCancelAt && (
                <div className={classes.overviewBlock}>
                  <Typography variant="subtitle1">Next payment</Typography>
                  <Typography className={classes.manageItem}>{nextPaymentDate}</Typography>
                </div>
              )}
              {hasCancelAt && (
                <div className={classes.overviewBlock}>
                  <Typography variant="subtitle1">Subscription end</Typography>
                  <Typography className={classes.manageItem}>{cancelAtDate}</Typography>
                </div>
              )}
              <div className={classes.overviewBlock}>
                <Typography variant="subtitle1">Amount</Typography>
                <Typography className={classes.manageItem}>{`$${(subscription.amount / 100).toFixed(2)}`}</Typography>
              </div>
              {error && (
                <div className={classes.overviewBlockError}>
                  <ErrorOutline />
                  <Typography>{error}</Typography>
                </div>
              )}
              <div className={`${classes.overviewBlock} ${classes.paymentElement}`}>
                <Button
                  className={classes.buttons}
                  style={buttonSmallStyle}
                  onClick={gotoUpdate}
                  disabled={!hasPrimeSub || (hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data')}
                >
                  {hasCancelAt ? 'Renew subscription' : 'Update payment method'}
                </Button>
                {!hasCancelAt && (
                  <Button
                    className={`${classes.buttons} ${classes.cancelButton} primeCancel`}
                    style={buttonSmallStyle}
                    onClick={() => setCancelModal(true)}
                    disabled={Boolean(!hasPrimeSub)}
                  >
                    Cancel subscription
                  </Button>
                )}
              </div>
              {hasPrimeSub && subscription.requires_migration && (
                <div className={classes.overviewBlockDisabled}>
                  <PriorityHighIcon />
                  <Typography>
                    Your prime subscription will be canceled on May 15th unless you replace the SIM card in your device. A new SIM card can be ordered from the
                    <a className={classes.linkHighlight} href="https://comma.ai/shop/comma-prime-sim">
                      shop
                    </a>
                    . Use discount code SIMSWAP at checkout to receive a free SIM card.
                  </Typography>
                </div>
              )}
              {hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data' && (
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
      <Modal open={cancelModal} onClose={() => setCancelModal(false)}>
        <Paper className={classes.modal}>
          <Typography variant="h6">Cancel prime subscription</Typography>
          {cancelError && (
            <div className={classes.cancelError}>
              <Typography>{cancelError}</Typography>
            </div>
          )}
          {cancelSuccess && (
            <div className={classes.cancelSuccess}>
              <Typography>{cancelSuccess}</Typography>
            </div>
          )}
          <Typography>{`Device: ${alias} (${dongleId})`}</Typography>
          <Typography>We&apos;re sorry to see you go.</Typography>
          <Typography>Your subscription will be cancelled immediately and can be resumed at any time.</Typography>
          <Button variant="contained" className={`${classes.cancelModalButton} primeModalCancel`} onClick={cancelPrime} disabled={Boolean(cancelSuccess || canceling)}>
            {canceling ? <CircularProgress size={19} style={{ color: Colors.white }} /> : 'Cancel subscription'}
          </Button>
          <Button variant="contained" className={`${classes.closeButton} primeModalClose`} onClick={() => setCancelModal(false)}>
            Close
          </Button>
        </Paper>
      </Modal>
    </>
  );
};

export default withStyles(styles)(PrimeManage);

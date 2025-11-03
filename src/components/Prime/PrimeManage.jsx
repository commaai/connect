import { billing as Billing } from '@commaai/api';
import { Box, Button, CircularProgress, IconButton, Modal, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
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

const LinkHighlight = styled('a')({
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
});

const PrimeBox = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
});

const PrimeContainer = styled(Box)({
  borderBottom: `1px solid ${Colors.white10}`,
  color: '#fff',
});

const OverviewBlock = styled(Box)({
  marginTop: 20,
});

const OverviewBlockError = styled(Box)({
  marginTop: 15,
  padding: 10,
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'rgba(255, 0, 0, 0.2)',
  '& p': { display: 'inline-block', marginLeft: 10 },
});

const OverviewBlockSuccess = styled(Box)({
  marginTop: 15,
  padding: 10,
  alignItems: 'center',
  backgroundColor: 'rgba(0, 255, 0, 0.2)',
  '& p': {
    display: 'inline-block',
    marginLeft: 10,
    '&:first-child': { fontWeight: 600 },
  },
});

const OverviewBlockLoading = styled(Box)({
  marginTop: 15,
  padding: 10,
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.2)',
  '& p': { display: 'inline-block', marginLeft: 10 },
});

const OverviewBlockDisabled = styled(Box)({
  marginTop: 12,
  borderRadius: 12,
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  backgroundColor: Colors.white08,
  '& p': { display: 'inline-block', marginLeft: 10 },
  '& a': { color: 'white' },
});

const ManageItem = styled(Typography)({
  marginLeft: 10,
  '& span': {
    color: Colors.white70,
    fontSize: '0.9em',
  },
});

const StyledButton = styled(Button)({
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
});

const CancelButton = styled(Button)({
  marginTop: 10,
  color: Colors.white,
  background: 'transparent',
  border: `1px solid ${Colors.grey500}`,
  borderRadius: 18,
  textTransform: 'none',
  width: 220,
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
});

const StyledModal = styled(Paper)(({ theme }) => ({
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
}));

const CloseButton = styled(Button)({
  marginTop: 10,
  float: 'right',
  backgroundColor: Colors.grey200,
  color: Colors.white,
  '&:hover': {
    backgroundColor: Colors.grey400,
  },
});

const CancelModalButton = styled(Button)({
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
});

const CancelError = styled(Box)({
  backgroundColor: 'rgba(255, 0, 0, 0.3)',
  marginTop: 10,
  padding: 10,
  '& p': { margin: 0 },
});

const CancelSuccess = styled(Box)({
  backgroundColor: 'rgba(0, 255, 0, 0.3)',
  marginTop: 10,
  padding: 10,
  '& p': { margin: 0 },
});

const PaymentElement = styled(Box)({
  marginTop: 20,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  maxWidth: 450,
});

const PrimeManage = () => {
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
      <PrimeBox>
        <PrimeContainer style={{ padding: `8px ${containerPadding}px` }}>
          <IconButton aria-label="Go Back" onClick={() => navigate(`/${dongleId}`)}>
            <KeyboardBackspaceIcon />
          </IconButton>
        </PrimeContainer>
        <PrimeContainer style={{ padding: `16px ${containerPadding}px` }}>
          <Typography variant="h6">comma prime</Typography>
          {stripeStatus && (
            <>
              {stripeStatus.paid !== 'paid' && (
                <OverviewBlockLoading>
                  <CircularProgress size={19} style={{ color: Colors.white }} />
                  <Typography>Waiting for confirmed payment</Typography>
                </OverviewBlockLoading>
              )}
              {Boolean(stripeStatus.paid === 'paid' && !hasPrimeSub) && (
                <OverviewBlockLoading>
                  <CircularProgress size={19} style={{ color: Colors.white }} />
                  <Typography>Processing subscription</Typography>
                </OverviewBlockLoading>
              )}
              {Boolean(stripeStatus.paid === 'paid' && hasPrimeSub) && (
                <OverviewBlockSuccess>
                  <Typography>comma prime activated</Typography>
                  {subscription.is_prime_sim && (
                    <Typography>Connectivity will be enabled as soon as activation propagates to your local cell tower. Rebooting your device may help.</Typography>
                  )}
                </OverviewBlockSuccess>
              )}
            </>
          )}
          <OverviewBlock>
            <Typography variant="subtitle1">Device</Typography>
            <ManageItem variant="body2">
              {alias}
              <Typography variant="caption" component="span">
                {` (${device.dongle_id})`}
              </Typography>
            </ManageItem>
          </OverviewBlock>
          {hasPrimeSub && (
            <>
              <OverviewBlock>
                <Typography variant="subtitle1">Plan</Typography>
                <ManageItem>
                  {planName}
                  <span>{` ${planSubtext}`}</span>
                </ManageItem>
              </OverviewBlock>
              <OverviewBlock>
                <Typography variant="subtitle1">Joined</Typography>
                <ManageItem>{joinDate}</ManageItem>
              </OverviewBlock>
              {!hasCancelAt && (
                <OverviewBlock>
                  <Typography variant="subtitle1">Next payment</Typography>
                  <ManageItem>{nextPaymentDate}</ManageItem>
                </OverviewBlock>
              )}
              {hasCancelAt && (
                <OverviewBlock>
                  <Typography variant="subtitle1">Subscription end</Typography>
                  <ManageItem>{cancelAtDate}</ManageItem>
                </OverviewBlock>
              )}
              <OverviewBlock>
                <Typography variant="subtitle1">Amount</Typography>
                <ManageItem>{`$${(subscription.amount / 100).toFixed(2)}`}</ManageItem>
              </OverviewBlock>
              {error && (
                <OverviewBlockError>
                  <ErrorOutline />
                  <Typography>{error}</Typography>
                </OverviewBlockError>
              )}
              <PaymentElement>
                <StyledButton
                  style={buttonSmallStyle}
                  onClick={gotoUpdate}
                  disabled={!hasPrimeSub || (hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data')}
                >
                  {hasCancelAt ? 'Renew subscription' : 'Update payment method'}
                </StyledButton>
                {!hasCancelAt && (
                  <CancelButton className="primeCancel" style={buttonSmallStyle} onClick={() => setCancelModal(true)} disabled={Boolean(!hasPrimeSub)}>
                    Cancel subscription
                  </CancelButton>
                )}
              </PaymentElement>
              {hasPrimeSub && subscription.requires_migration && (
                <OverviewBlockDisabled>
                  <PriorityHighIcon />
                  <Typography>
                    Your prime subscription will be canceled on May 15th unless you replace the SIM card in your device. A new SIM card can be ordered from the
                    <LinkHighlight href="https://comma.ai/shop/comma-prime-sim">shop</LinkHighlight>. Use discount code SIMSWAP at checkout to receive a free SIM card.
                  </Typography>
                </OverviewBlockDisabled>
              )}
              {hasCancelAt && !device.eligible_features?.prime_data && subscription.plan === 'data' && (
                <OverviewBlockDisabled>
                  <InfoOutline />
                  <Typography>
                    Standard comma prime discontinued for
                    {deviceTypePretty(device.device_type)}
                  </Typography>
                </OverviewBlockDisabled>
              )}
            </>
          )}
        </PrimeContainer>
      </PrimeBox>
      <Modal open={cancelModal} onClose={() => setCancelModal(false)}>
        <StyledModal>
          <Typography variant="h6">Cancel prime subscription</Typography>
          {cancelError && (
            <CancelError>
              <Typography>{cancelError}</Typography>
            </CancelError>
          )}
          {cancelSuccess && (
            <CancelSuccess>
              <Typography>{cancelSuccess}</Typography>
            </CancelSuccess>
          )}
          <Typography>{`Device: ${alias} (${dongleId})`}</Typography>
          <Typography>We&apos;re sorry to see you go.</Typography>
          <Typography>Your subscription will be cancelled immediately and can be resumed at any time.</Typography>
          <CancelModalButton variant="contained" className="primeModalCancel" onClick={cancelPrime} disabled={Boolean(cancelSuccess || canceling)}>
            {canceling ? <CircularProgress size={19} style={{ color: Colors.white }} /> : 'Cancel subscription'}
          </CancelModalButton>
          <CloseButton variant="contained" className="primeModalClose" onClick={() => setCancelModal(false)}>
            Close
          </CloseButton>
        </StyledModal>
      </Modal>
    </>
  );
};

export default PrimeManage;

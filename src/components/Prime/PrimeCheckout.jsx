import { billing as Billing } from '@commaai/api';
import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardBackspaceIcon from '@mui/icons-material/KeyboardBackspace';
import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import Colors from '../../colors';
import { ErrorOutline, InfoOutline } from '../../icons';
import { navigate } from '../../navigation';
import { deviceNamePretty } from '../../utils';
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
  maxWidth: 430,
  color: '#fff',
});

const PrimeHeader = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  maxWidth: 410,
  flexDirection: 'row',
});

const HeaderDevice = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  '& :first-child': { marginRight: 8 },
});

const DeviceId = styled(Typography)({
  color: '#525E66',
});

const OverviewBlockError = styled(Box)({
  borderRadius: 12,
  marginTop: 8,
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'rgba(255, 0, 0, 0.2)',
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
  '& a': { color: Colors.white },
});

const ChargeText = styled(Typography)({
  fontSize: 13,
});

const StyledButton = styled(Button)({
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
  },
});

const CheckList = styled(Box)({
  marginLeft: 12,
});

const CheckListItem = styled(Box)({
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
});

const LearnMore = styled(Typography)({
  '& a': { color: 'white' },
});

const PrimeTitle = styled('h2')({
  margin: '0 12px',
});

const PlanBox = styled(Box)({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-around',
  height: 140,
});

const PlanBoxContainer = styled(Box)({
  position: 'relative',
  marginLeft: -6,
  marginRight: -6,
});

const Plan = styled(Box)(({ selected, disabled, loading }) => ({
  cursor: disabled || loading ? 'default' : 'pointer',
  WebkitTapHighlightColor: 'transparent',
  width: 160,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'space-around',
  border: selected ? '2px solid white' : '2px solid transparent',
  backgroundColor: loading ? Colors.white03 : disabled ? Colors.white05 : Colors.white10,
  color: loading ? Colors.white20 : disabled ? Colors.white40 : 'inherit',
  padding: '8px 0',
  borderRadius: 18,
  fontWeight: 600,
  textAlign: 'center',
  position: 'relative',
  '&:first-of-type': { marginRight: 2 },
  '&:last-of-type': { marginLeft: 2 },
  '& p': {
    margin: 0,
  },
}));

const PlanName = styled('p')({
  fontSize: '1.2rem',
});

const PlanPrice = styled('p')({
  fontSize: '1.5rem',
});

const PlanSubtext = styled('p')({
  fontWeight: 'normal',
  fontSize: '0.8rem',
});

const PlanLoading = styled(Box)({
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
});

const PrimeCheckout = () => {
  const dongleId = useSelector((state) => state.dongleId);
  const device = useSelector((state) => state.device);
  const subscribeInfo = useSelector((state) => state.subscribeInfo);
  const stripeCancelled = useSelector((state) => state.stripeCancelled);

  const [error, setError] = useState(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  const dataPlanAvailable = useCallback(() => {
    if (!device || !subscribeInfo) {
      return null;
    }

    return Boolean(
      device.eligible_features?.prime_data &&
        subscribeInfo &&
        subscribeInfo.sim_id &&
        subscribeInfo.is_prime_sim &&
        subscribeInfo.sim_usable !== false &&
        ['blue', 'magenta_new', 'webbing'].includes(subscribeInfo.sim_type),
    );
  }, [device, subscribeInfo]);

  const trialClaimable = () => {
    if (!subscribeInfo) {
      return null;
    }
    if (selectedPlan === 'data') {
      return Boolean(subscribeInfo.trial_end_data);
    }
    if (selectedPlan === 'nodata') {
      return Boolean(subscribeInfo.trial_end_nodata);
    }
    return Boolean(subscribeInfo.trial_end_data && subscribeInfo.trial_end_nodata);
  };

  const onResize = (width, height) => {
    setWindowWidth(width);
    setWindowHeight(height);
  };

  const gotoCheckout = async () => {
    setLoadingCheckout(true);
    try {
      const resp = await Billing.getStripeCheckout(dongleId, subscribeInfo.sim_id, selectedPlan);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.error(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_checkout' });
    }
  };

  // Handle stripe cancellation
  useEffect(() => {
    if (stripeCancelled) {
      setError('Checkout cancelled');
    }
  }, [stripeCancelled]);

  // Set default plan when subscribeInfo loads
  useEffect(() => {
    if (selectedPlan === null && subscribeInfo) {
      const plan = dataPlanAvailable() ? 'data' : 'nodata';
      setSelectedPlan(plan);
    }
  }, [subscribeInfo, selectedPlan, dataPlanAvailable]);

  let chargeText = null;
  if (selectedPlan && trialClaimable()) {
    let trialEndDate = null;
    if (selectedPlan === 'data') {
      trialEndDate = dayjs(subscribeInfo.trial_end_data * 1000).format('MMMM D');
    } else if (selectedPlan === 'nodata') {
      trialEndDate = dayjs(subscribeInfo.trial_end_nodata * 1000).format('MMMM D');
    }
    chargeText = `Your first charge will be on ${trialEndDate}, then monthly thereafter.`;
  }

  const containerPadding = windowWidth > 520 ? { margin: '18px 24px' } : { margin: '6px 12px' };
  const blockMargin = windowWidth > 520 ? { marginTop: 24 } : { marginTop: 8 };
  const paddingStyle = windowWidth > 520 ? { paddingLeft: 7, paddingRight: 7 } : { paddingLeft: 8, paddingRight: 8 };
  const plansLoading = !subscribeInfo;
  const disabledDataPlan = Boolean(!subscribeInfo || !dataPlanAvailable());
  const boxHeight = windowHeight > 600 ? { height: 140 } : { height: 110 };

  let disabledDataPlanText;
  if (subscribeInfo && disabledDataPlan) {
    if (!device.eligible_features?.prime_data) {
      disabledDataPlanText = 'Standard plan is not available for your device.';
    } else if (!subscribeInfo.sim_id && subscribeInfo.device_online) {
      disabledDataPlanText = 'Standard plan not available, no SIM was detected. Ensure SIM is securely inserted and try again.';
    } else if (!subscribeInfo.sim_id) {
      disabledDataPlanText = 'Standard plan not available, device could not be reached. Connect device to the internet and try again.';
    } else if (!subscribeInfo.is_prime_sim) {
      disabledDataPlanText = 'Standard plan not available, detected a third-party SIM.';
    } else if (!['blue', 'magenta_new', 'webbing'].includes(subscribeInfo.sim_type)) {
      disabledDataPlanText = [
        'Standard plan not available, old SIM type detected, new SIM cards are available in the ',
        <LinkHighlight key={1} href="https://comma.ai/shop/comma-prime-sim">
          shop
        </LinkHighlight>,
      ];
    } else if (subscribeInfo.sim_usable === false && subscribeInfo.sim_type === 'blue') {
      disabledDataPlanText = [
        'Standard plan not available, SIM has been canceled and is therefore no longer usable, new SIM cards are available in the ',
        <LinkHighlight key={1} href="https://comma.ai/shop/comma-prime-sim">
          shop
        </LinkHighlight>,
      ];
    } else if (subscribeInfo.sim_usable === false) {
      disabledDataPlanText = [
        'Standard plan not available, SIM is no longer usable, new SIM cards are available in the ',
        <LinkHighlight key={1} href="https://comma.ai/shop/comma-prime-sim">
          shop
        </LinkHighlight>,
      ];
    }
  }

  return (
    <PrimeBox style={containerPadding}>
      <ResizeHandler onResize={onResize} />
      <PrimeHeader>
        <IconButton aria-label="Go Back" onClick={() => navigate(`/${dongleId}`)}>
          <KeyboardBackspaceIcon />
        </IconButton>
        <HeaderDevice>
          <Typography variant="body2">{deviceNamePretty(device)}</Typography>
          <DeviceId variant="caption">{`(${device.dongle_id})`}</DeviceId>
        </HeaderDevice>
      </PrimeHeader>
      <PrimeTitle>comma prime</PrimeTitle>
      <Box sx={blockMargin}>
        <CheckList>
          <CheckListItem style={paddingStyle}>
            <CheckIcon />
            <p>24/7 connectivity</p>
          </CheckListItem>
          <CheckListItem style={paddingStyle}>
            <CheckIcon />
            <p>Take pictures remotely</p>
          </CheckListItem>
          <CheckListItem style={paddingStyle}>
            <CheckIcon />
            <p>1 year storage of drive videos</p>
          </CheckListItem>
          <CheckListItem style={paddingStyle}>
            <CheckIcon />
            <p>Simple SSH for developers</p>
          </CheckListItem>
        </CheckList>
      </Box>
      <PlanBoxContainer style={blockMargin}>
        <PlanBox style={boxHeight}>
          <Plan selected={selectedPlan === 'nodata'} loading={plansLoading} onClick={subscribeInfo ? () => setSelectedPlan('nodata') : null}>
            <PlanName>lite</PlanName>
            <PlanPrice>$10/month</PlanPrice>
            <PlanSubtext>
              bring your own
              <br />
              sim card
            </PlanSubtext>
          </Plan>
          <Plan selected={selectedPlan === 'data'} disabled={disabledDataPlan} loading={plansLoading} onClick={!disabledDataPlan ? () => setSelectedPlan('data') : null}>
            <PlanName>standard</PlanName>
            <PlanPrice>$24/month</PlanPrice>
            <PlanSubtext>
              including data plan
              <br />
              only offered in the U.S.
            </PlanSubtext>
          </Plan>
        </PlanBox>
        {!subscribeInfo && (
          <PlanLoading>
            <CircularProgress size={38} style={{ color: Colors.white }} />
            <Typography>Fetching SIM data</Typography>
          </PlanLoading>
        )}
      </PlanBoxContainer>
      {disabledDataPlanText && (
        <OverviewBlockDisabled style={blockMargin}>
          <InfoOutline />
          <Typography>{disabledDataPlanText}</Typography>
        </OverviewBlockDisabled>
      )}
      <Box sx={blockMargin}>
        <LearnMore>
          {'Learn more about comma prime from our '}
          <LinkHighlight target="_blank" href="https://comma.ai/connect#faq" rel="noreferrer">
            FAQ
          </LinkHighlight>
        </LearnMore>
      </Box>
      {error && (
        <OverviewBlockError>
          <ErrorOutline />
          <Typography>{error}</Typography>
        </OverviewBlockError>
      )}
      <Box sx={blockMargin}>
        <StyledButton className="gotoCheckout" onClick={() => gotoCheckout()} disabled={Boolean(!subscribeInfo || loadingCheckout || !selectedPlan)}>
          {loadingCheckout ? <CircularProgress size={19} /> : trialClaimable() ? 'Claim trial' : 'Go to checkout'}
        </StyledButton>
      </Box>
      {chargeText && (
        <Box sx={blockMargin}>
          <ChargeText>{chargeText}</ChargeText>
        </Box>
      )}
    </PrimeBox>
  );
};

export default PrimeCheckout;

import { useState } from 'react';
import { connect } from 'react-redux';
import { push } from 'connected-react-router';
import { withStyles } from '@material-ui/core';

import { primeNav } from '../../actions';
import Notification from '../Notification';

const promotionDismissalKey = (promotion) => `dismissedPromotion:${promotion}`;

const isDismissed = (promotion) => window.localStorage.getItem(promotionDismissalKey(promotion)) === 'true';

const dismiss = (promotion, setVisible) => {
  window.localStorage.setItem(promotionDismissalKey(promotion), 'true');
  setVisible(false);
};

const styles = () => ({
  container: {
    position: 'absolute',
    zIndex: 4,
    top: 8,
    right: 10,
    display: 'flex',
    flexDirection: 'row',
    gap: '10px',
    '@media (max-width: 599px)': {
      left: 8,
      flexDirection: 'column',
    },
  },
});

const Promotions = ({ classes, device, dispatch }) => {
  const [showPrime, setShowPrime] = useState(() => !isDismissed('prime'));
  const [showReferral, setShowReferral] = useState(() => !isDismissed('referral-50'));

  if (!device.is_owner) return null;

  return (
    <div className={classes.container}>
      {showPrime && !device.prime && (
        <Notification
          heading="comma prime"
          subtitle={device.eligible_features?.commacare
            ? 'Put your car on the internet with comma prime and extend your 1-year limited warranty with commacare'
            : 'Put your car on the internet with comma prime'}
          buttonText="sign up"
          buttonClassName="primeSignUp"
          onButtonClick={() => dispatch(primeNav(true))}
          dismissLabel="Dismiss prime promotion"
          onDismiss={() => dismiss('prime', setShowPrime)}
        />
      )}
      {showReferral && (
        <Notification
          heading="Give $50, Get $50"
          subtitle="Give a friend $50 off a comma four and get $50 cash."
          buttonText="refer"
          onButtonClick={() => dispatch(push('/referrals'))}
          dismissLabel="Dismiss referral promotion"
          onDismiss={() => dismiss('referral-50', setShowReferral)}
        />
      )}
    </div>
  );
};

export default connect((state) => ({ device: state.device }))(withStyles(styles)(Promotions));

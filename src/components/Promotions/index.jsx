import { useState } from 'react';
import { connect } from 'react-redux';
import { push } from 'connected-react-router';
import { withStyles } from '@material-ui/core';

import { primeNav } from '../../actions';
import Notification from '../Notification';

const dismissedPromotionKey = (promotion) => `dismissedPromotion:${promotion}`;

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
  const [dismissedPromotions, setDismissedPromotions] = useState(() => (
    window.localStorage.getItem(dismissedPromotionKey('referral-50')) === 'true' ? ['referral-50'] : []
  ));

  if (!device.is_owner) return null;

  const dismiss = (promotion, saveClosed = false) => {
    setDismissedPromotions((dismissed) => [...dismissed, promotion]);
    if (saveClosed) window.localStorage.setItem(dismissedPromotionKey(promotion), 'true');
  };

  const showPrime = !device.prime && !dismissedPromotions.includes('prime');
  const showReferral = !dismissedPromotions.includes('referral-50');

  return (
    <div className={classes.container}>
      {showReferral ? (
        <Notification
          heading="Refer a friend. Get $50."
          subtitle="Earn $50 when your referral link is used to purchase a comma four."
          buttonText="refer"
          onButtonClick={() => dispatch(push('/referrals'))}
          dismissLabel="Dismiss referral promotion"
          onDismiss={() => dismiss('referral-50', true)}
        />
      ) : showPrime ? (
        <Notification
          heading="comma prime"
          subtitle={device.eligible_features?.commacare
            ? 'Put your car on the internet with comma prime and extend your 1-year limited warranty with commacare'
            : 'Put your car on the internet with comma prime'}
          buttonText="sign up"
          buttonClassName="primeSignUp"
          onButtonClick={() => dispatch(primeNav(true))}
          dismissLabel="Dismiss prime promotion"
          onDismiss={() => dismiss('prime')}
        />
      ) : null}
    </div>
  );
};

export default connect((state) => ({ device: state.device }))(withStyles(styles)(Promotions));

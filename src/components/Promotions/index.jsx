import { useState } from 'react';
import { connect } from 'react-redux';
import { push } from 'connected-react-router';

import { primeNav } from '../../actions';
import Notification from '../Notification';

// Change the campaign ID to make a new referral promotion appear again.
const REFERRAL_DISMISSAL_KEY = 'referrals-09-02-2026';

const Promotions = ({ device, dispatch }) => {
  const [showReferral, setShowReferral] = useState(
    () => window.localStorage.getItem(REFERRAL_DISMISSAL_KEY) !== 'true',
  );
  const [primeDismissed, setPrimeDismissed] = useState(false);

  if (!device.is_owner) return null;

  const dismissReferral = () => {
    setShowReferral(false);
    window.localStorage.setItem(REFERRAL_DISMISSAL_KEY, 'true');
  };
  const showPrime = !device.prime && !primeDismissed;

  return (
    <div className="absolute right-2.5 top-2 z-[4] flex flex-row gap-2.5 max-[599px]:left-2 max-[599px]:flex-col">
      {showReferral ? (
        <Notification
          heading="Refer a friend. Get $50."
          subtitle={<>Referrals stack with sales! Give your friend <b>$150 off</b> with the Labor Day sale!</>}
          buttonText="refer"
          onButtonClick={() => { dispatch(push('/referrals')); dismissReferral(); }}
          dismissLabel="Dismiss referral promotion"
          onDismiss={dismissReferral}
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
          onDismiss={() => setPrimeDismissed(true)}
        />
      ) : null}
    </div>
  );
};

export default connect((state) => ({ device: state.device }))(Promotions);

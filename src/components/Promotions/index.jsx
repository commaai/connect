import { useState } from 'react';
import { connect } from 'react-redux';
import { push } from 'connected-react-router';

import { primeNav } from '../../actions';
import Notification from '../Notification';

// Change a campaign ID to make its promotion appear again.
const REFERRAL_DISMISSAL_KEY = 'referrals-09-02-2026';
const BLACK_FRIDAY_DISMISSAL_KEY = 'black-friday-2026';

const usePersistentDismissal = (key) => {
  const [dismissed, setDismissed] = useState(() => window.localStorage.getItem(key) === 'true');
  const dismiss = () => {
    setDismissed(true);
    window.localStorage.setItem(key, 'true');
  };
  return [dismissed, dismiss];
};

const Promotions = ({ device, dispatch }) => {
  const [referralDismissed, dismissReferral] = usePersistentDismissal(REFERRAL_DISMISSAL_KEY);
  const [blackFridayDismissed, dismissBlackFriday] = usePersistentDismissal(BLACK_FRIDAY_DISMISSAL_KEY);
  const [primeDismissed, setPrimeDismissed] = useState(false);

  if (!device.is_owner) return null;

  const showBlackFriday = !blackFridayDismissed;
  const showReferral = !referralDismissed;
  const showPrime = !device.prime && !primeDismissed;

  return (
    <div className="absolute right-2.5 top-2 z-[4] flex flex-row gap-2.5 max-[599px]:left-2 max-[599px]:flex-col">
      {showBlackFriday ? (
        <Notification
          heading="Black Friday Sale"
          subtitle={(
            <>
              comma four is <strong>$200 off</strong> through <strong>December 2</strong>.{' '}
              Refer a friend and earn <strong>$50!</strong>
            </>
          )}
          buttonText="refer"
          onButtonClick={() => { dispatch(push('/referrals')); dismissBlackFriday(); }}
          dismissLabel="Dismiss Black Friday promotion"
          onDismiss={dismissBlackFriday}
        />
      ) : showReferral ? (
        <Notification
          heading="Refer a friend. Get $50."
          subtitle="Earn $50 for each comma four purchased with your referral link."
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

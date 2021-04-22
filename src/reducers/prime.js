import { PRIME_NAV } from '../actions/types';

const initialState = {
  nav: null,
  activated: false,
  trialClaimable: false,
  paymentMethod: null,
  paymentInfo: null,
};

export default function prime(state = initialState, action) {
  switch (action.type) {
    case PRIME_NAV:
      return {
        ...state,
        nav: action.payload,
      };
    default:
      return state;
  }
}

import { PRIME_NAV, PRIME_GET_SUBSCRIPTION, PRIME_GET_PAYMENTMETHOD } from '../actions/types';

const initialState = {
  nav: null,
  subscription: null,
  paymentMethod: null,
};

export default function prime(state = initialState, action) {
  switch (action.type) {
    case PRIME_NAV:
      return {
        ...state,
        nav: action.payload,
      };
    case PRIME_GET_SUBSCRIPTION:
      return {
        ...state,
        subscription: action.payload,
      };
    case PRIME_GET_PAYMENTMETHOD:
      return {
        ...state,
        paymentMethod: action.payload,
      };
    default:
      return state;
  }
}

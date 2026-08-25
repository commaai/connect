import { referralUrl } from './utils';

describe('referralUrl', () => {
  test('adds standard referral attribution', () => {
    expect(referralUrl('https://refer.comma.ai/', 'ABC1234'))
      .toBe('https://refer.comma.ai/shop/comma-four?ref=ABC1234&utm_source=referral');
  });

  test('encodes the code and preserves configured query parameters', () => {
    expect(referralUrl('https://refer.example.com/path?environment=staging', 'ABC 123'))
      .toBe('https://refer.example.com/shop/comma-four?environment=staging&ref=ABC+123&utm_source=referral');
  });
});

import { referralUrl } from './utils';

describe('referralUrl', () => {
  test('puts the referral code in the URL path', () => {
    expect(referralUrl('https://refer.comma.ai/', 'ABC1234'))
      .toBe('https://refer.comma.ai/ABC1234');
  });

  test('encodes the code and removes base URL path and query parameters', () => {
    expect(referralUrl('https://refer.example.com/path?environment=staging', 'ABC 123'))
      .toBe('https://refer.example.com/ABC%20123');
  });
});

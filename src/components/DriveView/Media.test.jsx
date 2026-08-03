/* eslint-env jest */

import { Media } from './Media';

jest.mock('../../api/browserClips', () => ({
  browserClipAvailability: jest.fn(() => false),
  createBrowserClip: jest.fn(),
}));

describe('drive media', () => {
  it('renders route menus before device clip support has loaded', () => {
    const media = new Media({
      classes: {},
      currentRoute: { fullname: 'dongle|route' },
      device: { dongle_id: 'dongle' },
      dispatch: jest.fn(),
      dongleId: 'dongle',
      files: null,
      profile: null,
      routes: [],
      zoom: { start: 0, end: 60000 },
    });

    expect(() => media.renderMenus()).not.toThrow();
  });
});

/* eslint-env jest */
import React from 'react';
import { shallow } from 'enzyme';
import Thumbnails from './thumbnails';

const screenHeight = 1000;
const screenWidth = 1350;
const gutter = 20;
const percentToOffsetMock = jest.fn();
const getCurrentSegmentMock = jest.fn();

const thumbnailBounds = {
  top: 100,
  bottom: screenHeight - (100 + 100), // top + height
  left: gutter,
  right: screenWidth - gutter,

  width: screenWidth - (gutter * 2),
  height: 100
};

describe('timeline thumbnails', () => {
  beforeEach(() => {
    percentToOffsetMock.mockClear();
    getCurrentSegmentMock.mockClear();
  });

  it('should check the segment for every image', () => {
    percentToOffsetMock.mockImplementation((percent) => {
      return Math.round(percent * 30000);
    });
    getCurrentSegmentMock.mockImplementation((offset) => {
      if (offset < 1600) {
        return null;
      }
      return {
        routeOffset: 1600
      };
    });
    const thumbnails = shallow(
      <Thumbnails
        thumbnail={thumbnailBounds}
        percentToOffset={percentToOffsetMock}
        getCurrentSegment={getCurrentSegmentMock}
      />
    );

    expect(thumbnails.exists()).toBe(true);
    expect(percentToOffsetMock.mock.calls.length).toBe(10);
    expect(getCurrentSegmentMock.mock.calls.length).toBe(10);
    const imageEntries = thumbnails.find('.thumbnailImage');
    expect(imageEntries.length).toBe(5);

    imageEntries.forEach((entry, i) => {
      expect(entry.exists()).toBe(true);
      expect(entry.hasClass('thumbnailImage')).toBe(true);
      if (i === 0) {
        expect(entry.hasClass('blank')).toBe(true);
      } else {
        const styles = entry.prop('style');
        const backgroundParts = styles.backgroundSize.split(' ');
        const height = Number(backgroundParts[1].replace('px', ''));
        expect(height).toBe(thumbnailBounds.height);
        // never stretch thumbnail images
        expect(backgroundParts[0]).toBe('auto');
      }
    });

    thumbnails.unmount();
  });
});

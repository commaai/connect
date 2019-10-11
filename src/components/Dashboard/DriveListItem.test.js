/* eslint-env jest */
import React from 'react';
import * as Redux from 'redux';
import { mount } from 'enzyme';
import DriveListItem from './DriveListItem';

const defaultState = {
  start: Date.now()
};

jest.mock('../Timeline');

const store = Redux.createStore((state) => {
  if (!state) {
    return { ...defaultState };
  }
  return state;
});

describe('drive list items', () => {
  it('has DriveEntry class for puppeteer', () => {
    const elem = mount(<DriveListItem
      store={store}
      drive={{
        startTime: 1570830798378,
        duration: 1234,
        distanceMiles: 12.5212
      }}
    />);
    expect(elem.exists()).toBe(true);
    expect(elem.exists('.DriveEntry')).toBe(true);

    elem.unmount();
  });
});

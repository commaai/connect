/* eslint-env jest */
import React from 'react';
import * as Redux from 'redux';
import thunk from 'redux-thunk';
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
}, Redux.applyMiddleware(thunk));

describe('drive list items', () => {
  it('has DriveEntry class for puppeteer', () => {
    const elem = mount(<DriveListItem
      store={store}
      drive={{
        startTime: 1570830798378,
        duration: 1234,
        distanceMiles: 12.5212,
        startCoord: [0, 0],
        endCoord: [0, 0],
      }}
    />);
    expect(elem.exists()).toBe(true);
    expect(elem.exists('.DriveEntry')).toBe(true);

    elem.unmount();
  });
});

/* eslint-env jest */
import React from 'react';
import { shallow } from 'enzyme';
import HLS from '@commaai/hls.js';

import HLSSource from './hlsSource';

jest.mock('@commaai/hls.js', () => {
  const onMock = jest.fn();
  const destroyMock = jest.fn();
  const module = jest.fn().mockImplementation(() => ({
    on: onMock,
    destroy: destroyMock,
  }));

  module.onMock = onMock;
  module.destroyMock = destroyMock;

  return module;
});

HLS.Events = {
  MANIFEST_PARSED: 0,
  BUFFER_APPENDED: 1
};

beforeEach(() => {
  HLS.mockClear();
  HLS.onMock.mockClear();
  HLS.destroyMock.mockClear();
});

describe('hls source', () => {
  it('uses our fork with disablePtsDtsCorrectionInMp4Remux', () => {
    const element = shallow(<HLSSource />);

    expect(element.exists()).toBe(true);
    expect(HLS).toBeCalledWith({
      enableWorker: false,
      disablePtsDtsCorrectionInMp4Remux: false
    });

    element.unmount();
  });

  it('calls play once manifest loads', () => {
    const playMock = jest.fn();
    const element = shallow(<HLSSource video={{ play: playMock }} />);

    expect(element.exists()).toBe(true);
    expect(HLS.onMock).toBeCalled();
    expect(HLS.onMock.mock.calls.length).toBe(3);

    expect(playMock).toHaveBeenCalledTimes(0);
    HLS.onMock.mock.calls[0][1]();
    expect(playMock).toHaveBeenCalledTimes(1);

    element.unmount();
  });
});

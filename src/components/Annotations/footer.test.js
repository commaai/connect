/* eslint-env jest */
import React from 'react';
import { mount } from 'enzyme';
import queryString from 'query-string';
import TimelineWorker from '../../timeline';

import AnnotationsFooter from './footer';

const winOpenMock = jest.fn(() => ({
  focus: jest.fn()
}));
window.open = winOpenMock;

jest.mock('../../timeline', () => ({
}));

const currentOffsetMock = jest.fn();
TimelineWorker.currentOffset = currentOffsetMock;

describe('AnnotationsFooter', () => {
  beforeEach(() => {
    winOpenMock.mockClear();
    currentOffsetMock.mockClear();
  });
  it('opens cabana at the current timestamp and loop', () => {
    const footer = mount(
      <AnnotationsFooter
        segment={{
          routeOffset: 123321
        }}
        loop={{
          startTime: 123120123,
          duration: 15000
        }}
      />
    );

    expect(footer.exists()).toBe(true);
    const openInCabana = footer.find('.openInCabana');
    expect(openInCabana.exists()).toBe(true);

    currentOffsetMock.mockImplementationOnce(() => 123123123);
    openInCabana.simulate('click');

    expect(winOpenMock.mock.calls.length).toBe(1);
    expect(currentOffsetMock).toBeCalled();

    const url = winOpenMock.mock.calls[0][0];
    expect(url).toEqual(expect.stringContaining('https://'));
    const [baseUrl, urlParams] = url.split('?');
    expect(winOpenMock).toBeCalledWith(expect.stringContaining(baseUrl), '_blank');

    const qsParams = queryString.parse(urlParams);
    expect(qsParams.segments).toEqual(expect.stringContaining(','));
    const segmentParts = qsParams.segments.split(',');

    expect(Number(qsParams.seekTime)).toBe(122999);
    expect(Number(segmentParts[0])).toBe(122996);
    expect(Number(segmentParts[1])).toBe(123011);


    footer.unmount();
  });
  it('doesn\'t send cabana the loop when its greater than 3 minutes', () => {
    const footer = mount(
      <AnnotationsFooter
        segment={{
          routeOffset: 123321
        }}
        loop={{
          startTime: 123120123,
          duration: 181000
        }}
      />
    );

    expect(footer.exists()).toBe(true);
    const openInCabana = footer.find('.openInCabana');
    expect(openInCabana.exists()).toBe(true);

    currentOffsetMock.mockImplementationOnce(() => 123123123);
    openInCabana.simulate('click');

    expect(winOpenMock.mock.calls.length).toBe(1);
    expect(currentOffsetMock).toBeCalled();

    const url = winOpenMock.mock.calls[0][0];
    expect(url).toEqual(expect.stringContaining('https://'));
    const [baseUrl, urlParams] = url.split('?');
    expect(winOpenMock).toBeCalledWith(expect.stringContaining(baseUrl), '_blank');

    const qsParams = queryString.parse(urlParams);
    expect(qsParams.segments).toEqual(undefined);

    footer.unmount();
  });
});

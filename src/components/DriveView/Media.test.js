/* eslint-env jest */
import React from 'react';
import { mount } from 'enzyme';
import queryString from 'query-string';
import TimelineWorker from '../../timeline';

import Media from './Media';

const winOpenMock = jest.fn(() => ({
  focus: jest.fn()
}));
window.open = winOpenMock;

jest.mock('../../timeline', () => ({
}));

const currentOffsetMock = jest.fn();
TimelineWorker.currentOffset = currentOffsetMock;

describe('Media', () => {
  beforeEach(() => {
    winOpenMock.mockClear();
    currentOffsetMock.mockClear();
  });
  it('opens cabana at the current timestamp and loop', () => {
    const start = 123123123;
    const routeOffset = Math.round(Math.random() * 10000);
    const routeStartTime = start + routeOffset;
    const loopStartTime = routeStartTime + Math.round(Math.random() * 10000);
    const currentOffset = loopStartTime - start + Math.round(Math.random() * 10000);
    currentOffsetMock.mockImplementationOnce(() => currentOffset);
    const media = mount(
      <Media visibleSegment={{ routeOffset }} loop={{ startTime: loopStartTime, duration: 15000 }} start={start}
        store={{ subscribe: () => {}, dispatch: () => {}, getState: () => {} }} menusOnly />
    );

    expect(media.exists()).toBe(true);
    const openInCabana = media.find('#openInCabana').first();
    expect(openInCabana.exists()).toBe(true);

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

    expect(Number(qsParams.seekTime)).toBe(Math.floor((currentOffset - routeOffset) / 1000));
    expect(Number(segmentParts[0])).toBe(Math.floor((loopStartTime - routeStartTime) / 1000));
    expect(Number(segmentParts[1])).toBe(Math.floor((loopStartTime - routeStartTime) / 1000) + 15);

    media.unmount();
  });
  it('doesn\'t send cabana the loop when its greater than 3 minutes', () => {
    const start = 123123123;
    const routeOffset = Math.round(Math.random() * 10000);
    const routeStartTime = start + routeOffset;
    const loopStartTime = routeStartTime + Math.round(Math.random() * 10000);
    const currentOffset = loopStartTime - start + Math.round(Math.random() * 10000);
    currentOffsetMock.mockImplementationOnce(() => currentOffset);
    const media = mount(
      <Media visibleSegment={{ routeOffset }} start={start} menusOnly
        store={{ subscribe: () => {}, dispatch: () => {}, getState: () => {} }}
        loop={{ startTime: loopStartTime, duration: 181000 }} />
    );

    expect(media.exists()).toBe(true);
    const openInCabana = media.find('#openInCabana').first();
    expect(openInCabana.exists()).toBe(true);

    openInCabana.simulate('click');

    expect(winOpenMock.mock.calls.length).toBe(1);
    expect(currentOffsetMock).toBeCalled();

    const url = winOpenMock.mock.calls[0][0];
    expect(url).toEqual(expect.stringContaining('https://'));
    const [baseUrl, urlParams] = url.split('?');
    expect(winOpenMock).toBeCalledWith(expect.stringContaining(baseUrl), '_blank');

    const qsParams = queryString.parse(urlParams);
    expect(qsParams.segments).toEqual(undefined);

    media.unmount();
  });
});

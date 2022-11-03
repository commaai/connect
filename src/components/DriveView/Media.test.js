/* eslint-env jest */
import React from 'react';
import queryString from 'query-string';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentOffset } from '../../timeline/playback';
import Media from './Media';

const winOpenMock = jest.fn();
window.open = winOpenMock;
window.CABANA_URL_ROOT = 'https://cabana.comma.ai/';

jest.mock('../../timeline/playback', () => {
  const originalModule = jest.requireActual('../../timeline/playback');
  return {
    __esModule: true,
    ...originalModule,
    currentOffset: jest.fn(),
  };
});

describe('Media', () => {
  beforeEach(() => {
    winOpenMock.mockImplementation(() => ({
      focus: jest.fn(),
    }));
    currentOffset.mockClear();
  });

  it('opens cabana at the current timestamp and loop', async () => {
    const start = 123123123;
    const routeOffset = Math.round(Math.random() * 10000);
    const routeStartTime = start + routeOffset;
    const loopStartTime = routeStartTime + Math.round(Math.random() * 10000);
    const offset = loopStartTime - start + Math.round(Math.random() * 10000);
    const getState = () => ({
      filesUploading: {},
      filesUploadingMeta: {},
      currentRoute: {
        offset: routeOffset,
        start_time_utc_millis: routeStartTime,
        segment_numbers: Array.from(Array(4).keys()),
        segment_offsets: Array.from(Array(4).keys()).map((i) => i * 60 + routeOffset),
      },
      loop: { startTime: loopStartTime, duration: 15000 },
      filter: { start },
      device: { device_type: 'three' },
    });
    currentOffset.mockImplementation(() => offset);

    const user = userEvent.setup();
    render(
      <Media store={{ subscribe: () => {}, dispatch: () => {}, getState }} menusOnly />,
    );

    const viewInCabana = screen.getByRole('menuitem', { name: /view in cabana/i });
    await user.click(viewInCabana);

    expect(winOpenMock.mock.calls.length).toBe(1);
    expect(currentOffset).toBeCalled();

    const url = winOpenMock.mock.calls[0][0];
    expect(url).toEqual(expect.stringContaining('https://'));
    const [baseUrl, urlParams] = url.split('?');
    expect(winOpenMock).toBeCalledWith(expect.stringContaining(baseUrl), '_blank');

    const qsParams = queryString.parse(urlParams);
    expect(qsParams.segments).toEqual(expect.stringContaining(','));
    const segmentParts = qsParams.segments.split(',');

    expect(Number(qsParams.seekTime)).toBe(Math.floor((offset - routeOffset) / 1000));
    expect(Number(segmentParts[0])).toBe(Math.floor((loopStartTime - routeStartTime) / 1000));
    expect(Number(segmentParts[1])).toBe(Math.floor((loopStartTime - routeStartTime) / 1000) + 15);
  });

  it('doesn\'t send cabana the loop when its greater than 3 minutes', async () => {
    const start = 123123123;
    const routeOffset = Math.round(Math.random() * 10000);
    const routeStartTime = start + routeOffset;
    const loopStartTime = routeStartTime + Math.round(Math.random() * 10000);
    const offset = loopStartTime - start + Math.round(Math.random() * 10000);
    currentOffset.mockImplementation(() => offset);
    const getState = () => ({
      filesUploading: {},
      filesUploadingMeta: {},
      currentRoute: {
        offset: routeOffset,
        segment_numbers: Array.from(Array(4).keys()),
        segment_offsets: Array.from(Array(4).keys()).map((i) => i * 60 + routeOffset),
      },
      filter: { start },
      device: { device_type: 'three' },
      loop: { startTime: loopStartTime, duration: 181000 },
    });

    const user = userEvent.setup();
    render(
      <Media store={{ subscribe: () => {}, dispatch: () => {}, getState }} menusOnly />,
    );

    const viewInCabana = screen.getByRole('menuitem', { name: /view in cabana/i });
    await user.click(viewInCabana);

    expect(winOpenMock.mock.calls.length).toBe(1);
    expect(currentOffset).toBeCalled();

    const url = winOpenMock.mock.calls[0][0];
    expect(url).toEqual(expect.stringContaining('https://'));
    const [baseUrl, urlParams] = url.split('?');
    expect(winOpenMock).toBeCalledWith(expect.stringContaining(baseUrl), '_blank');

    const qsParams = queryString.parse(urlParams);
    expect(qsParams.segments).toEqual(undefined);
  });
});

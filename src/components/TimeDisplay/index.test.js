import { speedSteps } from './index';
import { attachVideo, detachVideo, getVideo } from '../../timeline/video';

describe('TimeDisplay speed steps', () => {
  afterEach(() => detachVideo(getVideo()));

  it('caps native HLS at 2x and offers the full list otherwise', () => {
    expect(speedSteps(true)).toEqual([0.5, 1, 2]);
    expect(speedSteps(false)).toEqual([0.1, 0.25, 0.5, 1, 2, 4, 8]);
  });

  it('decides from the attached element, falling back to the user agent before one is attached', () => {
    // jsdom's user agent is not iOS, so the fallback is the full list
    expect(speedSteps()).toEqual([0.1, 0.25, 0.5, 1, 2, 4, 8]);
    attachVideo({ currentSrc: 'https://api.commadotai.com/v1/route/qcamera.m3u8', readyState: 4 });
    expect(speedSteps()).toEqual([0.5, 1, 2]);
    attachVideo({ currentSrc: 'blob:http://localhost:3001/0c1d-4e2f', readyState: 4 });
    expect(speedSteps()).toEqual([0.1, 0.25, 0.5, 1, 2, 4, 8]);
  });
});

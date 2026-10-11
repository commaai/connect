import { attachVideo, detachVideo, getVideo, videoOffsetMs } from './video';

const fakeVideo = (props = {}) => ({ currentTime: 0, readyState: 4, ...props });

describe('video clock', () => {
  afterEach(() => detachVideo(getVideo()));

  it('attaches and detaches an element, ignoring a detach of another element', () => {
    expect(getVideo()).toBeNull();
    const el = fakeVideo();
    attachVideo(el);
    expect(getVideo()).toBe(el);
    detachVideo(fakeVideo());
    expect(getVideo()).toBe(el);
    detachVideo(el);
    expect(getVideo()).toBeNull();
  });

  it('reports the route offset from currentTime and videoStartOffset', () => {
    expect(videoOffsetMs({ videoStartOffset: 500 })).toBeNull();
    attachVideo(fakeVideo({ currentTime: 12.5 }));
    expect(videoOffsetMs({ videoStartOffset: 300 })).toEqual(12800);
    expect(videoOffsetMs({})).toEqual(12500);
    expect(videoOffsetMs(null)).toEqual(12500);
  });

  it('reports null until the element has metadata', () => {
    attachVideo(fakeVideo({ currentTime: 12.5, readyState: 0 }));
    expect(videoOffsetMs({})).toBeNull();
  });
});

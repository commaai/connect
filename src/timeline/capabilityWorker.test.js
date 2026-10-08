import { afterEach, expect, it, vi } from 'vitest';
import { trackCapabilityWorkers } from '../../e2e/capability-worker';

afterEach(() => vi.unstubAllGlobals());
it('records only a terminated, revoked empty JS worker that is not media', () => {
  let next = 0;
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => { next += 1; return `blob:${next}`; }), revokeObjectURL: vi.fn() });
  class Worker { terminate = vi.fn(); }
  vi.stubGlobal('Worker', Worker);
  const record = vi.fn();
  vi.stubGlobal('__recordCapabilityProbe', record);
  trackCapabilityWorkers();
  const probe = URL.createObjectURL(new Blob([], { type: 'text/javascript' }));
  new window.Worker(probe).terminate();
  URL.revokeObjectURL(probe);
  expect(record).toHaveBeenCalledWith(probe);
  const live = URL.createObjectURL(new Blob([], { type: 'text/javascript' }));
  new window.Worker(live);
  URL.revokeObjectURL(live);
  const nonempty = URL.createObjectURL(new Blob(['source'], { type: 'text/javascript' }));
  new window.Worker(nonempty).terminate();
  URL.revokeObjectURL(nonempty);
  const mediaUrl = URL.createObjectURL(new Blob([], { type: 'text/javascript' }));
  const media = document.createElement('video'); media.src = mediaUrl; document.body.append(media);
  new window.Worker(mediaUrl).terminate(); URL.revokeObjectURL(mediaUrl); media.remove();
  const notWorker = URL.createObjectURL(new Blob([], { type: 'text/javascript' }));
  URL.revokeObjectURL(notWorker);
  expect(record).toHaveBeenCalledTimes(1);
});

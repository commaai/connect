// Mapbox 1.x tests Worker support with an empty JavaScript blob, then terminates
// and revokes it immediately. WebKit reports the canceled load as a console error.
export function trackCapabilityWorkers() {
  const probes = new Map();
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  const NativeWorker = window.Worker;
  URL.createObjectURL = value => {
    const url = create(value);
    if (value instanceof Blob && value.size === 0 && value.type === 'text/javascript') {
      probes.set(url, { terminated: false });
    }
    return url;
  };
  window.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      const worker = Reflect.construct(target, args);
      const probe = probes.get(args[0]);
      if (probe) {
        const terminate = worker.terminate.bind(worker);
        worker.terminate = () => { terminate(); probe.terminated = true; };
      }
      return worker;
    },
  });
  URL.revokeObjectURL = url => {
    const probe = probes.get(url);
    revoke(url);
    if (probe?.terminated && !Array.from(document.querySelectorAll('video, audio'))
      .some(media => media.src === url || media.currentSrc === url)) {
      window.__recordCapabilityProbe(url);
    }
    probes.delete(url);
  };
}

<script>
  /**
   * react-scan for a framework that does not re-render.
   *
   * React Scan outlines components as they re-render, because in React a state
   * change re-runs a component function and the interesting question is which
   * ones ran needlessly. Svelte 5 has no such step: a signal updates exactly the
   * DOM that reads it. The equivalent question here is which parts of the DOM
   * are actually being written to, and how often — a `$derived` that recomputes
   * an identical string, an `$effect` that reassigns a style every frame, and a
   * list re-keyed into a full teardown all show up as writes nobody asked for.
   *
   * So this watches the DOM rather than the framework, which is also why it
   * works on any of them.
   *
   * It draws to a canvas on purpose: an overlay built out of elements would
   * mutate the DOM it is watching, and then observe itself doing it.
   */
  import { onMount } from 'svelte';

  let {
    /** How long an outline stays up, in ms. */
    lifetime = 700,
  } = $props();

  /** Writes this many times within one lifetime is as hot as the scale goes. */
  const HOT = 12;

  let canvas = $state(null);

  /** Element -> { count, labels, at }. Boxes are measured at draw time, not here. */
  const hits = new Map();

  function labelFor(rec) {
    if (rec.type === 'attributes') return rec.attributeName;
    if (rec.type === 'characterData') return 'text';
    if (rec.addedNodes.length && rec.removedNodes.length) return 'replaced';
    return rec.addedNodes.length ? 'added' : 'removed';
  }

  /** The element a record is about; character data hangs off a text node. */
  function targetFor(rec) {
    const { target } = rec;
    return target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
  }

  /** Cyan through amber to red, the more often it was written. */
  function colorFor(count, alpha) {
    const t = Math.min(1, (count - 1) / HOT);
    const r = Math.round(60 + (195 * t));
    const g = Math.round(220 - (150 * t));
    const b = Math.round(220 - (170 * t));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  let dpr = 1;

  onMount(() => {
    const ctx = canvas.getContext('2d');
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  });

  $effect(() => {
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');

    const observer = new MutationObserver((records) => {
      for (const rec of records) {
        const el = targetFor(rec);
        // never account for the scanner's own canvas
        if (!el || !el.isConnected || el.closest('[data-render-scan]')) continue;

        const hit = hits.get(el);
        if (hit) {
          hit.count += 1;
          hit.at = performance.now();
          hit.labels.add(labelFor(rec));
        } else {
          hits.set(el, { count: 1, at: performance.now(), labels: new Set([labelFor(rec)]) });
        }
      }
    });
    observer.observe(document.body, {
      subtree: true, childList: true, attributes: true, characterData: true,
    });

    let frame = requestAnimationFrame(function draw() {
      frame = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const now = performance.now();
      ctx.font = '10px ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 1;

      for (const [el, hit] of hits) {
        const age = now - hit.at;
        if (age > lifetime || !el.isConnected) {
          hits.delete(el);
          continue;
        }

        const box = el.getBoundingClientRect();
        // an element with no box cannot be outlined; it still counts
        if (box.width === 0 && box.height === 0) continue;

        const alpha = 1 - (age / lifetime);
        ctx.strokeStyle = colorFor(hit.count, alpha);
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        const text = `${[...hit.labels].join(' ')}${hit.count > 1 ? ` ×${hit.count}` : ''}`;
        // above the box, unless that is off the top of the viewport
        const y = box.y > 13 ? box.y - 13 : box.y + box.height + 1;
        ctx.fillStyle = colorFor(hit.count, alpha * 0.85);
        ctx.fillRect(box.x, y, ctx.measureText(text).width + 6, 13);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.fillText(text, box.x + 3, y + 2);
      }
    });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      hits.clear();
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    };
  });
</script>

<canvas
  bind:this={canvas}
  data-render-scan="canvas"
  aria-hidden="true"
  class="pointer-events-none fixed inset-0 z-[2147483646]"
  style="width: 100vw; height: 100vh"
></canvas>


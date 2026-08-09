<script>
  let { oninview, children } = $props();

  let el = $state(null);
  // Kept outside the effect so a re-observe cannot fire it a second time.
  let fired = false;

  $effect(() => {
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !fired) {
          fired = true;
          oninview?.();
        }
      }
    }, {
      root: null, // relative to the viewport
      rootMargin: '0px',
      threshold: 0.1, // 10% of the target's visibility
    });

    observer.observe(el);
    return () => observer.disconnect();
  });
</script>

<div bind:this={el}>
  {@render children?.()}
</div>

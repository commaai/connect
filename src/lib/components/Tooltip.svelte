<script>
  /**
   * Stand-in for MUI v1's <Tooltip>: the anchor keeps its place in the parent's
   * layout (the wrapper is display:contents) and the bubble is position:fixed,
   * so neither adds a box the way a wrapping div would.
   */
  let {
    title = '',
    placement = 'bottom',
    offset = 14,
    panelClass = '',
    // MUI's popper class sets opacity .9; InfoTooltip's arrowPopper overrides it
    // to 1. A prop rather than something the caller restyles, so the value is
    // explicit instead of falling out of cascade order.
    opacity = 0.9,
    open = $bindable(false),
    children,
    panel,
  } = $props();

  let anchor = $state(null);
  let rect = $state(null);

  function measure() {
    const el = anchor?.firstElementChild;
    if (el) rect = el.getBoundingClientRect();
  }

  $effect(() => {
    if (open) measure();
  });

  const positionStyle = $derived.by(() => {
    if (!rect) return 'display: none';
    const centerX = rect.left + rect.width / 2;
    if (placement === 'top') {
      return `left: ${centerX}px; top: ${rect.top - offset}px; transform: translate(-50%, -100%)`;
    }
    return `left: ${centerX}px; top: ${rect.bottom + offset}px; transform: translateX(-50%)`;
  });
</script>

<span
  bind:this={anchor}
  role="presentation"
  style="display: contents"
  onmouseenter={() => { open = true; }}
  onmouseleave={() => { open = false; }}
  onfocusin={() => { open = true; }}
  onfocusout={() => { open = false; }}
>
  {@render children()}
</span>

{#if open && (panel || title)}
  <div
    role="tooltip"
    class="pointer-events-none fixed z-[1500] max-w-[300px] {panelClass}"
    style="opacity: {opacity}; line-height: 1.4em; {positionStyle}"
  >
    {#if panel}{@render panel()}{:else}{title}{/if}
  </div>
{/if}

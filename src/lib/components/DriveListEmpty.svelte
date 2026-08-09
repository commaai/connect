<script>
  import { innerWidth } from 'svelte/reactivity/window';

  let { device, routes } = $props();

  const containerPadding = $derived((innerWidth.current ?? 1280) > 520 ? 36 : 16);
</script>

<!-- MUI <Grid container>, flex: 0 -->
<div class="box-border flex w-full flex-wrap" style="flex: 0; padding: 16px {containerPadding}px">
  {#if device && routes == null}
    <p class="text-[0.875rem]">Loading...</p>
  {:else if routes?.length === 0}
    <p class="text-[0.875rem]">No routes found in selected time range.</p>
  {/if}
</div>

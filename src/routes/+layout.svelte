<script>
  import '../index.css';

  let { children, data } = $props();
</script>

{#if data.mockScenario}
  <div class="fixed bottom-2 right-2 z-50 rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
    mock: {data.mockScenario}
  </div>
{/if}

{@render children()}

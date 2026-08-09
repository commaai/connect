<script>
  import { page } from '$app/state';

  /** Placeholder for a route that has not been ported from React yet. */
  let { name, source } = $props();

  const params = $derived(Object.entries(page.params));
</script>

<section class="mx-auto max-w-2xl p-8 text-white">
  <p class="text-xs uppercase tracking-widest text-white/40">not ported yet</p>
  <h1 class="mt-1 text-2xl font-semibold">{name}</h1>

  <dl class="mt-6 space-y-1 font-mono text-sm">
    <div class="flex gap-3">
      <dt class="w-24 shrink-0 text-white/40">path</dt>
      <dd class="text-white/80">{page.url.pathname}</dd>
    </div>
    {#each params as [key, value] (key)}
      <div class="flex gap-3">
        <dt class="w-24 shrink-0 text-white/40">{key}</dt>
        <dd class="text-white/80">{value}</dd>
      </div>
    {/each}
  </dl>

  {#if source}
    <p class="mt-6 text-sm text-white/40">
      React source: <code class="text-white/60">{source}</code>
    </p>
  {/if}
</section>

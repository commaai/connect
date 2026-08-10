<script>
  import Tooltip from './Tooltip.svelte';

  let { title } = $props();

  let open = $state(false);

  // ClickAwayListener equivalent: any pointerdown outside dismisses the bubble.
  $effect(() => {
    if (!open) return;
    const close = () => { open = false; };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  });
</script>

{#snippet panel()}
  <p class="text-[14px]" style="line-height: 1.46429em">{title}</p>
  <span class="arrow"></span>
{/snippet}

<Tooltip
  bind:open
  placement="top"
  offset={8}
  opacity={1}
  panelClass="rounded-[4px] bg-[#1e2224] px-2 py-1 text-[10px] text-white"
  {panel}
>
  <svg
    viewBox="0 -960 960 960"
    fill="currentColor"
    width="1em"
    height="1em"
    style="font-size:18px"
    class="ml-2 shrink-0 cursor-pointer"
    role="button"
    tabindex="0"
    aria-label={title}
    onclick={() => { open = true; }}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open = true; } }}
  >
    <path d="M453-280h60v-240h-60v240Zm27-314q14 0 23-9t10-23q0-14-9-24-10-10-24-10t-23 10-10 24q0 14 9 23 10 9 24 9Zm0 514q-82 0-155-31t-128-86q-54-55-86-128-31-73-31-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm0-60q142 0 241-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm0-340Z" />
  </svg>
</Tooltip>

<style>
  .arrow {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: -0.9em;
    font-size: 7px;
    width: 3em;
    height: 1em;
  }

  .arrow::before {
    content: '';
    margin: auto;
    display: block;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 1em 1em 0 1em;
    border-color: #1e2224 transparent transparent transparent;
  }
</style>

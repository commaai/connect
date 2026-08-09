<script module>
  export const COMMACARE_URL = 'https://comma.ai/connect#what-is-commacare';
</script>

<script>
  import commacareIcon from '$lib/assets/commacare.png';

  let { size = 22, style = '', variant = 'icon', onclick } = $props();
</script>

{#if variant === 'pill'}
  <!-- Colors.green300 -->
  <a
    class="inline-flex cursor-pointer items-center rounded-[12px] border border-[#1a974e] py-[6px] pr-[14px] pl-3
           font-semibold tracking-[0.04em] text-[#1a974e] no-underline transition-[background-color] duration-150
           hover:bg-[rgba(81,191,135,0.1)]"
    style="line-height: 1; {style}"
    href={COMMACARE_URL}
    target="_blank"
    rel="noreferrer"
    onclick={(e) => e.stopPropagation()}
  >
    <img src={commacareIcon} alt="" class="mr-3 w-6" />
    commacare
  </a>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <span
    role={onclick ? 'button' : undefined}
    tabindex={onclick ? 0 : undefined}
    style="display: inline-flex; flex-shrink: 0; cursor: {onclick ? 'pointer' : 'default'}"
    {onclick}
    onkeydown={onclick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(e); } } : undefined}
  >
    <img src={commacareIcon} alt="commacare" style="width: {size}px; {style}" />
  </span>
{/if}

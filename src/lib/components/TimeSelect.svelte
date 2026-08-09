<script>
  import dayjs from 'dayjs';

  let { isOpen, onclose, filter, onselect } = $props();

  const LOOKBACK_WINDOW_MILLIS = 365 * 24 * 3600 * 1000;

  let start = $state(null);
  let end = $state(null);

  // componentDidMount/componentDidUpdate: a new filter from the parent wins over local edits.
  $effect(() => {
    start = filter?.start ?? null;
    end = filter?.end ?? null;
  });

  const minDate = dayjs().subtract(LOOKBACK_WINDOW_MILLIS, 'millisecond').format('YYYY-MM-DD');
  const maxDate = dayjs().format('YYYY-MM-DD');
  const startDate = $derived(dayjs(start || filter?.start).format('YYYY-MM-DD'));
  const endDate = $derived(dayjs(end || filter?.end).format('YYYY-MM-DD'));

  function changeStart(event) {
    const d = event.currentTarget.valueAsDate;
    if (d) {
      start = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
    }
  }

  function changeEnd(event) {
    const d = event.currentTarget.valueAsDate;
    if (d) {
      end = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59).getTime();
    }
  }

  function save() {
    onselect(start, end);
    onclose();
  }

  function scrollbarSize() {
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;top:-9999px;width:50px;height:50px;overflow:scroll';
    document.body.appendChild(div);
    const size = div.offsetWidth - div.clientWidth;
    div.remove();
    return size;
  }

  /**
   * MUI's Modal locks the body while it is open and pads it by the scrollbar
   * width, so the page behind does not jump when the scrollbar disappears.
   */
  $effect(() => {
    if (!isOpen) return;

    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    if (body.clientWidth < window.innerWidth) {
      const padding = parseInt(window.getComputedStyle(body).paddingRight, 10) || 0;
      body.style.paddingRight = `${padding + scrollbarSize()}px`;
    }
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  });

  // MUI Button variant="contained": theme.shadows[2].
  const buttonClass = 'inline-flex min-h-[36px] min-w-[64px] cursor-pointer items-center justify-center '
    + 'rounded-[4px] px-4 py-2 align-middle text-[0.875rem] leading-[1.4em] font-medium transition-colors '
    + 'shadow-[0_1px_5px_0_rgba(0,0,0,0.2),0_2px_2px_0_rgba(0,0,0,0.14),0_3px_1px_-2px_rgba(0,0,0,0.12)]';
  // MUI Typography variant="body2".
  // MUI Typography variant="body2" renders an <aside> via headlineMapping, which is
  // what the container's `& aside { width: 100 }` rule targeted.
  const labelClass = 'w-[100px] text-[0.875rem] leading-[1.71429em] font-medium text-white';
</script>

<svelte:window onkeydown={(e) => { if (isOpen && e.key === 'Escape') onclose(); }} />

{#if isOpen}
  <div class="fixed inset-0 z-[1300] flex items-center justify-center" role="dialog" aria-modal="true">
    <div
      class="fixed inset-0 bg-black/50"
      role="presentation"
      onclick={onclose}
      onkeydown={(e) => e.key === 'Escape' && onclose()}
    ></div>

    <!-- MUI Paper, backgroundColor overridden to #30373B by the theme -->
    <div
      role="document"
      class="relative w-[400px] max-w-[90%] rounded-[4px] bg-[#30373B] p-4 outline-none
             shadow-[0_1px_5px_0_rgba(0,0,0,0.2),0_2px_2px_0_rgba(0,0,0,0.14),0_3px_1px_-2px_rgba(0,0,0,0.12)]"
    >
      <!-- tailwind's preflight gives inputs `font: inherit`, and the shorthand carries
           line-height, so the body shim would reach a control that inherited none in React. -->
      <div class="mb-5 flex">
        <aside class={labelClass}>Start date:</aside>
        <input
          aria-label="Start date"
          type="date"
          min={minDate}
          max={maxDate}
          value={startDate}
          oninput={changeStart}
          style="line-height: normal"
        />
      </div>
      <div class="mb-5 flex">
        <aside class={labelClass}>End date:</aside>
        <input
          aria-label="End date"
          type="date"
          min={startDate}
          max={maxDate}
          value={endDate}
          oninput={changeEnd}
          style="line-height: normal"
        />
      </div>

      <!-- MUI Divider -->
      <div class="h-px bg-white/12"></div>

      <div class="mt-5 text-right">
        <!-- Colors.grey200 / grey400, then Colors.white / white70 -->
        <button type="button" class="{buttonClass} bg-[#5c696f] text-white hover:bg-[#4b5559]" onclick={onclose}>Cancel</button>&nbsp;<button type="button" class="{buttonClass} bg-white text-[#272c2f] hover:bg-white/70" onclick={save}>Save</button>
      </div>
    </div>
  </div>
{/if}

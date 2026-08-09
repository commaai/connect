<script>
  // MUI IconButton + KeyboardBackspace: the "Go Back" control both prime screens
  // render, duplicated in PrimeCheckout.jsx and PrimeManage.jsx.
  let { onclick } = $props();
</script>

<button
  type="button"
  aria-label="Go Back"
  class="relative inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full p-0 text-center align-middle text-[24px] text-white hover:bg-white/10"
  {onclick}
>
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true">
    <path d="M21 11H6.83l3.58-3.59L9 6l-6 6 6 6 1.41-1.41L6.83 13H21z" />
  </svg>
</button>

<script>
  // src/icons/index.jsx InfoOutline: a material symbol, so it keeps its own
  // viewBox inside MUI SvgIcon's 1em/24px box.
  // SvgIcon's 24px box is the default; a caller that wants another size passes
  // it rather than layering a text-* utility over the inline font-size.
  let { class: className = '', size = '24px' } = $props();
</script>

<svg class={className} viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:{size}" aria-hidden="true" focusable="false">
  <path d="M453-280h60v-240h-60v240Zm27-314q14 0 23-9t10-23q0-14-9-24-10-10-24-10t-23 10-10 24q0 14 9 23 10 9 24 9Zm0 514q-82 0-155-31t-128-86q-54-55-86-128-31-73-31-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm0-60q142 0 241-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm0-340Z" />
</svg>

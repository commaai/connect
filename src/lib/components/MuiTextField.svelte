<script>
  /**
   * MUI v1 TextField: FormControl > InputLabel + Input (+ FormHelperText).
   * The project theme rounds the Input, gives it a grey800 border and drops the
   * underline (props.MuiInput.disableUnderline), and nudges the label/helper in.
   */
  let { id, label, value, helperText = null, class: className = '', oninput, onenter } = $props();

  // MuiFormControl.filled: isFilled() is value != null && value !== ''.
  const shrink = $derived(value !== null && value !== undefined && value !== '');
  // MuiInputLabel.shrink transform is overridden by the theme.
  const labelTransform = $derived(shrink ? 'translate(0, -2px) scale(0.75)' : 'translate(0, 24px) scale(1)');
</script>

<div
  class="relative m-0 inline-flex min-w-0 flex-col border-0 p-0 {className}"
  aria-describedby={helperText ? `${id}-helper-text` : undefined}
>
  <label
    for={id}
    data-shrink={shrink}
    class="absolute top-0 left-0 mt-1 ml-4 origin-top-left p-0 text-[1rem] leading-none text-white/70"
    style="transform: {labelTransform}; transition: transform 200ms cubic-bezier(0.0, 0, 0.2, 1) 0ms"
  >{label}</label>
  <!-- MuiInput root; `label + &` supplies the 16px top margin -->
  <div class="relative mt-4 inline-flex overflow-hidden rounded-[20px] border border-[#272c2f] text-[1rem] leading-[1.1875em] text-white">
    <!-- tailwind's preflight gives inputs `font: inherit`; MUI sized this input from
         the Input root (1rem / 1.1875em) on top of a content-box, so state it here. -->
    <input
      {id}
      type="text"
      value={value ?? ''}
      {oninput}
      onkeydown={(e) => { if (e.key === 'Enter') onenter?.(); }}
      class="m-0 box-content block min-w-0 grow border-0 bg-transparent px-4 py-3 align-middle text-[1rem] leading-[1.1875em] focus:outline-none"
    />
  </div>
  {#if helperText}
    <!-- MuiFormHelperText root is marginTop 8; theme.MuiFormHelperText overrides
         it to marginTop 4, marginLeft 8. -->
    <p id="{id}-helper-text" class="mt-1 ml-2 min-h-[1em] text-left text-[0.75rem] leading-[1em] text-white/70">{helperText}</p>
  {/if}
</div>

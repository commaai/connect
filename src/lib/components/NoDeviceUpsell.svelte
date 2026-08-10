<script>
  import AddDevice from './AddDevice.svelte';

  let { onpaired } = $props();

  const addButton = 'relative m-0 box-border inline-flex min-h-9 w-full min-w-16 cursor-pointer '
    + 'items-center justify-center rounded-[18px] border-0 bg-white px-4 py-2 align-middle '
    + 'text-[0.875rem] leading-[1.4em] font-medium normal-case text-[#1e2224] no-underline '
    + 'transition-colors duration-[250ms] outline-none select-none hover:bg-[rgba(255,255,255,0.7)]';
</script>

<div class="mx-4 mt-4 flex flex-col items-center sm:mt-8 md:mx-6 md:mt-16 lg:mx-8">
  <!--
    This was `prose prose-invert` from @tailwindcss/typography, which emitted 78
    rules into every page's stylesheet to style this one panel. The values below
    are what prose computed here: gray-300 body on gray-600 markers, 16/28 text,
    and the 1.25em/0.5em rhythm it applies to p, ul and li.
  -->
  <div class="flex max-w-sm flex-col items-center py-2 text-[16px] leading-7 text-gray-300">
    <h2 class="mb-6 text-2xl font-bold text-white">Pair your device</h2>
    <p class="mb-5">
      Scan the QR code on your device.
      If you cannot see a QR code, check the following:
    </p>
    <ul class="my-5 list-disc pl-[26px] marker:text-gray-600">
      <li class="my-2 pl-1.5">Your device is connected to the internet</li>
      <li class="my-2 pl-1.5">You have installed the latest version of openpilot</li>
      <li class="my-2 pl-1.5">You may need to look for &quot;Pair Device&quot; in Settings</li>
    </ul>
    <p class="mb-5">
      If you still cannot see a QR code, your device may already be paired to
      another account. Make sure you have signed in with the same account you
      may have used previously.
    </p>
    <div class="mt-2 w-full">
      <AddDevice buttonText="add new device" buttonStyle={addButton} {onpaired} />
    </div>
  </div>

  <picture class="mt-4 max-w-3xl p-4">
    <source type="image/png" srcset="/images/comma-device.png" />
    <img alt="comma four" />
  </picture>
</div>

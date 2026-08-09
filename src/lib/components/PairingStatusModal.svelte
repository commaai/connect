<script>
  import localforage from 'localforage';

  import { devices as Devices } from '$lib/api';
  import { pairErrorToMessage, verifyPairToken } from '$lib/utils';

  let { onpaired } = $props();

  let pairLoading = $state(false);
  let pairError = $state(null);
  let pairDongleId = $state(null);

  const open = $derived(Boolean(pairLoading || pairError || pairDongleId));

  // explorer.jsx componentDidMount: App stashes a ?pair= token in localforage,
  // and the dashboard redeems it on the way in.
  $effect(() => {
    let cancelled = false;

    (async () => {
      let pairToken;
      try {
        pairToken = await localforage.getItem('pairToken');
      } catch (err) {
        console.error(err);
        return;
      }
      if (!pairToken || cancelled) return;

      pairLoading = true;
      try {
        verifyPairToken(pairToken, true, 'explorer_pair_verify_pairtoken');
      } catch (err) {
        pairLoading = false;
        pairDongleId = null;
        pairError = `Error: ${err.message}`;
        await localforage.removeItem('pairToken');
        return;
      }

      try {
        const resp = await Devices.pilotPair(pairToken);
        await localforage.removeItem('pairToken');
        if (resp?.dongle_id) {
          pairLoading = false;
          pairError = null;
          pairDongleId = resp.dongle_id;
        } else {
          pairDongleId = null;
          pairLoading = false;
          pairError = 'Error: could not pair, please try again';
        }
      } catch (err) {
        await localforage.removeItem('pairToken');
        const msg = pairErrorToMessage(err, 'explorer_pair_pairtoken');
        pairDongleId = null;
        pairLoading = false;
        pairError = `Error: ${msg}, please try again`;
      }
    })();

    return () => { cancelled = true; };
  });

  async function closePair() {
    await localforage.removeItem('pairToken');
    const paired = pairDongleId;
    pairLoading = false;
    pairError = null;
    pairDongleId = null;
    if (paired) onpaired?.(paired);
  }

  /** MUI Modal focuses its child on enter, after the opening click settles. */
  function autofocusPanel(node) {
    const id = requestAnimationFrame(() => node.focus());
    return { destroy: () => cancelAnimationFrame(id) };
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') closePair(); }} />

{#if open}
  <div class="fixed inset-0 z-[1300]" role="dialog" aria-modal="true">
    <!-- MUI Backdrop -->
    <div class="fixed inset-0 bg-black/50" role="presentation" onclick={closePair} onkeydown={() => {}}></div>

    <div role="document" tabindex="-1" class="paper modal" use:autofocusPanel>
      <h2 class="typography title">Pairing device</h2>
      <!-- MUI Divider -->
      <hr class="divider" />

      {#if pairLoading}
        <!-- MUI CircularProgress size={32}, indeterminate. The gallery freezes
             animation, so what paints is the pre-animation dash pattern. -->
        <div class="progress" role="progressbar">
          <svg viewBox="22 22 44 44">
            <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
          </svg>
        </div>
      {/if}

      {#if pairDongleId}
        <p class="typography body1">
          {'Successfully paired device '}<span class="pairedDongleId">{pairDongleId}</span>
        </p>
      {/if}

      {#if pairError}
        <p class="typography body1">{pairError}</p>
      {/if}

      <button type="button" class="muiButton closeButton" onclick={closePair}>
        <span class="buttonLabel">Close</span>
      </button>
    </div>
  </div>
{/if}

<style>
  /* explorer.jsx styles.modal, over MUI Paper (theme background, elevation 2) */
  .paper {
    background-color: #30373b;
    border-radius: 4px;
    box-shadow:
      0px 1px 5px 0px rgba(0, 0, 0, 0.2),
      0px 2px 2px 0px rgba(0, 0, 0, 0.14),
      0px 3px 1px -2px rgba(0, 0, 0, 0.12);
  }

  .modal {
    position: absolute;
    padding: 16px;
    width: 400px;
    max-width: 90%;
    left: 50%;
    top: 40%;
    transform: translate(-50%, -50%);
    outline: none;
  }

  .modal p {
    margin-top: 10px;
  }

  .typography {
    display: block;
    margin: 0;
  }

  /* MUI Typography variant="title" */
  .title {
    font-size: 1.3125rem;
    font-weight: 500;
    line-height: 1.16667em;
    color: #fff;
  }

  .body1 {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.46429em;
    color: #fff;
  }

  .pairedDongleId {
    font-weight: bold;
  }

  /* MUI Divider */
  .divider {
    height: 1px;
    margin: 0;
    border: none;
    flex-shrink: 0;
    background-color: rgba(255, 255, 255, 0.12);
  }

  /* MUI CircularProgress, size 32, styles.fabProgress marginTop */
  .progress {
    display: inline-block;
    width: 32px;
    height: 32px;
    margin-top: 10px;
    color: #fff;
  }

  .progress svg {
    display: block;
  }

  .progressCircle {
    stroke: currentColor;
    stroke-dasharray: 80px, 200px;
    stroke-dashoffset: 0px;
  }

  /* MuiButtonBase + MuiButton root, contained, with styles.closeButton */
  .muiButton {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 64px;
    min-height: 36px;
    padding: 8px 16px;
    border: 0;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4em;
    text-transform: none;
    text-decoration: none;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
    outline: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    box-shadow:
      0px 1px 5px 0px rgba(0, 0, 0, 0.2),
      0px 2px 2px 0px rgba(0, 0, 0, 0.14),
      0px 3px 1px -2px rgba(0, 0, 0, 0.12);
  }

  /* Colors.grey200 / grey400 */
  .closeButton {
    margin-top: 10px;
    float: right;
    background-color: #5c696f;
    color: #fff;
  }

  .closeButton:hover {
    background-color: #4b5559;
  }

  .buttonLabel {
    width: 100%;
    display: inherit;
    align-items: inherit;
    justify-content: inherit;
  }
</style>

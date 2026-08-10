<script>
  import * as Sentry from '@sentry/browser';
  import { untrack } from 'svelte';

  import { devices as Devices } from '$lib/api';
  import { lockBodyScroll } from '$lib/utils/scroll-lock';
  import CommacareBadge, { COMMACARE_URL } from './CommacareBadge.svelte';
  import UploadQueue from './drive/UploadQueue.svelte';
  import MuiTextField from './MuiTextField.svelte';

  let {
    isOpen,
    dongleId,
    device,
    profile,
    onclose,
    onunpaired,
    onprimenav,
  } = $props();

  let deviceAlias = $state('');
  let savedAlias = $state(null);
  let uploadModal = $state(false);
  let loadingDeviceAlias = $state(false);
  let loadingDeviceShare = $state(false);
  let hasSavedAlias = $state(false);
  let hasShared = $state(false);
  let shareEmail = $state('');
  let unpairConfirm = $state(false);
  let unpaired = $state(false);
  let loadingUnpair = $state(false);
  let error = $state(null);
  let unpairError = $state(null);

  $effect(() => {
    const id = dongleId;
    untrack(() => {
      deviceAlias = device?.dongle_id === id ? device.alias : '';
      savedAlias = null;
      uploadModal = false;
      loadingDeviceAlias = false;
      loadingDeviceShare = false;
      hasSavedAlias = false;
      hasShared = false;
      shareEmail = '';
      unpairConfirm = false;
      unpaired = false;
      loadingUnpair = false;
      error = null;
      unpairError = null;
    });
  });

  const commacare = $derived(device?.commacare);
  const currentAlias = $derived(savedAlias ?? device?.alias);
  const showAliasSave = $derived(currentAlias !== deviceAlias || hasSavedAlias);

  function handleAliasChange(e) {
    const next = e.currentTarget.value;
    if (next !== device?.dongle_id) hasSavedAlias = false;
    deviceAlias = next;
  }

  function handleEmailChange(e) {
    shareEmail = e.currentTarget.value;
    hasShared = false;
    error = null;
  }

  async function setDeviceAlias() {
    if (loadingDeviceAlias) return;

    loadingDeviceAlias = true;
    hasSavedAlias = false;
    try {
      // ApiRequest resolves to null on any !ok response once an error callback is
      // configured, so a resolved promise is the only signal that it saved.
      const updated = await Devices.setDeviceAlias(device.dongle_id, (deviceAlias ?? '').trim());
      savedAlias = updated?.alias ?? (deviceAlias ?? '').trim();
      loadingDeviceAlias = false;
      hasSavedAlias = true;
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'device_settings_alias' });
      error = err.message;
      loadingDeviceAlias = false;
    }
  }

  async function shareDevice() {
    if (loadingDeviceShare) return;

    loadingDeviceShare = true;
    hasShared = false;
    try {
      await Devices.grantDeviceReadPermission(dongleId, shareEmail.trim());
      loadingDeviceShare = false;
      shareEmail = '';
      hasShared = true;
      error = null;
    } catch (err) {
      if (err.resp && err.resp.status === 404) {
        error = 'could not find user';
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'device_settings_share' });
        error = 'unable to share';
      }
      loadingDeviceShare = false;
    }
  }

  function onPrimeSettings() {
    onprimenav?.(dongleId);
    onclose?.();
  }

  async function unpairDevice() {
    loadingUnpair = true;
    try {
      const resp = await Devices.unpair(device.dongle_id);
      if (resp.success) {
        unpaired = true;
      } else {
        unpaired = false;
        unpairError = resp.error || 'Could not successfully unpair';
      }
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'device_settings_unpair' });
      console.error(err);
      unpaired = false;
      unpairError = 'Unable to unpair';
    }
    loadingUnpair = false;
  }

  function closeUnpair() {
    if (unpaired) {
      onunpaired?.();
    } else {
      unpairConfirm = false;
    }
  }

  $effect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  });

  function onEscape() {
    if (unpairConfirm) closeUnpair();
    else if (isOpen) onclose?.();
  }

  const paperClass = 'absolute top-[40%] left-1/2 rounded-[4px] bg-[#30373B] p-4 outline-none '
    + 'shadow-[0_1px_5px_0_rgba(0,0,0,0.2),0_2px_2px_0_rgba(0,0,0,0.14),0_3px_1px_-2px_rgba(0,0,0,0.12)]';
  const buttonBase = 'box-border inline-flex min-h-[36px] min-w-[64px] cursor-pointer items-center justify-center '
    + 'rounded-[4px] px-4 py-2 align-middle text-[0.875rem] leading-[1.4em] font-medium transition-colors';
  const outlinedButton = `${buttonBase} border border-white/23 text-white hover:bg-white/10 `
    + 'disabled:cursor-default disabled:text-white/30';
  // variant="contained" carries theme.shadows[2]; styles.cancelButton repaints it grey200/grey400.
  const cancelButton = `${buttonBase} bg-[#5c696f] text-white hover:bg-[#4b5559] `
    + 'shadow-[0_1px_5px_0_rgba(0,0,0,0.2),0_2px_2px_0_rgba(0,0,0,0.14),0_3px_1px_-2px_rgba(0,0,0,0.12)]';
  // styles.primeManageButton
  const spacedButton = 'mt-[20px] mr-[20px] last:mr-0';
  // styles.titleContainer
  const titleRow = 'mb-[5px] flex items-baseline justify-between';

  const CHECK_PATH = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
  const SAVE_PATH = 'M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z';
  const SHARE_PATH = 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z';
</script>

<svelte:window onkeydown={(e) => { if (!uploadModal && e.key === 'Escape') onEscape(); }} />

{#snippet titleContainer(title)}
  <div class={titleRow}>
    <h2 class="text-[1.3125rem] font-medium" style="line-height: 1.16667em">{title}</h2>
    <span class="block text-[0.75rem] text-white/70" style="line-height: 1.375em">{device.dongle_id}</span>
  </div>
  <hr class="m-0 h-px shrink-0 border-none bg-white/12" />
{/snippet}

{#snippet fab(onclick, iconPath, loading, label)}
  <div class="relative m-2 inline-block">
    <button
      type="button"
      aria-label={label}
      class="relative inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full p-0 text-center align-middle text-[24px] text-white hover:bg-white/10"
      {onclick}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" aria-hidden="true">
        <path d={iconPath} />
      </svg>
    </button>
    {#if loading}
      <div class="progress absolute top-0 left-0 z-[1] inline-block" role="progressbar" style="width: 48px; height: 48px; line-height: 1; color: #57a9e3">
        <svg viewBox="22 22 44 44">
          <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
        </svg>
      </div>
    {/if}
  </div>
{/snippet}

{#if device && isOpen}
  <div
    class="fixed inset-0 z-[1300]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="device-settings-modal"
    aria-describedby="device-settings-modal-description"
  >
    <div
      class="fixed inset-0 bg-black/50"
      role="presentation"
      onclick={() => onclose?.()}
      onkeydown={(e) => e.key === 'Escape' && onclose?.()}
    ></div>

    <div role="document" class="{paperClass} w-[400px] max-w-[90%]" style="transform: translate(-50%, -50%)">
      {@render titleContainer('Device settings')}

      <div><button type="button" class="{outlinedButton} {spacedButton}" onclick={onPrimeSettings}>Prime settings</button><button type="button" class="{outlinedButton} {spacedButton}" onclick={() => { unpairConfirm = true; }}>Unpair</button></div>

      <div class="flex items-end">
        <button type="button" class="{outlinedButton} {spacedButton}" onclick={() => { uploadModal = true; }}>Uploads</button>
        {#if commacare}
          <CommacareBadge variant="pill" />
        {/if}
      </div>

      <!-- styles.form -->
      <div class="pt-2 pb-2">
        {#if error}
          <!-- styles.formRowError, Colors.red500 -->
          <div class="mb-[5px] bg-[#75141d] p-[10px]">
            <p class="text-[0.875rem]">{error}</p>
          </div>
        {/if}
        <!-- styles.formRow -->
        <div class="min-h-[75px]"><MuiTextField id="device_alias" label="Device name" class="max-w-[70%]" value={deviceAlias ?? ''} oninput={handleAliasChange} onenter={setDeviceAlias} />{#if showAliasSave}{@render fab(setDeviceAlias, hasSavedAlias ? CHECK_PATH : SAVE_PATH, loadingDeviceAlias, 'save device name')}{/if}</div>
        <div class="min-h-[75px]"><MuiTextField id="device_share" label="Share by email or user id" class="max-w-[70%]" value={shareEmail} helperText="give another user read access to this device" oninput={handleEmailChange} onenter={shareDevice} />{#if shareEmail.length > 0 || hasShared}{@render fab(shareDevice, hasShared ? CHECK_PATH : SHARE_PATH, loadingDeviceShare, 'share device')}{/if}</div>
      </div>

      <!-- styles.buttonGroup -->
      <div class="text-right">
        <button type="button" class={cancelButton} onclick={() => onclose?.()}>Close</button>
      </div>
    </div>
  </div>
{/if}

{#if device && unpairConfirm}
  <div
    class="fixed inset-0 z-[1300]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="device-settings-modal"
    aria-describedby="device-settings-modal-description"
  >
    <div
      class="fixed inset-0 bg-black/50"
      role="presentation"
      onclick={closeUnpair}
      onkeydown={(e) => e.key === 'Escape' && closeUnpair()}
    ></div>

    <!-- styles.modalUnpair narrows styles.modal -->
    <div role="document" class="{paperClass} w-[360px] max-w-[80%]" style="transform: translate(-50%, -50%)">
      {@render titleContainer('Unpair device')}

      {#if unpairError}
        <!-- styles.unpairError -->
        <div class="mt-[15px] flex items-center bg-[rgba(255,0,0,0.3)] p-[10px] text-white">
          <!-- icons/ErrorOutline -->
          <svg viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0" aria-hidden="true">
            <path d="M480-280q14 0 24-9 9-10 9-24t-9-23q-10-10-24-10t-23 9q-10 10-10 24t9 23q10 10 24 10Zm-27-153h60v-253h-60v253Zm27 353q-82 0-155-31t-127-86q-55-55-86-128-32-73-32-155 0-83 32-156 31-73 86-127t127-85q73-32 156-32 82 0 155 32 73 31 127 85t86 127q31 73 31 156 0 82-31 155t-86 127q-54 55-127 86-73 32-156 32Zm1-60q141 0 240-99t99-241q0-142-99-241t-241-99q-141 0-240 99-100 99-100 241 0 141 100 241t241 99Zm-1-340Z" />
          </svg>
          <p class="ml-[10px] inline-block text-[0.875rem]">{unpairError}</p>
        </div>
      {/if}

      {#if device.prime}
        <!-- styles.unpairWarning, Colors.orange200 -->
        <div class="mt-[15px] flex items-center bg-[#b85e1f] p-[10px] text-white">
          <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0" aria-hidden="true">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
          {#if commacare}
            <p class="ml-[10px] inline-block text-[0.875rem]">
              Unpairing will also cancel comma prime and <strong>permanently end your commacare extended warranty.</strong> Your standard 1-year warranty still applies for any remaining time. <a class="text-white underline" href={COMMACARE_URL} target="_blank" rel="noreferrer">What is commacare?</a>
            </p>
          {:else}
            <p class="ml-[10px] inline-block text-[0.875rem]">Unpairing will also cancel the comma prime subscription for this device.</p>
          {/if}
        </div>
      {/if}

      <!-- styles.topButtonGroup -->
      <div class="flex flex-wrap-reverse items-baseline justify-between">
        <button type="button" class="{cancelButton} {spacedButton}" onclick={closeUnpair}>{unpaired ? 'Close' : 'Cancel'}</button>
        {#if unpaired}
          <aside class="text-[0.875rem] font-medium" style="line-height: 1.71429em">Unpaired</aside>
        {:else}
          <button
            type="button"
            class="{outlinedButton} {spacedButton}"
            onclick={unpairDevice}
            disabled={loadingUnpair}
          >{loadingUnpair ? 'Unpairing...' : 'Confirm'}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- DeviceSettingsModal kept its own Modal open and rendered the queue as a
     sibling, so both backdrops stack and the settings paper dims behind it. -->
<UploadQueue
  open={uploadModal}
  update={uploadModal}
  {device}
  currentDongleId={dongleId}
  onclose={() => { uploadModal = false; }}
/>

<style>
  .progress {
    animation: circular-rotate 1.4s linear infinite;
  }

  .progressCircle {
    stroke: currentColor;
    stroke-dasharray: 80px, 200px;
    stroke-dashoffset: 0px;
    animation: circular-dash 1.4s ease-in-out infinite;
  }

  @keyframes circular-rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes circular-dash {
    0% {
      stroke-dasharray: 1px, 200px;
      stroke-dashoffset: 0px;
    }
    50% {
      stroke-dasharray: 100px, 200px;
      stroke-dashoffset: -15px;
    }
    100% {
      stroke-dasharray: 100px, 200px;
      stroke-dashoffset: -120px;
    }
  }
</style>

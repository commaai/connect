<script>
  import * as Sentry from '@sentry/browser';
  import dayjs from 'dayjs';
  import { untrack } from 'svelte';
  import { innerWidth } from 'svelte/reactivity/window';

  import { athena } from '$lib/api';
  import { deviceSupportsClips } from '$lib/api/clips';
  import { deviceIsOnline, deviceNamePretty, deviceVersionAtLeast, truncateName } from '$lib/utils';
  import { watchReturn } from '$lib/state/page-active';
  import { webrtcConnectionManager } from '$lib/utils/webrtc';
  import CommacareBadge from './CommacareBadge.svelte';
  import Tooltip from './Tooltip.svelte';

  let {
    dongleId,
    device,
    onprimenav,
    onstream,
    onclips,
    onnotcar,
    onanalytics,
  } = $props();

  let carHealth = $state({});
  let snapshot = $state({});
  let clipsSupported = $state(false);
  let notCar = $state(null);
  let snapshotButton = $state(null);
  let errorRect = $state(null);

  const windowWidth = $derived(innerWidth.current ?? 1280);
  const online = $derived(deviceIsOnline(device));
  const isCommaBody = $derived(notCar ?? device?.rpc?.not_car ?? false);

  // TO BE REMOVED: once 0.11.1 is deprecated, we can remove this since all devices should have livestreaming
  const livestreamEnabled = $derived(deviceVersionAtLeast(device, '0.11.2'));
  const bodyTeleopEnabled = $derived(isCommaBody && livestreamEnabled);

  async function checkClipsSupport(id) {
    try {
      const supported = await deviceSupportsClips(device);
      if (id === dongleId) clipsSupported = supported;
    } catch {
      // The button stays hidden when Athena is unavailable or too old.
    }
  }

  async function fetchDeviceCarHealth(id) {
    if (!deviceIsOnline(device)) {
      carHealth = {};
      return;
    }

    carHealth = { fetching: true };
    try {
      const payload = {
        method: 'getMessage',
        params: { service: 'peripheralState', timeout: 5000 },
        jsonrpc: '2.0',
        id: 0,
      };
      const resp = await athena.postJsonRpcPayload(id, payload);
      if (id === dongleId) {
        carHealth = resp;
      }
    } catch (err) {
      if (id === dongleId) {
        if (!err.message || err.message.indexOf('Device not registered') === -1) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'device_info_athena_pandastate' });
        }
        carHealth = { error: err.message };
      }
    }
  }

  async function fetchDeviceNotCar(id) {
    if (!deviceIsOnline(device)) return;

    try {
      const resp = await athena.postJsonRpcPayload(id, { id: 0, jsonrpc: '2.0', method: 'getNotCar' });
      if (resp && resp.result !== undefined && id === dongleId) {
        notCar = resp.result === true;
        onnotcar?.(id, notCar);
      }
    } catch (err) {
      if (!err.message || err.message.indexOf('Device not registered') === -1) {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'athena_fetch_notcar' });
      }
    }
  }

  function onVisible(id) {
    if (device?.shared) return;
    fetchDeviceCarHealth(id);
    fetchDeviceNotCar(id);
  }

  const refreshOnReturn = watchReturn(() => onVisible(dongleId), { minInterval: 60 });

  // Refetch on mount and whenever the dongle changes, dropping the previous
  // device's readings first.
  $effect(() => {
    const id = dongleId;
    untrack(() => {
      carHealth = {};
      snapshot = {};
      clipsSupported = false;
      notCar = null;
      checkClipsSupport(id);
      onVisible(id);
      // that counts as the refresh for this device
      refreshOnReturn.reset();
    });
  });

  $effect(refreshOnReturn);

  let wasOnline = false;
  $effect(() => {
    const isOnline = online;
    if (isOnline && !wasOnline) untrack(() => checkClipsSupport(dongleId));
    wasOnline = isOnline;
  });

  $effect(() => {
    if (dongleId && online && isCommaBody && deviceVersionAtLeast(device, '0.11.2')) {
      untrack(() => webrtcConnectionManager.prewarm(dongleId));
    }
  });

  async function takeSnapshot() {
    const id = dongleId;
    snapshot = { ...snapshot, error: null, fetching: true };
    onanalytics?.('take_snapshot');
    try {
      const payload = { method: 'takeSnapshot', jsonrpc: '2.0', id: 0 };
      let resp = await athena.postJsonRpcPayload(id, payload);
      if (resp.result && !resp.result.jpegBack && !resp.result.jpegFront) {
        resp = await athena.postJsonRpcPayload(id, payload);
      }
      if (resp.result && !resp.result.jpegBack && !resp.result.jpegFront) {
        throw new Error('unable to fetch snapshot');
      }
      if (id === dongleId) {
        snapshot = resp;
      }
    } catch (err) {
      let error = err.message;
      if (error.indexOf('Device not registered') !== -1) {
        error = 'device offline';
      } else {
        console.error(err);
        Sentry.captureException(err, { fingerprint: 'device_info_snapshot' });
        if (error.length > 5 && error[5] === '{') {
          try {
            error = JSON.parse(error.substr(5)).error;
          } catch {
            //pass
          }
        }
      }
      snapshot = { error };
    }
  }

  const batteryVoltage = $derived(
    online && carHealth?.result?.peripheralState?.voltage
      ? carHealth.result.peripheralState.voltage / 1000.0
      : undefined,
  );
  // Colors.grey400 / Colors.red400 / Colors.green400
  const batteryBackground = $derived.by(() => {
    if (batteryVoltage === undefined) return '#4b5559';
    return batteryVoltage < 11.0 ? '#861721' : '#178645';
  });
  const batteryText = $derived(batteryVoltage ? `${batteryVoltage.toFixed(1)} V` : 'N/A');

  const snapshotError = $derived.by(() => {
    if (snapshot.error?.data?.message) return snapshot.error.data.message;
    if (snapshot.error?.message) return snapshot.error.message;
    if (snapshot.error) return 'error while fetching snapshot';
    return null;
  });

  $effect(() => {
    errorRect = snapshotError && snapshotButton ? snapshotButton.getBoundingClientRect() : null;
  });

  const pingTooltip = $derived.by(() => {
    if (!device.last_athena_ping) return 'no ping received from device';
    const lastAthenaPing = dayjs(device.last_athena_ping * 1000);
    return `Last ping on ${lastAthenaPing.format('MMM D, YYYY')} at ${lastAthenaPing.format('h:mm A')}`;
  });

  // styles.carBattery — shared by the icon buttons and the voltage pill
  const pill = 'flex items-center rounded-[15px] px-4 py-[5px] text-center';
  // styles.button / styles.buttonOffline, split so that no two conflicting
  // Tailwind utilities land on the same element (class order does not decide).
  const buttonOnline = 'cursor-pointer bg-white text-[#1e2224] hover:bg-[#ddd] disabled:cursor-default disabled:bg-[#ddd]';
  const buttonOffline = 'cursor-pointer bg-[#4b5559] text-[#b8c0c4] disabled:cursor-default';
  // styles.popover
  const popover = 'rounded-[22px] border border-white/10 bg-[#272c2f] px-4 py-2 text-center text-[12px]';
</script>

{#snippet snapshotImage(src, isFront)}
  {#if src}
    <img src={`data:image/jpeg;base64,${src}`} alt="" class="block max-w-full" style="width: 450px" />
  {:else}
    <!-- Colors.grey950 -->
    <div
      class="mx-auto flex h-full w-[450px] max-w-full flex-col items-center justify-center bg-[#151819]"
      style="padding: 0 80px"
    >
      <p class="text-center text-base font-semibold">{isFront ? 'Interior' : ''} snapshot not available</p>
      {#if isFront}
        <p class="text-center text-base">
          Enable &ldquo;Record and Upload Driver Camera&rdquo; on your device for interior camera snapshots
        </p>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="flex min-h-16 flex-col justify-center border-b border-white/10 px-4">
  <div class="my-4 flex flex-row flex-wrap items-center justify-between gap-4 pl-1 md:my-2">
    <div class="flex shrink-0 flex-row items-center gap-4">
      {#if device?.commacare}
        <CommacareBadge onclick={() => onprimenav?.(true)} />
      {/if}
      <p class="text-[1.3125rem] font-medium" style="line-height: 1.16667em">{truncateName(deviceNamePretty(device))}</p>
    </div>

    <div class="flex min-w-0 shrink flex-wrap justify-end gap-2 md:flex-row md:items-stretch">
      {#if clipsSupported}
        <Tooltip title={online ? 'Clips' : 'Device offline'} offset={5} panelClass={popover}>
          <span class="inline-flex">
            <button
              type="button"
              style={online ? '' : 'opacity: 0.7'}
              class="{buttonOnline} {pill}"
              aria-label="Clips"
              onclick={(event) => onclips?.(event.currentTarget)}
              disabled={!online}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0 text-black" aria-hidden="true">
                <path d="M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z" />
              </svg>
            </button>
          </span>
        </Tooltip>
      {/if}

      {#if livestreamEnabled}
        <Tooltip title={bodyTeleopEnabled ? 'Teleop' : 'Livestream'} offset={5} panelClass={popover}>
          <button
            type="button"
            style={online ? '' : 'opacity: 0.3'}
            class="{online ? buttonOnline : buttonOffline} {pill}"
            onclick={() => onstream?.(true)}
            disabled={!online}
          >
            {#if bodyTeleopEnabled}
              <!-- GamepadIcon -->
              <svg viewBox="0 -960 960 960" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0 text-black" aria-hidden="true">
                <path d="M182-200q-51 0-79-35.5T82-322l42-300q9-60 53.5-99T282-760h396q60 0 104.5 39t53.5 99l42 300q7 51-21 86.5T778-200q-21 0-39-7.5T706-228l-90-92H344l-90 92q-15 13-33 20.5T182-200Zm18-60q11 0 20.5-5t16.5-14l104-101h278l104 101q7 9 16.5 14t20.5 5q18 0 31-14t10-35l-41-300q-6-42-37.5-69T660-700H300q-31 0-62.5 27T200-604l-41 300q-3 21 10 35t31 14Zm280-140ZM372-400q17 0 28.5-11.5T412-440q0-17-11.5-28.5T372-480q-17 0-28.5 11.5T332-440q0 17 11.5 28.5T372-400Zm0-120q17 0 28.5-11.5T412-560q0-17-11.5-28.5T372-600q-17 0-28.5 11.5T332-560q0 17 11.5 28.5T372-520Zm-120 60q17 0 28.5-11.5T292-500q0-17-11.5-28.5T252-540q-17 0-28.5 11.5T212-500q0 17 11.5 28.5T252-460Zm240 0q17 0 28.5-11.5T532-500q0-17-11.5-28.5T492-540q-17 0-28.5 11.5T452-500q0 17 11.5 28.5T492-460Zm108 0h60v-60h60v-60h-60v-60h-60v60h-60v60h60v60Z" />
              </svg>
            {:else}
              <!-- LivestreamIcon -->
              <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0 text-black" aria-hidden="true">
                <path d="M18,16L14,12.8V16H6V8H14V11.2L18,8M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.1,4 20,4Z" />
              </svg>
            {/if}
          </button>
        </Tooltip>
      {/if}

      {#if !livestreamEnabled}
        <Tooltip title="Take snapshot" offset={5} panelClass={popover}>
          <button
            type="button"
            bind:this={snapshotButton}
            class="{online ? buttonOnline : buttonOffline} {pill}"
            onclick={takeSnapshot}
            disabled={Boolean(snapshot.fetching || !online)}
          >
            {#if snapshot.fetching}
              <div class="progress inline-block" role="progressbar" style="width: 19px; height: 19px; line-height: 1; color: #57a9e3">
                <svg viewBox="22 22 44 44">
                  <circle class="progressCircle" cx="44" cy="44" r="20.2" fill="none" stroke-width="3.6" />
                </svg>
              </div>
            {:else}
              <!-- CameraIcon -->
              <svg viewBox="0 0 24 22" fill="currentColor" width="1em" height="1em" style="font-size:24px" class="shrink-0 text-black" aria-hidden="true">
                <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
              </svg>
            {/if}
          </button>
        </Tooltip>
      {/if}

      <div class={pill} style="background-color: {batteryBackground}">
        {#if online}
          <!-- CarBatteryIcon -->
          <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:20px" class="mr-1 shrink-0" aria-hidden="true">
            <path d="M4,3V6H1V20H23V6H20V3H14V6H10V3H4M3,8H21V18H3V8M15,10V12H13V14H15V16H17V14H19V12H17V10H15M5,12V14H11V12H5Z" />
          </svg>
          <p class="w-[45px] text-[14px] font-medium" style="line-height: 1.4em">{batteryText}</p>
        {:else}
          <Tooltip title={pingTooltip} offset={5} panelClass={popover}>
            <p class="text-[14px] font-medium" style="line-height: 1.4em">device offline</p>
          </Tooltip>
        {/if}
      </div>

      {#if snapshotError && errorRect}
        <div
          class="fixed {popover}"
          style="left: {errorRect.left + errorRect.width / 2}px; top: {errorRect.bottom + 5}px; transform: translateX(-50%)"
        >
          <p class="text-[14px]">{snapshotError}</p>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if snapshot.result}
  <div class="border-b border-white/10">
    {#if windowWidth >= 640}
      <div class="mx-auto flex max-w-[1050px]" style="padding: {windowWidth > 1440 ? '12px 0' : '0px'}">
        <div class="flex w-1/2 justify-center">
          {@render snapshotImage(snapshot.result.jpegBack, false)}
        </div>
        <div class="flex w-1/2 justify-center">
          {@render snapshotImage(snapshot.result.jpegFront, true)}
        </div>
      </div>
    {:else}
      <div class="snapScroll flex overflow-x-scroll" style="scroll-snap-type: x mandatory; scroll-behavior: smooth">
        <div class="m-0 w-full max-w-[450px] flex-[0_0_auto]" style="scroll-snap-align: start">
          {@render snapshotImage(snapshot.result.jpegBack, false)}
        </div>
        <div class="m-0 w-full max-w-[450px] flex-[0_0_auto]" style="scroll-snap-align: start">
          {@render snapshotImage(snapshot.result.jpegFront, true)}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .snapScroll::-webkit-scrollbar {
    height: 10px;
  }

  .snapScroll::-webkit-scrollbar-thumb {
    background-color: #d1d1d1;
    border-radius: 8px;
  }

  .snapScroll::-webkit-scrollbar-track {
    background-color: #272c2f;
  }

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

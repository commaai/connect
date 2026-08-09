<script>
  import SettingsIcon from '$lib/icons/SettingsIcon.svelte';
  import { deviceIsOnline, deviceNamePretty, emptyDevice } from '$lib/utils';

  let { devices, device, profile, selectedDongleId, onselect, onsettings } = $props();

  /**
   * A shared device is not in the account's own list, so it gets prepended —
   * otherwise viewing someone else's route shows an empty sidebar.
   */
  const listed = $derived.by(() => {
    if (!devices) return null;
    if (devices.some((d) => d.dongle_id === selectedDongleId)) return devices;
    if (device && selectedDongleId === device.dongle_id) {
      return [{ ...device, alias: emptyDevice.alias }, ...devices];
    }
    if (selectedDongleId) {
      return [{ ...emptyDevice, dongle_id: selectedDongleId }, ...devices];
    }
    return devices;
  });

  function canEdit(d) {
    return d.is_owner || profile?.superuser;
  }
</script>

{#if listed}
  <div class="scrollstyle overflow-auto" style="height: calc(100vh - 64px)">
    {#each listed as d (d.dongle_id)}
      <a
        href={`/${d.dongle_id}`}
        class="flex items-center justify-between px-8 py-4 no-underline {d.dongle_id === selectedDongleId ? 'bg-black/25' : ''}"
        onclick={(ev) => {
          if (ev.button === 0 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey) {
            ev.preventDefault();
            onselect(d.dongle_id);
          }
        }}
      >
        <div class="flex items-center">
          <!-- Colors.green400 / Colors.grey400 -->
          <div
            class="h-[6px] w-[6px] rounded-[3px]"
            style="background-color: {deviceIsOnline(d) ? '#178645' : '#4b5559'}"
          >&nbsp;</div>
          <div class="ml-4 flex flex-col justify-center">
            <p class="font-semibold">{deviceNamePretty(d)}</p>
            <p class="text-[0.75rem] text-[#74838e]">{d.dongle_id}</p>
          </div>
        </div>

        {#if canEdit(d)}
          <button
            type="button"
            aria-label="device settings"
            class="flex h-[46px] w-[46px] cursor-pointer items-center justify-center rounded-full text-white/30 transition-colors hover:text-white"
            onclick={(ev) => { ev.stopPropagation(); ev.preventDefault(); onsettings(d.dongle_id); }}
          >
            <SettingsIcon />
          </button>
        {/if}
      </a>
    {/each}

    <div class="hover:bg-black/25">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-between py-4 pr-[44px] pl-[54px] font-semibold text-white"
        onclick={() => onsettings(null, 'add')}
      >
        <span>add new device</span>
        <!-- @material-ui/icons/AddCircleOutline, at Colors.white30 like AddDevice.jsx -->
        <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="font-size:24px; color: rgba(255, 255, 255, 0.3)" aria-hidden="true">
          <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
        </svg>
      </button>
    </div>
  </div>
{/if}

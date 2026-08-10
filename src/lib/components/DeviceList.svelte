<script>
  import AddDevice from './AddDevice.svelte';
  import SettingsIcon from '$lib/icons/SettingsIcon.svelte';
  import { deviceIsOnline, deviceNamePretty, emptyDevice } from '$lib/utils';

  let { devices, device, profile, selectedDongleId, onselect, onsettings, onpaired } = $props();

  // Stays an inline style so it outranks AddDevice's own addButton class, the
  // white pill the no-device screen uses.
  const addButton = 'border-radius: unset; background-color: transparent; color: white;'
    + ' font-weight: 600; justify-content: space-between; padding: 16px 44px 16px 54px';

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
            <p class="text-[0.875rem] font-semibold">{deviceNamePretty(d)}</p>
            <p class="text-[0.75rem] text-[#74838e]" style="line-height: 1.375em">{d.dongle_id}</p>
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
      <AddDevice buttonText="add new device" buttonStyle={addButton} buttonIcon {onpaired} />
    </div>
  </div>
{/if}

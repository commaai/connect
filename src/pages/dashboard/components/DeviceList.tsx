import { For, Suspense, type VoidComponent } from 'solid-js'
import { useLocation } from '@solidjs/router'
import clsx from 'clsx'

import { useDrawerContext } from '~/components/material/Drawer'
import List, { ListItem, ListItemContent } from '~/components/material/List'
import type { Device } from '~/api/types'
import { getDeviceName, deviceIsOnline } from '~/utils/device'
import storage from '~/utils/storage'
import { useAppContext } from '~/AppContext'

type DeviceListProps = {
  class?: string
  devices: Device[] | undefined
}

const DeviceList: VoidComponent<DeviceListProps> = (props) => {
  const location = useLocation()
  const { setOpen } = useDrawerContext()
  const [_, { setCurrentDevice }] = useAppContext()

  const isSelected = (device: Device) => location.pathname.includes(device.dongle_id)
  const onClick = (device: Device) => () => {
    setOpen(false)
    storage.setItem('lastSelectedDongleId', device.dongle_id)
    setCurrentDevice(device)
  }

  return (
    <List variant="nav" class={props.class}>
      <Suspense fallback={<div class="h-14 skeleton-loader rounded-xl" />}>
        <For each={props.devices}>
          {(device) => (
            <ListItem
              variant="nav"
              leading={<div class={clsx('m-2 size-2 shrink-0 rounded-full', deviceIsOnline(device) ? 'bg-green-400' : 'bg-gray-400')} />}
              selected={isSelected(device)}
              onClick={onClick(device)}
              href={`/${device.dongle_id}`}
              activeClass="before:bg-primary"
            >
              <ListItemContent
                headline={<span class="font-medium">{getDeviceName(device)}</span>}
                subhead={<span class="font-mono text-label-md lowercase">{device.dongle_id}</span>}
              />
            </ListItem>
          )}
        </For>
      </Suspense>
    </List>
  )
}

export default DeviceList

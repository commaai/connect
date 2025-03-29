import clsx from 'clsx'
import { createResource, Suspense, createSignal, For, Show } from 'solid-js'
import type { VoidComponent } from 'solid-js'

import { getDevice } from '~/api/devices'
import { ATHENA_URL } from '~/api/config'
import { getAccessToken } from '~/api/auth/client'

import { DrawerToggleButton } from '~/components/material/Drawer'
import Icon from '~/components/material/Icon'
import IconButton from '~/components/material/IconButton'
import TopAppBar from '~/components/material/TopAppBar'
import DeviceLocation from '~/components/DeviceLocation'
import DeviceStatistics from '~/components/DeviceStatistics'
import { getDeviceName } from '~/utils/device'

import RouteList from '../components/RouteList'
import UploadQueue from '~/components/UploadQueue'

type DeviceActivityProps = {
  dongleId: string
}

interface SnapshotResponse {
  result?: {
    jpegFront?: string
    jpegBack?: string
  }
}

const DeviceActivity: VoidComponent<DeviceActivityProps> = (props) => {
  const [device] = createResource(() => props.dongleId, getDevice)
  const [deviceName] = createResource(device, getDeviceName)
  const [queueVisible, setQueueVisible] = createSignal(false)
  const [snapshot, setSnapshot] = createSignal<{
    error: string | null
    fetching: boolean
    images: string[]
  }>({
    error: null,
    fetching: false,
    images: [],
  })

  const takeSnapshot = async () => {
    setSnapshot({ error: null, fetching: true, images: [] })

    try {
      const payload = {
        method: 'takeSnapshot',
        jsonrpc: '2.0',
        id: 0,
      }

      const response = await fetch(`${ATHENA_URL}/${props.dongleId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `JWT ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const resp: SnapshotResponse = (await response.json()) as SnapshotResponse
      const images = []

      if (resp.result?.jpegFront) images.push(resp.result.jpegFront)
      if (resp.result?.jpegBack) images.push(resp.result.jpegBack)

      if (images.length > 0) {
        setSnapshot({ error: null, fetching: false, images })
      } else {
        throw new Error('No images found.')
      }
    } catch (err) {
      let error = (err as Error).message
      if (error.includes('Device not registered')) {
        error = 'Device offline'
      }
      setSnapshot({ error, fetching: false, images: [] })
    }
  }

  const downloadSnapshot = (image: string, index: number) => {
    const link = document.createElement('a')
    link.href = `data:image/jpeg;base64,${image}`
    link.download = `snapshot${index + 1}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const clearImage = (index: number) => {
    const newImages = snapshot().images.filter((_, i) => i !== index)
    setSnapshot({ ...snapshot(), images: newImages })
  }

  const clearError = () => {
    setSnapshot({ ...snapshot(), error: null })
  }

  return (
    <>
      <TopAppBar leading={<DrawerToggleButton />} trailing={<IconButton name="settings" href={`/${props.dongleId}/settings`} />}>
        {deviceName()}
      </TopAppBar>
      <div class="flex flex-col gap-4 px-4 pb-4">
        <div class="h-min overflow-hidden rounded-lg bg-surface-container-low">
          <Show when={deviceName()} fallback={<div class="skeleton-loader size-full" />}>
            <DeviceLocation dongleId={props.dongleId} deviceName={deviceName()!} />
          </Show>
          <div class="flex">
            <div class="flex-auto">
              <Suspense fallback={<div class="skeleton-loader size-full" />}>
                <DeviceStatistics dongleId={props.dongleId} class="p-4" />
              </Suspense>
            </div>
            <div class="flex p-4">
              <IconButton name="camera" onClick={() => void takeSnapshot()} />
            </div>
          </div>
          <Show when={queueVisible()}>
            <UploadQueue dongleId={props.dongleId} />
          </Show>
          <button
            class={clsx(
              'flex w-full cursor-pointer justify-center rounded-b-lg bg-surface-container-lowest p-2',
              queueVisible() && 'border-t-2 border-t-surface-container-low',
            )}
            onClick={() => setQueueVisible(!queueVisible())}
          >
            <Icon class="text-zinc-500" name={queueVisible() ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
          </button>
        </div>
        <div class="flex flex-col gap-2">
          <For each={snapshot().images}>
            {(image, index) => (
              <div class="flex-1 overflow-hidden rounded-lg bg-surface-container-low">
                <div class="relative p-4">
                  <img src={`data:image/jpeg;base64,${image}`} alt={`Device Snapshot ${index() + 1}`} />
                  <div class="absolute right-4 top-4 p-4">
                    <IconButton class="text-white" name="download" onClick={() => downloadSnapshot(image, index())} />
                    <IconButton class="text-white" name="clear" onClick={() => clearImage(index())} />
                  </div>
                </div>
              </div>
            )}
          </For>
          {snapshot().fetching && (
            <div class="flex-1 overflow-hidden rounded-lg bg-surface-container-low">
              <div class="p-4">
                <div>Loading snapshots...</div>
              </div>
            </div>
          )}
          {snapshot().error && (
            <div class="flex-1 overflow-hidden rounded-lg bg-surface-container-low">
              <div class="flex items-center p-4">
                <IconButton class="text-white" name="clear" onClick={clearError} />
                <span>Error: {snapshot().error}</span>
              </div>
            </div>
          )}
        </div>
        <RouteList dongleId={props.dongleId} />
      </div>
    </>
  )
}

export default DeviceActivity

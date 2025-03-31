import { createQuery } from '@tanstack/solid-query'
import { createEffect, For, Match, Show, Switch, VoidComponent } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { athena } from '~/api/athena'
import { devices } from '~/api/devices'
import LinearProgress from './material/LinearProgress'
import Icon, { IconName } from './material/Icon'
import IconButton from './material/IconButton'
import StatisticBar from './StatisticBar'
import Button from '~/components/material/Button'
import { UploadQueueItem } from '~/types'

const UploadQueueRow: VoidComponent<{ cancel: (ids: string[]) => void; item: UploadQueueItem }> = ({ cancel, item }) => {
  return (
    <div class="flex flex-col">
      <div class="flex items-center justify-between flex-wrap mb-1 gap-x-4 min-w-0">
        <div class="flex items-center min-w-0 flex-1">
          <Icon class="text-on-surface-variant flex-shrink-0 mr-2" name={item.isFirehose ? 'local_fire_department' : 'person'} />
          <div class="flex min-w-0 gap-1">
            <span class="text-body-sm font-mono truncate text-on-surface">{[item.route, item.segment, item.filename].join(' ')}</span>
          </div>
        </div>
        <div class="flex items-center gap-0.5 flex-shrink-0 justify-end">
          <Show
            when={!item.id || item.progress !== 0}
            fallback={<IconButton size="20" name="close_small" onClick={() => cancel([item.id])} />}
          >
            <span class="text-body-sm font-mono whitespace-nowrap pr-[0.5rem]">
              {item.id ? `${Math.round(item.progress * 100)}%` : 'Offline'}
            </span>
          </Show>
        </div>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
        <LinearProgress progress={item.progress} color={Math.round(item.progress * 100) === 100 ? 'tertiary' : 'primary'} />
      </div>
    </div>
  )
}

const StatusMessage: VoidComponent<{ iconClass?: string; icon: IconName; message: string }> = (props) => (
  <div class="flex items-center gap-2">
    <Icon name={props.icon} class={props.iconClass} />
    <span class="text-body-lg">{props.message}</span>
  </div>
)

const UploadQueue: VoidComponent<{ dongleId: string }> = (props) => {
  const onlineQueue = createQuery(() => athena.getUploadQueue(props.dongleId))
  const offlineQueue = createQuery(() => devices.getOfflineQueue(props.dongleId))
  const cancel = athena.cancelUpload(props.dongleId)

  const [items, setItems] = createStore<UploadQueueItem[]>([])

  createEffect(() => {
    const online = onlineQueue.isSuccess ? (onlineQueue.data ?? []) : []
    const offline = offlineQueue.isSuccess ? (offlineQueue.data ?? []) : []
    setItems(reconcile([...online, ...offline]))
  })

  const cancelAll = () => {
    const ids = items.filter((item) => item.id).map((item) => item.id)
    if (ids.length === 0) return
    cancel.mutate(ids)
  }

  return (
    <div class="flex flex-col gap-4 bg-surface-container-lowest">
      <div class="flex p-4 justify-between items-center border-b-2 border-b-surface-container-low">
        <StatisticBar statistics={[{ label: 'Queued', value: () => items.length }]} />
        <Button onClick={cancelAll} class="px-2 md:px-3" leading={<Icon name="close" size="20" />} color="primary">
          <span class="flex items-center gap-1 font-mono">Cancel All</span>
        </Button>
      </div>
      <div class="relative h-[calc(4*3rem)] sm:h-[calc(6*3rem)] flex justify-center items-center text-on-surface-variant">
        <Switch
          fallback={
            <div class="absolute inset-0 bottom-4 flex flex-col gap-2 px-4 overflow-y-auto hide-scrollbar">
              <For each={items}>{(item) => <UploadQueueRow cancel={cancel.mutate} item={item} />}</For>
            </div>
          }
        >
          <Match when={!onlineQueue.isFetched}>
            <StatusMessage iconClass="animate-spin" icon="autorenew" message="Waiting for device to connect..." />
          </Match>
          <Match when={onlineQueue.isFetched && !onlineQueue.isSuccess && items.length === 0}>
            <StatusMessage icon="error" message="Device offline" />
          </Match>
          <Match when={onlineQueue.isFetched && onlineQueue.isSuccess && items.length === 0}>
            <StatusMessage icon="check" message="Nothing to upload" />
          </Match>
        </Switch>
      </div>
    </div>
  )
}

export default UploadQueue

import { createEffect, createMemo, For, Match, Show, Switch, VoidComponent } from 'solid-js'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { createStore, reconcile } from 'solid-js/store'
import LinearProgress from './material/LinearProgress'
import Icon, { IconName } from './material/Icon'
import IconButton from './material/IconButton'
import StatisticBar from './StatisticBar'
import Button from '~/components/material/Button'
import { AthenaOfflineQueueResponse, UploadFilesToUrlsRequest, UploadQueueItem } from '~/api/types'
import { cancelUpload, getUploadQueue } from '~/api/file'
import { getAthenaOfflineQueue } from '~/api/devices'

export const queries = {
  prefix: ['upload_queue'],

  online: () => [...queries.prefix, 'online'],
  onlineForDongle: (dongleId: string) => [...queries.online(), dongleId],
  getOnline: (dongleId: string) => queryOptions({ queryKey: queries.onlineForDongle(dongleId), queryFn: () => getUploadQueue(dongleId) }),
  offline: () => [...queries.prefix, 'offline'],
  offlineForDongle: (dongleId: string) => [...queries.offline(), dongleId],
  getOffline: (dongleId: string) =>
    queryOptions({ queryKey: queries.offlineForDongle(dongleId), queryFn: () => getAthenaOfflineQueue(dongleId) }),
  cancelUpload: (dongleId: string) => {
    const queryClient = useQueryClient()
    return useMutation(() => ({
      mutationFn: (ids: string[]) => cancelUpload(dongleId, ids),
      onSettled: () => queryClient.invalidateQueries({ queryKey: queries.onlineForDongle(dongleId) }),
    }))
  },
}

const mapOfflineQueueItems = (data: AthenaOfflineQueueResponse): UploadQueueItem[] =>
  data
    .filter((item) => item.method === 'uploadFilesToUrls')
    .flatMap((item) =>
      (item.params as UploadFilesToUrlsRequest).files_data.map((file) => ({
        ...file,
        path: file.fn,
        created_at: 0,
        current: false,
        id: '',
        progress: 0,
        retry_count: 0,
      })),
    )

interface UploadQueueItemWithAttributes extends UploadQueueItem {
  route: string
  segment: number
  filename: string
  isFirehose: boolean
}

const populateAttributes = (item: UploadQueueItem): UploadQueueItemWithAttributes => {
  const parsed = new URL(item.url)
  const parts = parsed.pathname.split('/')
  if (parsed.hostname === 'upload.commadotai.com') {
    return { ...item, route: parts[2], segment: parseInt(parts[3], 10), filename: parts[4], isFirehose: true }
  }
  return { ...item, route: parts[3], segment: parseInt(parts[4], 10), filename: parts[5], isFirehose: false }
}

const UploadQueueRow: VoidComponent<{ cancel: (ids: string[]) => void; item: UploadQueueItemWithAttributes }> = (props) => {
  const item = () => props.item
  const cancel = () => props.cancel([item().id])
  return (
    <div class="flex flex-col">
      <div class="flex items-center justify-between flex-wrap mb-1 gap-x-4 min-w-0">
        <div class="flex items-center min-w-0 flex-1">
          <Icon class="text-on-surface-variant flex-shrink-0 mr-2" name={item().isFirehose ? 'local_fire_department' : 'person'} />
          <div class="flex min-w-0 gap-1">
            <span class="text-xs font-mono truncate text-on-surface">{`${item().route}/${item().segment} ${item().filename}`}</span>
          </div>
        </div>
        <div class="flex items-center gap-0.5 flex-shrink-0 justify-end">
          <Show when={!item().id || item().progress !== 0} fallback={<IconButton size="20" name="close" onClick={cancel} />}>
            <span class="text-xs font-mono whitespace-nowrap pr-[0.5rem]">
              {item().id ? `${Math.round(item().progress * 100)}%` : 'Offline'}
            </span>
          </Show>
        </div>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
        <LinearProgress progress={item().progress} color={Math.round(item().progress * 100) === 100 ? 'tertiary' : 'primary'} />
      </div>
    </div>
  )
}

const StatusMessage: VoidComponent<{ iconClass?: string; icon: IconName; message: string }> = (props) => (
  <div class="flex items-center gap-2">
    <Icon name={props.icon} class={props.iconClass} />
    <span class="text-md">{props.message}</span>
  </div>
)

const UploadQueue: VoidComponent<{ dongleId: string }> = (props) => {
  const onlineQueue = useQuery(() => queries.getOnline(props.dongleId))
  const offlineQueue = useQuery(() => queries.getOffline(props.dongleId))
  const cancel = createMemo(() => queries.cancelUpload(props.dongleId))

  const [items, setItems] = createStore<UploadQueueItemWithAttributes[]>([])

  createEffect(() => {
    const online = onlineQueue.isSuccess ? (onlineQueue.data?.result ?? []) : []
    const offline = offlineQueue.isSuccess ? mapOfflineQueueItems(offlineQueue.data ?? []) : []
    const sorted = [...online, ...offline].map(populateAttributes).sort((a, b) => b.progress - a.progress)
    setItems(reconcile(sorted))
  })

  const cancelAll = () => {
    const ids = items.filter((item) => item.id).map((item) => item.id)
    if (ids.length === 0) return
    cancel().mutate(ids)
  }

  return (
    <div class="flex flex-col gap-4 bg-surface-container-lowest">
      <div class="flex p-4 justify-between items-center border-b-2 border-b-surface-container-low">
        <StatisticBar statistics={[{ label: 'Queued', value: () => items.length }]} />
        <Show when={onlineQueue.data?.result?.length}>
          <Button onClick={cancelAll} class="px-2 md:px-3" leading={<Icon name="close" size="20" />} color="primary">
            <span class="flex items-center gap-1 font-mono">Cancel All</span>
          </Button>
        </Show>
      </div>
      <div class="relative h-[calc(4*3rem)] sm:h-[calc(6*3rem)] flex justify-center items-center text-on-surface-variant">
        <Switch
          fallback={
            <div class="absolute inset-0 bottom-4 flex flex-col gap-2 px-4 overflow-y-auto">
              <For each={items}>{(item) => <UploadQueueRow cancel={cancel().mutate} item={item} />}</For>
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

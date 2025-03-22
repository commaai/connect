import { For, Show, createMemo, Suspense } from 'solid-js'
import { Transition, TransitionGroup } from 'solid-transition-group'
import type { Component } from 'solid-js'
import Icon from './material/Icon'
import LinearProgress from './material/LinearProgress'
import IconButton from './material/IconButton'
import StatisticBar from './material/StatisticBar'
import { useUploadQueue } from '~/hooks/use-upload-queue'
import { UploadItem } from '~/types'

interface UploadQueueProps {
  dongleId: string
}

const parseUploadPath = (url?: string) => {
  if (!url) {
    return {
      route: '',
      segment: '',
      filename: ''
    }
  }

  const parts = new URL(url).pathname.split('/')
  const route = parts[3]
  const segment = parts[4]
  const filename = parts[5]

  return { route, segment, filename }
}

const getStatusPriority = (status: UploadItem['status']): number => {
  switch (status) {
    case 'pending': return 2
    case 'waiting_for_network': return 2
    default: return 1
  }
}

const QueueItem: Component<{ item: UploadItem }> = (props) => {
  const progress = createMemo(() => {
    if (props.item.status === 'waiting_for_network') return 'Waiting for network'
    if (props.item.status === 'pending') return 'Queued'

    const progress = Math.round(props.item.progress * 100)
    if (progress === 100) return 'Finishing'
    return `${progress}%`
  })

  const pathInfo = createMemo(() => {
    return parseUploadPath(props.item.uploadUrl)
  })

  const progressColor = createMemo(() => {
    switch (props.item.status) {
      case 'uploading': return 'primary'
      case 'pending': return 'secondary'
      case 'completed': return 'tertiary'
      case 'waiting_for_network': return 'secondary'
      default: return 'primary'
    }
  })

  return (
    <div class="flex flex-col h-[2.25rem] gap-1">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <Icon class="text-on-surface-variant">
            {props.item.priority === 0 ? 'face' : 'fire_hydrant'}
          </Icon>
          <Show when={pathInfo().route} fallback={
            <span class="text-body-sm font-mono truncate text-on-surface">{props.item.name}</span>
          }>
            <span class="text-body-sm font-mono whitespace-nowrap text-on-surface-variant">{pathInfo().route}</span>
            <span class="text-body-sm font-mono whitespace-nowrap text-on-surface-variant/75">{pathInfo().segment}</span>
            <span class="text-body-sm font-mono truncate text-on-surface">{pathInfo().filename}</span>
          </Show>
        </div>
        <Show when={props.item.retryCount > 0}>
          <Icon class="text-on-surface-variant" tooltip={`Attempt ${props.item.retryCount + 1}`}>error</Icon>
        </Show>
        <span class="text-body-sm font-mono whitespace-nowrap">{progress()}</span>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
        <LinearProgress progress={props.item.progress} color={progressColor()} />
      </div>
    </div>
  )
}

const QueueStatistics: Component<{ loading: boolean; items: UploadItem[]; class: string }> = (props) => {
  const uploadingCount = createMemo(() => props.loading ? undefined : props.items.filter(i => i.status === 'uploading').length)
  const waitingCount = createMemo(() => props.loading ? undefined : props.items.filter(i => i.status === 'pending').length)
  const queuedCount = createMemo(() => props.loading ? undefined : props.items.length)

  return (
    <StatisticBar
      class={props.class}
      statistics={[
        { label: "Uploading", value: uploadingCount() },
        { label: "Waiting", value: waitingCount() },
        { label: "Queued", value: queuedCount() },
      ]}
    />
  );
}

const QueueList: Component<{ loading: boolean; items: UploadItem[]; error?: boolean; offline?: boolean }> = (props) => {
  const sortedItems = createMemo(() => {
    return [...props.items].sort((a, b) => {
      // First sort by status priority
      const statusDiff = getStatusPriority(a.status) - getStatusPriority(b.status)
      if (statusDiff !== 0) return statusDiff
      
      // Then sort by ID for stability within same status
      return a.id.localeCompare(b.id)
    })
  })

  return (
    <div class="relative h-[calc(8*2.25rem)]">
      <Transition
        enterActiveClass="transition-all duration-300 ease-in-out"
        exitActiveClass="transition-all duration-300 ease-in-out"
        enterClass="opacity-0"
        enterToClass="opacity-100"
        exitClass="opacity-100"
        exitToClass="opacity-0"
        appear={true}
      >
        <Show
          when={!props.loading}
          fallback={
            <div class="flex justify-center items-center h-full animate-spin absolute inset-0">
              <Icon>progress_activity</Icon>
            </div>
          }
        >
          <Show
            when={!props.error}
            fallback={
              <div class="flex items-center justify-center h-full gap-2 text-on-surface-variant absolute inset-0">
                <Icon>signal_disconnected</Icon>
                <span>Error fetching queue</span>
              </div>
            }
          >
            <Show
              when={sortedItems().length !== 0}
              fallback={
                <div class="flex items-center justify-center h-full gap-2 text-on-surface-variant absolute inset-0">
                  <Icon>cloud_done</Icon>
                  <span>No files in queue</span>
                </div>
              }
            >
              <div class="absolute inset-0 overflow-y-auto hide-scrollbar">
                <TransitionGroup
                  name="list"
                  enterActiveClass="transition-all duration-300 ease-in-out"
                  exitActiveClass="transition-all duration-300 ease-in-out"
                  enterClass="opacity-0 transform translate-x-4"
                  enterToClass="opacity-100 transform translate-x-0"
                  exitClass="opacity-100 transform translate-x-0" 
                  exitToClass="opacity-0 transform -translate-x-4"
                  moveClass="transition-transform duration-300"
                >
                  <For each={sortedItems()}>
                    {(item) => (
                      <div class="py-1" data-id={item.id}>
                        <QueueItem item={item} />
                      </div>
                    )}
                  </For>
                </TransitionGroup>
              </div>
            </Show>
          </Show>
        </Show>
      </Transition>
    </div>
  );
}

const UploadQueue: Component<UploadQueueProps> = (props) => {
  const { items, loading, error, offline, clearQueue } = useUploadQueue(props.dongleId)

  return (
    <div class="flex flex-col border-2 border-t-0 border-surface-container-high bg-surface-container-lowest">
      <div class="flex">
        <div class="flex-auto">
          <Suspense fallback={<div class="skeleton-loader w-full" />}>
            <QueueStatistics loading={loading()} items={items} class="p-4" />
          </Suspense>
        </div>
        <div class="flex p-4">
          <IconButton onClick={() => void clearQueue()}>delete</IconButton>
        </div>
      </div>
      <div class="rounded-md border-2 border-surface-container-high mx-4 mb-4 p-4">
        <QueueList
          loading={loading()}
          items={items}
          error={error()}
          offline={offline()}
        />
      </div>
    </div>
  );
}

export default UploadQueue
import { createSignal, createResource, type Resource, type Setter, Show, type VoidComponent } from 'solid-js'
import clsx from 'clsx'

import { setRoutePublic, setRoutePreserved, getRoute, getPreservedRoutes } from '~/api/route'
import Icon from '~/components/material/Icon'

const ToggleButton: VoidComponent<{
  label: string
  active: boolean | undefined
  onToggle: () => void
}> = (props) => (
  <button
    class="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-surface-container-low"
    onClick={props.onToggle}
  >
    <span class="text-body-lg">{props.label}</span>

    {/* Toggle Switch */}
    <div
      class={`relative h-7 w-12 rounded-full border-2 transition-colors ${
        props.active ? 'border-green-300 bg-green-300' : 'border-surface-container-high'
      }`}
    >
      <div
        class={`absolute top-1 size-4 rounded-full bg-surface-container-high transition-transform duration-500 ease-in-out ${
          props.active ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </div>
  </button>
)

interface RouteActionsProps {
  class?: string
  routeName: string
}

const RouteActions: VoidComponent<RouteActionsProps> = (props) => {
  const [routeResource] = createResource(() => props.routeName, getRoute)
  const [preservedRoutesResource] = createResource(() => props.routeName.split('|')[0], getPreservedRoutes)

  const [isPublic, { mutate: mutatePublic }] = createResource(routeResource, (route) => route.is_public)
  const [isPreserved, { mutate: mutatePreserved }] = createResource(() => {
    return { route: routeResource(), preservedRoutes: preservedRoutesResource() }
  }, ({ route, preservedRoutes }) => {
    if (!route || preservedRoutes === undefined) return undefined
    return preservedRoutes.some((it) => it.fullname === route.fullname)
  })

  const [error, setError] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal(false)

  const onToggle = (
    resource: Resource<boolean | undefined>,
    mutate: Setter<boolean | undefined>,
    updateFn: (value: boolean) => Promise<unknown>,
  ) => async () => {
    if (resource.latest === undefined) return
    const oldValue = resource.latest, newValue = !oldValue
    mutate(newValue)  // optimistic update
    try {
      await updateFn(newValue)
    } catch (err) {
      console.error('Failed to upload toggle', err)
      setError('Failed to update toggle')
      mutate(oldValue)  // revert failed update
    }
  }

  const currentRouteId = () => props.routeName.replace('|', '/')

  const copyCurrentRouteId = async () => {
    if (!props.routeName || !navigator.clipboard) return

    try {
      await navigator.clipboard.writeText(currentRouteId())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy route ID: ', err)
    }
  }

  return (
    <div class={clsx('flex flex-col gap-4', props.class)}>
      <div class="text-body-md text-zinc-500">
        <h3 class="text-body-sm text-on-surface-variant mb-2">Route ID</h3>
        <button
          onClick={() => void copyCurrentRouteId()}
          class="flex w-full cursor-pointer items-center justify-between rounded-lg border-2 border-surface-container-high bg-surface-container-lowest p-4 hover:bg-surface-container-low"
        >
          <div class="lg:text-body-lg font-mono">
            <span class="break-keep inline-block">
              {currentRouteId().split('/')[0] || ''}/
            </span>
            <span class="break-keep inline-block">
              {currentRouteId().split('/')[1] || ''}
            </span>
          </div>
          <Icon size="24" class={clsx('ml-2', copied() && 'text-green-300')}>{copied() ? 'check' : 'file_copy'}</Icon>
        </button>
      </div>

      <Show when={error()}>
        <div class="flex items-center rounded-md bg-red-900/30 p-4 text-red-500">
          <Icon class="mr-4 text-yellow-300">warning</Icon>
          <span class="font-mono">{error()}</span>
        </div>
      </Show>

      <div class="divide-y-2 divide-surface-container-high overflow-hidden rounded-md border-2 border-surface-container-high">
        <ToggleButton
          label="Preserve Route"
          active={isPreserved.latest}
          onToggle={onToggle(isPreserved, mutatePreserved, (value) => setRoutePreserved(props.routeName, value))}
        />
        <ToggleButton
          label="Public Access"
          active={isPublic.latest}
          onToggle={onToggle(isPublic, mutatePublic, (value) => setRoutePublic(props.routeName, value))}
        />
      </div>
    </div>
  )
}

export default RouteActions

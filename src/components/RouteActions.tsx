import { createSignal, Show, type VoidComponent, createEffect, createResource } from 'solid-js'
import clsx from 'clsx'

import { setRoutePublic, setRoutePreserved, getPreservedRoutes, getRoute } from '~/api/route'
import Icon from '~/components/material/Icon'

interface RouteActionsProps {
  routeName: string
}

const ToggleButton: VoidComponent<{ label: string, active: boolean | undefined, onToggle: () => void }> = (props) => (
  <button
    class="flex w-full items-center justify-between p-2 transition-colors hover:bg-surface-container-low"
    onClick={() => props.onToggle()}
  >
    <span class="text-body-md text-on-surface-variant">{props.label}</span>

    {/* Toggle Switch */}
    <div
      class={`relative h-6 w-10 rounded-full border-2 transition-colors ${
        props.active ? 'border-green-300 bg-green-300' : 'border-surface-container-highest'
      }`}
    >
      <div
        class={`absolute top-1 size-3 rounded-full bg-surface-container-highest transition-transform duration-500 ease-in-out ${
          props.active ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </div>
  </button>
)

const RouteActions: VoidComponent<RouteActionsProps> = (props) => {
  const [routeResource] = createResource(() => props.routeName, getRoute)
  const [preservedRoutesResource] = createResource(
    () => props.routeName.split('|')[0],
    getPreservedRoutes,
  )

  const [isPublic, setIsPublic] = createSignal<boolean | undefined>(undefined)
  const [isPreserved, setIsPreserved] = createSignal<boolean | undefined>(undefined)

  createEffect(() => {
    const route = routeResource()
    const preservedRoutes = preservedRoutesResource()
    if (!route) return
    setIsPublic(route.is_public)
    if (route.is_preserved) {
      setIsPreserved(true)
    } else if (preservedRoutes) {
      setIsPreserved(preservedRoutes.some(r => r.fullname === route.fullname))
    } else {
      setIsPreserved(undefined)
    }
  })

  const [error, setError] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal(false)

  const toggleRoute = async (property: 'public' | 'preserved') => {
    setError(null)
    if (property === 'public') {
      const currentValue = isPublic()
      if (currentValue === undefined) return
      try {
        const newValue = !currentValue
        await setRoutePublic(props.routeName, newValue)
        setIsPublic(newValue)
      } catch (err) {
        console.error('Failed to update public toggle', err)
        setError('Failed to update toggle')
      }
    } else {
      const currentValue = isPreserved()
      if (currentValue === undefined) return

      try {
        const newValue = !currentValue
        await setRoutePreserved(props.routeName, newValue)
        setIsPreserved(newValue)
      } catch (err) {
        console.error('Failed to update preserved toggle', err)
        setError('Failed to update toggle')
      }
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
    <div class="flex flex-col rounded-b-md gap-4 mx-5 mb-4">
      <div class="font-mono text-body-sm text-zinc-500">
        <h3 class="mb-2 text-on-surface-variant">Route ID:</h3>
        <button
          onClick={() => void copyCurrentRouteId()}
          class="flex w-full cursor-pointer items-center justify-between rounded-lg border-2 border-surface-container-high bg-surface-container-lowest p-3 hover:bg-surface-container-low"
        >
          <div class="lg:text-body-md">
            <span class="break-keep inline-block">
              {currentRouteId().split('/')[0] || ''}/
            </span>
            <span class="break-keep inline-block">
              {currentRouteId().split('/')[1] || ''}
            </span>
          </div>
          <Icon size="20" class={clsx('px-2', copied() && 'text-green-300')}>{copied() ? 'check' : 'file_copy'}</Icon>
        </button>
      </div>

      <div class="flex flex-col gap-2">
        <ToggleButton
          label="Preserve Route"
          active={isPreserved()}
          onToggle={() => void toggleRoute('preserved')}
        />
        <ToggleButton
          label="Public Access"
          active={isPublic()}
          onToggle={() => void toggleRoute('public')}
        />
      </div>

      <Show when={error()}>
        <div class="flex gap-2 rounded-sm bg-surface-container-high p-2 text-body-md text-on-surface">
          <Icon class="text-error" size="20">error</Icon>
          {error()}
        </div>
      </Show>
    </div>
  )
}

export default RouteActions

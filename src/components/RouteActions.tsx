import { createSignal, Show, type VoidComponent, createEffect } from 'solid-js'
import Button from '~/components/material/Button'
import Icon from '~/components/material/Icon'
import { setRoutePublic, setRoutePreserved } from '~/api/route'
import { USERADMIN_URL } from '~/api/config'

interface RouteActionsProps {
  routeName: string
  initialPublic: boolean | undefined
  initialPreserved: boolean | undefined
  isPublic: () => boolean | undefined
  isPreserved: () => boolean | undefined
}

const ToggleButton: VoidComponent<{
  label: string
  active: () => boolean | undefined
  onToggle: () => void
}> = (props) => (
  <button
    class="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-surface-container-low"
    onClick={() => props.onToggle()}
  >
    <span class="text-body-lg">{props.label}</span>

    {/* Toggle Switch */}
    <div
      class={`relative h-9 w-16 rounded-full border-4 transition-colors ${
        props.active() ? 'border-green-300 bg-green-300' : 'border-surface-container-high'
      }`}
    >
      <div
        class={`absolute top-1 size-5 rounded-full bg-surface-container-high transition-transform duration-500 ease-in-out ${
          props.active() ? 'top-1 translate-x-8' : 'translate-x-1'
        }`}
      />
    </div>
  </button>
)

const ActionButton: VoidComponent<{
  onClick: () => void
  icon: string
  label: string
  iconClass?: string
}> = (props) => (
  <Button
    class="flex-1 rounded-sm border-2 border-surface-container-high bg-surface-container-lowest py-8 text-on-surface-variant hover:bg-surface-container-low"
    onClick={props.onClick}
    leading={<Icon size="34" class={props.iconClass}>{props.icon}</Icon>}
    noPadding
  >
    <span class="whitespace-pre-line">{props.label}</span>
  </Button>
)

const RouteActions: VoidComponent<RouteActionsProps> = (props) => {
  const [isPreservedLocal, setIsPreservedLocal] = createSignal(props.initialPreserved)
  const [isPublicLocal, setIsPublicLocal] = createSignal(props.initialPublic)
  const [error, setError] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal(false)

  createEffect(() => {
    const [publicValue, preservedValue] = [props.isPublic(), props.isPreserved()]
    if (publicValue !== undefined) setIsPublicLocal(publicValue)
    if (preservedValue !== undefined) setIsPreservedLocal(preservedValue)
  })

  const toggleRoute = async (type: 'public' | 'preserved') => {
    setError(null)
    const [currentValue, setter, apiCall] = type === 'public'
      ? [isPublicLocal(), setIsPublicLocal, setRoutePublic]
      : [isPreservedLocal(), setIsPreservedLocal, setRoutePreserved]

    if (currentValue === undefined) return

    try {
      const newValue = !currentValue
      await apiCall(props.routeName, newValue)
      setter(newValue)
    } catch (err) {
      console.error(err)
      setError('Failed to update toggle')
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

  const openInUseradmin = () => {
    const url = `${USERADMIN_URL}?${new URLSearchParams({ onebox: props.routeName }).toString()}`
    window.open(url, '_blank')?.focus()
  }

  return (
    <div class="flex flex-col border-2 border-t-0 border-surface-container-high bg-surface-container-lowest p-4">
      <div
        class="mb-4 ml-2 text-body-sm text-zinc-500"
        style={{'font-family':"'JetBrains Mono', monospace"}}
      >
        <div>Route ID:</div>
        <div class="mt-1 break-all md:text-body-md">{currentRouteId()}</div>
      </div>

      <Show when={error()}>
        <div class="mb-4 flex items-center rounded-md bg-red-900/30 p-4 text-red-500">
          <Icon class="mr-4 text-yellow-300">warning</Icon>
          <span style={{'font-family': "'JetBrains Mono', monospace"}}>{error()}</span>
        </div>
      </Show>

      <div class="divide-y-2 divide-surface-container-high overflow-hidden rounded-md border-2 border-surface-container-high">
        <ToggleButton
          label="Preserve Route"
          active={() => isPreservedLocal()}
          onToggle={() => void toggleRoute('preserved')}
        />
        <ToggleButton
          label="Public Access"
          active={() => isPublicLocal()}
          onToggle={() => void toggleRoute('public')}
        />
      </div>

      <div class="mt-4 flex gap-[.75rem]">
        <ActionButton
          onClick={() => void copyCurrentRouteId()}
          icon={copied() ? 'check' : 'file_copy'}
          label={copied() ? 'Copied!' : 'Copy \nRoute ID'}
          iconClass={copied() ? 'text-green-300' : ''}
        />
        <ActionButton
          onClick={openInUseradmin}
          icon="open_in_new"
          label={'View in\nuseradmin'}
        />
      </div>
    </div>
  )
}

export default RouteActions

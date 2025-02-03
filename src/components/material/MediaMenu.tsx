import { createSignal, For, VoidComponent } from 'solid-js'
import clsx from 'clsx'

type MediaMenuProps = {
  class?: string
}

const MENU_ITEMS = [
  {
    label: 'Driver camera',
    onClick: () => new Promise(resolve => setTimeout(resolve, 2000)),
  },
  {
    label: 'Rear camera',
    onClick: () => { /* handle click */ },
  },
  {
    label: 'Wide road camera',
    onClick: () => { /* handle click */ },
  },
  {
    label: 'Log data',
    onClick: () => { /* handle click */ },
  },
  {
    label: 'All logs',
    onClick: () => { /* handle click */ },
  },
  {
    label: 'All files',
    onClick: () => { /* handle click */ },
  },
] as const

export const MediaMenu: VoidComponent<MediaMenuProps> = (props) => {
  const [menuOpen, setMenuOpen] = createSignal(false)
  const [loadingItem, setLoadingItem] = createSignal<string | null>(null)

  return (
    <div class={clsx('relative', props.class)}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setMenuOpen(!menuOpen())
        }}
        class="rounded-full p-2 hover:bg-surface-container-highest"
        aria-label="Menu"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
      
      {menuOpen() && (
        <div 
          class="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg bg-surface-container-highest shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="py-1">
            <For each={MENU_ITEMS}>{(item) => (
              <button
                class="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-surface-container-low"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  void (async () => {
                    setLoadingItem(item.label)
                    try {
                      await item.onClick()
                    } finally {
                      setLoadingItem(null)
                      setMenuOpen(false)
                    }
                  })()
                }}
              >
                <span>{item.label}</span>
                {loadingItem() === item.label && (
                  <svg class="size-4 animate-spin text-primary" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
              </button>
            )}</For>
          </div>
        </div>
      )}
    </div>
  )
}

export default MediaMenu 

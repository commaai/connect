import { type ParentComponent, createEffect, onMount, onCleanup } from 'solid-js'
import clsx from 'clsx'

type DialogProps = {
  class?: string
  open: boolean
  onClose?: () => void
}

const Dialog: ParentComponent<DialogProps> = (props) => {
  let dialogRef: HTMLDialogElement | undefined

  createEffect(() => {
    if (!dialogRef) return
    if (props.open) {
      dialogRef.showModal()
    } else if (dialogRef.open) {
      dialogRef.close()
    }
  })

  const handleDialogClose = () => {
    if (props.open) props.onClose?.()
  }

  onMount(() => {
    if (!dialogRef) return
    dialogRef.addEventListener('close', handleDialogClose)
    onCleanup(() => dialogRef?.removeEventListener('close', handleDialogClose))
  })

  return (
    <dialog
      ref={dialogRef}
      class="fixed inset-0 max-w-[unset] z-50 flex flex-col items-center justify-center bg-transparent backdrop:bg-scrim/[.32] size-full m-0 max-h-[unset]"
      onClick={() => dialogRef?.close()}
    >
      <div
        class={clsx(
          'flex w-full flex-col justify-center gap-4 bg-surface-container text-on-surface p-6',
          'sm:max-w-lg sm:rounded-lg sm:shadow-lg',
          props.class,
        )}
        onClick={(ev) => ev.stopPropagation()}
      >
        {props.children}
      </div>
    </dialog>
  )
}

export default Dialog

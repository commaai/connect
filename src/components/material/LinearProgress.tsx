import type { VoidComponent } from 'solid-js'
import clsx from 'clsx'

type LinearProgressProps = {
  class?: string
  progress?: number
  color?: 'primary' | 'secondary' | 'tertiary' | 'error'
}

const LinearProgress: VoidComponent<LinearProgressProps> = (props) => {
  const color = () => props.color || 'primary'
  const containerColourClass = () =>
    ({
      primary: 'before:bg-primary',
      secondary: 'before:bg-secondary',
      tertiary: 'before:bg-tertiary',
      error: 'before:bg-error',
    }[color()])
  const barColourClass = () =>
    ({
      primary: 'bg-primary',
      secondary: 'bg-secondary',
      tertiary: 'bg-tertiary',
      error: 'bg-error',
    }[color()])

  return (
    <div
      class={clsx(
        'relative z-0 block h-1 overflow-hidden rounded-none bg-transparent before:absolute before:inset-0 before:opacity-30',
        containerColourClass(),
        props.class,
      )}
    >
      {props.progress === undefined ? (
        <>
          <div
            class={clsx(
              'absolute inset-y-0 left-0 h-1 w-auto origin-left transition-indeterminate',
              'animate-indeterminate1',
              barColourClass(),
            )}
          />
          <div
            class={clsx(
              'absolute inset-y-0 left-0 h-1 w-auto origin-left transition-indeterminate',
              'animate-indeterminate2',
              barColourClass(),
            )}
          />
        </>
      ) : (
        <div
          class={clsx(
            'absolute inset-y-0 left-0 h-1 transition-[background-color,width] duration-200 ease-linear',
            barColourClass(),
          )}
          style={{
            width: `${props.progress * 100}%`,
          }}
        />
      )}
    </div>
  )
}

export default LinearProgress

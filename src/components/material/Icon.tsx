import { Component } from 'solid-js'
import clsx from 'clsx'

export type IconProps = {
  class?: string
  children: string
  filled?: boolean
  size?: '20' | '24' | '40' | '48'
  tooltip?: string
}

const Icon: Component<IconProps> = (props) => {
  // size-20, 24 etc. defined in root.css
  const size = () => `size-${props.size || '24'}`
  return (
    <span
      title={props.tooltip}
      class={clsx(
        'material-symbols-outlined flex',
        props.filled ? 'icon-filled' : 'icon-outline',
        size(),
        props.class,
      )}
    >
      {props.children}
    </span>
  )
}

export default Icon

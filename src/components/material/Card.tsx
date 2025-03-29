import { type ParentComponent, Show } from 'solid-js'
import clsx from 'clsx'

import ButtonBase from '~/components/material/ButtonBase'

type CardProps = {
  class?: string
  onClick?: () => void
  href?: string
  activeClass?: string
}

const Card: ParentComponent<CardProps> = (props) => {
  const cardStyle = 'flex max-w-md flex-col rounded-lg bg-surface-container text-on-surface before:bg-on-surface'
  return (
    <Show when={props.onClick || props.href} fallback={<div class={clsx(cardStyle, props.class)}>{props.children}</div>}>
      <ButtonBase
        class={clsx(cardStyle, (props.href || props.onClick) && 'state-layer', props.class)}
        onClick={props.onClick}
        href={props.href}
        activeClass={clsx('before:opacity-[.12]', props.activeClass)}
      >
        {props.children}
      </ButtonBase>
    </Show>
  )
}

export default Card

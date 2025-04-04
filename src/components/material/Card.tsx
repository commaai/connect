import { type JSXElement, type ParentComponent, Show, type VoidComponent } from 'solid-js'
import clsx from 'clsx'

import ButtonBase from '~/components/material/ButtonBase'

type CardHeaderProps = {
  class?: string
  headline?: JSXElement
  subhead?: JSXElement
  leading?: JSXElement
  trailing?: JSXElement
}

export const CardHeader: VoidComponent<CardHeaderProps> = (props) => {
  return (
    <div class={clsx('flex h-[72px] items-center gap-4 px-4 py-3', props.class)}>
      {props.leading}
      <div class="flex h-12 grow flex-col justify-between">
        {props.headline && <span class="text-title-md">{props.headline}</span>}
        {props.subhead && <span class="text-body-md">{props.subhead}</span>}
      </div>
      {props.trailing}
    </div>
  )
}

type CardContentProps = {
  class?: string
}

export const CardContent: ParentComponent<CardContentProps> = (props) => {
  return <div class={clsx('flex flex-col gap-4 p-4', props.class)}>{props.children}</div>
}

type CardTextContentProps = {
  class?: string
}

export const CardTextContent: ParentComponent<CardTextContentProps> = (props) => {
  return (
    <div class={clsx('flex', props.class)}>
      <span class="text-body-md text-on-surface-variant">{props.children}</span>
    </div>
  )
}

type CardActionsProps = {
  class?: string
}

export const CardActions: ParentComponent<CardActionsProps> = (props) => {
  return <div class={clsx('flex justify-end gap-4', props.class)}>{props.children}</div>
}

type CardProps = {
  class?: string
  onClick?: () => void
  onHover?: () => void
  href?: string
  activeClass?: string
}

const Card: ParentComponent<CardProps> = (props) => {
  const cardStyle = 'flex max-w-md flex-col rounded-lg bg-surface-container text-on-surface before:bg-on-surface'
  return (
    <Show when={props.onClick || props.onHover || props.href} fallback={<div class={clsx(cardStyle, props.class)}>{props.children}</div>}>
      <ButtonBase
        class={clsx(cardStyle, (props.href || props.onClick) && 'state-layer', props.class)}
        onClick={props.onClick}
        onHover={props.onHover}
        href={props.href}
        activeClass={clsx('before:opacity-[.12]', props.activeClass)}
      >
        {props.children}
      </ButtonBase>
    </Show>
  )
}

export default Card

import type { ParentComponent, JSXElement, VoidComponent } from 'solid-js'
import clsx from 'clsx'

import ButtonBase from '~/components/material/ButtonBase'

type CardHeaderProps = {
  class?: string
  headline?: string
  subhead?: string
  leading?: JSXElement
  trailing?: JSXElement
}

export const CardHeader: VoidComponent<CardHeaderProps> = (props) => {
  return (
    <div
      class={clsx('flex items-center gap-4 px-4 pb-5 pt-3', props.class)}
    >
      {props.leading}
      <div class="flex h-12 grow flex-col justify-between">
        {props.headline && <span class="text-title-sm">{props.headline}</span>}
        {props.subhead && <span class="text-body-lg">{props.subhead}</span>}
      </div>
      {props.trailing}
    </div>
  )
}

type CardHeadlineProps = {
  class?: string
  title?: string
  subhead?: string
}

export const CardHeadline: VoidComponent<CardHeadlineProps> = (props) => {
  return (
    <div class={clsx('flex h-12 grow flex-col justify-between', props.class)}>
      {props.title && <span class="text-body-lg">{props.title}</span>}
      {props.subhead && <span class="text-body-md text-on-surface-variant">{props.subhead}</span>}
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

export const CardTextContent: ParentComponent<CardTextContentProps> = (
  props,
) => {
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
  href?: string
}

const Card: ParentComponent<CardProps> = (props) => {
  return (
    <ButtonBase
      class={clsx(
        'state-layer elevation-1 flex max-w-md flex-col rounded-lg bg-surface-container-low text-on-surface before:bg-on-surface',
        props.class,
      )}
      onClick={props.onClick}
      href={props.href}
    >
      {props.children}
    </ButtonBase>
  )
}

export default Card

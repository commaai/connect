import type { JSXElement, ParentComponent, ValidComponent } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import clsx from 'clsx'

type TopAppBarProps = {
  class?: string
  leading?: JSXElement
  trailing?: JSXElement
  component?: ValidComponent
}

const TopAppBar: ParentComponent<TopAppBarProps> = (props) => {
  return (
    <header class={clsx('inset-x-0 top-0 flex h-16 items-center gap-4 px-4 py-5 text-on-surface', props.class)}>
      {props.leading}
      <Dynamic class="grow truncate text-title-lg" component={props.component || 'header'}>
        {props.children}
      </Dynamic>
      {props.trailing}
    </header>
  )
}

export default TopAppBar

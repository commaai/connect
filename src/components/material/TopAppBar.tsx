import type { JSXElement, ParentComponent, ValidComponent } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import clsx from 'clsx'

type TopAppBarProps = {
  class?: string
  component?: ValidComponent
  leading?: JSXElement
  trailing?: JSXElement
}

const TopAppBar: ParentComponent<TopAppBarProps> = (props) => {
  return (
    <header class={clsx('flex gap-4 items-center', props.class)}>
      {props.leading}
      <Dynamic class="grow truncate text-title-lg" component={props.component || 'h1'}>
        {props.children}
      </Dynamic>
      {props.trailing}
    </header>
  )
}

export default TopAppBar

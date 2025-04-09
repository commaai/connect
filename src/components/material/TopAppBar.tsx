import type { JSXElement, ParentComponent } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import clsx from 'clsx'

type TopAppBarProps = {
  class?: string
  leading?: JSXElement
  trailing?: JSXElement
  component?: string
}

const TopAppBar: ParentComponent<TopAppBarProps> = (props) => {
  return (
    <div class={clsx('flex h-8 m-4 items-center gap-4 text-on-surface', props.class)}>
      {props.leading}
      <Dynamic class="grow truncate text-title-lg" component={props.component || 'h2'}>
        {props.children}
      </Dynamic>
      {props.trailing}
    </div>
  )
}

export default TopAppBar

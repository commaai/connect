import clsx from "clsx"
import { For, Show, VoidComponent } from "solid-js"

interface StatisticWithActionBarProps {
  class?: string
  statistics: {
    label: string
    value?: unknown
  }[]
}

const StatisticBar: VoidComponent<StatisticWithActionBarProps> = (props) => {
  return (
    <div class="flex flex-col">
      <div
        class={clsx("flex h-auto w-full justify-between gap-4", props.class)}
      >
        <For each={props.statistics}>
          {(statistic) => (
            <div class="flex basis-0 grow flex-col justify-between">
              <span class="text-body-sm text-on-surface-variant">
                {statistic.label}
              </span>
              <Show
                when={statistic.value !== undefined}
                fallback={
                  <div class="h-5 w-auto skeleton-loader bg-surface-container-low rounded-sm"></div>
                }
              >
                <span class="font-mono text-label-lg uppercase">
                  {statistic.value?.toString()}
                </span>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export default StatisticBar

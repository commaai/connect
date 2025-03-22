import { createResource } from 'solid-js'
import type { VoidComponent } from 'solid-js'

import { getDeviceStats } from '~/api/devices'
import { formatDistance, formatDuration } from '~/utils/format'
import StatisticBar from './material/StatisticBar'

type DeviceStatisticsProps = {
  class?: string
  dongleId: string
}

const DeviceStatistics: VoidComponent<DeviceStatisticsProps> = (props) => {
  const [statistics] = createResource(() => props.dongleId, getDeviceStats)
  const allTime = () => statistics()?.all

  return (
    <StatisticBar
      class={props.class}
      statistics={[
        { label: "Distance", value: formatDistance(allTime()?.distance) },
        { label: "Duration", value: formatDuration(allTime()?.minutes) },
        { label: "Routes", value: allTime()?.routes },
      ]}
    />
  );
}

export default DeviceStatistics

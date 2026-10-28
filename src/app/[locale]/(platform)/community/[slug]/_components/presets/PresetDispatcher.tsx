import type { LayoutPreset } from '@/lib/db/schema/communities/themes'

import type { PresetProps } from './types'

import CreatorPreset from './CreatorPreset'
import EventPreset from './EventPreset'
import GroupPreset from './GroupPreset'
import NewsPreset from './NewsPreset'
import SportsPreset from './SportsPreset'

export type HomeLayout = 'news' | 'sports' | 'creator' | 'group' | 'event'

/** Legacy preset values map onto the five layouts. */
function homeLayoutFor(preset: LayoutPreset): HomeLayout {
  switch (preset) {
    case 'sports':
      return 'sports'
    case 'creator':
      return 'creator'
    case 'forum':
    case 'group':
      return 'group'
    case 'event':
      return 'event'
    case 'classic':
    case 'newsroom':
    case 'news':
      return 'news'
  }
}

export function CommunityPresetSwitch({ preset, ...rest }: { preset: LayoutPreset } & PresetProps) {
  switch (homeLayoutFor(preset)) {
    case 'sports':
      return <SportsPreset {...rest} />
    case 'creator':
      return <CreatorPreset {...rest} />
    case 'group':
      return <GroupPreset {...rest} />
    case 'event':
      return <EventPreset {...rest} />
    case 'news':
      return <NewsPreset {...rest} />
  }
}

import type { PresetProps } from './types'
import type { LayoutPreset } from '@/lib/db/schema/communities/themes'
import ClassicPreset from './ClassicPreset'
import ForumPreset from './ForumPreset'
import NewsroomPreset from './NewsroomPreset'
import SportsPreset from './SportsPreset'

/** Single switch from preset name to component. Keeps the page tidy. */
export function CommunityPresetSwitch({ preset, ...rest }: { preset: LayoutPreset } & PresetProps) {
  if (preset === 'newsroom') {
    return <NewsroomPreset {...rest} />
  }
  if (preset === 'sports') {
    return <SportsPreset {...rest} />
  }
  if (preset === 'forum') {
    return <ForumPreset {...rest} />
  }
  return <ClassicPreset {...rest} />
}

import type { PresetProps } from './types'
import type { LayoutPreset } from '@/lib/db/schema/communities/themes'
import ClassicPreset from './ClassicPreset'

// Newsroom / Sports / Forum are temporarily disabled while we polish Classic.
// Any community whose layout_preset is set to one of those values falls back
// to Classic at render time; the value stays in the DB and can be re-enabled
// by re-exporting those presets and restoring the switch arms below.
export function CommunityPresetSwitch({ preset: _preset, ...rest }: { preset: LayoutPreset } & PresetProps) {
  return <ClassicPreset {...rest} />
}

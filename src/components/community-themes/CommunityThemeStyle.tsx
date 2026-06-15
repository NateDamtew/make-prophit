import type { CommunityThemeState } from '@/lib/db/queries/community-theme'
import { isSafeAccent } from '@/lib/db/queries/community-theme'

interface CommunityThemeStyleProps {
  /** Scope theme variables to this element (an id on the page wrapper). */
  scopeId: string
  theme: CommunityThemeState
}

const FONT_STACKS: Record<CommunityThemeState['font_hint'], string> = {
  sans: 'inherit',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Bitstream Charter", "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
}

/**
 * Server-rendered <style> tag that injects per-community CSS variables and
 * the headline font stack. Validates inputs so an admin can never inject
 * arbitrary CSS through this surface. Scoped via id selector to a single
 * page wrapper so the platform theme is unaffected anywhere else.
 */
export function CommunityThemeStyle({ scopeId, theme }: CommunityThemeStyleProps) {
  const decls: string[] = []
  if (theme.accent && isSafeAccent(theme.accent)) {
    decls.push(`--community-accent: ${theme.accent};`)
    // Backfill the platform's primary token *inside the scoped wrapper* so any
    // child component using bg-primary / text-primary picks up the accent
    // without us having to thread it through props.
    decls.push(`--primary: ${theme.accent};`)
  }
  decls.push(`--community-font-headline: ${FONT_STACKS[theme.font_hint]};`)

  // surface_mode: 'auto' inherits the platform mode; 'light' / 'dark' force.
  let surfaceAttr = ''
  if (theme.surface_mode === 'light') {
    surfaceAttr = '[data-theme-mode=\'light\']'
  }
  else if (theme.surface_mode === 'dark') {
    surfaceAttr = '[data-theme-mode=\'dark\']'
  }

  const css = `#${scopeId} { ${decls.join(' ')} }
#${scopeId} h1, #${scopeId} h2, #${scopeId} h3 { font-family: var(--community-font-headline, inherit); }
${surfaceAttr ? `/* surface_mode hint (informational; platform owns the actual mode) */` : ''}`

  return <style id={`theme-${scopeId}`}>{css}</style>
}

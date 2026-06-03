// Floating mobile nav: ~4rem bar height + 0.5rem gap above + 0.5rem gap below + safe area.
// Content uses this as a bottom spacer so it never sits behind the floating bar.
export const MOBILE_BOTTOM_NAV_OFFSET = 'calc(env(safe-area-inset-bottom) + 5rem)'

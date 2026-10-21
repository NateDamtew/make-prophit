export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-white/20">
      {/* The marketing landing never shows the app announcement bar (rendered by the locale layout). */}
      <style href="landing-hide-global-announcement" precedence="default">
        {'[data-global-announcement]{display:none}'}
      </style>
      <main>{children}</main>
    </div>
  )
}

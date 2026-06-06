import HeaderLogo from '@/components/HeaderLogo'

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-white/20">
      <header className="absolute inset-x-0 top-0 z-50">
        <nav className="flex items-center justify-between p-6 lg:px-8" aria-label="Global">
          <div className="flex lg:flex-1">
            <div 
              className="dark" 
              style={{ '--foreground': '100% 0 0' } as React.CSSProperties}
            >
              <HeaderLogo />
            </div>
          </div>
        </nav>
      </header>
      <main>
        {children}
      </main>
    </div>
  )
}

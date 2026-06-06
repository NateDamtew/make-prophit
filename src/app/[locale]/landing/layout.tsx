export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-white/20">
      <header className="absolute inset-x-0 top-0 z-50">
        <nav className="flex items-center justify-between p-6 lg:px-8" aria-label="Global">
          <div className="flex lg:flex-1">
            <a href="#" className="-m-1.5 p-1.5">
              <span className="sr-only">MakeProphit</span>
              <img className="h-8 w-auto" src="/assets/logo.png" alt="MakeProphit Logo" />
            </a>
          </div>
        </nav>
      </header>
      <main>
        {children}
      </main>
    </div>
  )
}

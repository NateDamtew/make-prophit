import HeaderLogo from '@/components/HeaderLogo'

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-white/20">
      <main>
        {children}
      </main>
    </div>
  )
}

import { type NextRequest, NextResponse } from 'next/server'
import proxy, { config as proxyConfig } from './proxy'

export default async function middleware(request: NextRequest) {
  const url = new URL(request.url)
  const host = request.headers.get('host') || ''
  
  // Clean port if present
  const hostname = host.split(':')[0]

  // We want to serve the landing page for the main domain.
  // We want to serve the platform for beta.* and tma.* subdomains.
  const isPlatformDomain = hostname === 'beta.makeprophit.com' || hostname === 'tma.makeprophit.com'
  const isLandingDomain = !isPlatformDomain && (
    hostname === 'makeprophit.com' ||
    hostname === 'www.makeprophit.com' ||
    hostname === 'localhost'
  )

  // If the user visits the root of the landing page domain, rewrite to the isolated landing group
  if (isLandingDomain) {
    if (url.pathname === '/' || url.pathname === '/en' || url.pathname === '/zh' || url.pathname === '/ru') {
      const locale = url.pathname === '/' ? 'en' : url.pathname.replace('/', '')
      const rewrittenUrl = new URL(`/${locale}/landing`, request.url)
      return NextResponse.rewrite(rewrittenUrl)
    }
  }

  // Pass everything else to the original upstream proxy routing (which handles beta.makeprophit.com, tma.makeprophit.com, etc.)
  return proxy(request)
}

// Export the original config to ensure we intercept the exact same paths the original middleware intended
export const config = proxyConfig

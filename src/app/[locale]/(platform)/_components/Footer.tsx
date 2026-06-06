'use client'

import { Link } from '@/i18n/navigation'
import { MessageCircle, Globe, Share2, Mail, Users } from 'lucide-react'
import HeaderLogo from '@/components/HeaderLogo'

export default function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-border bg-background pt-16 pb-8 text-sm text-muted-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          
          {/* Logo and Socials */}
          <div className="flex flex-col space-y-6">
            <div>
              <HeaderLogo />
            </div>
            <div className="flex space-x-4 text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors"><Globe className="h-5 w-5" /></a>
              <a href="#" className="hover:text-foreground transition-colors"><MessageCircle className="h-5 w-5" /></a>
              <a href="#" className="hover:text-foreground transition-colors"><Share2 className="h-5 w-5" /></a>
              <a href="#" className="hover:text-foreground transition-colors"><Mail className="h-5 w-5" /></a>
              <a href="#" className="hover:text-foreground transition-colors"><Users className="h-5 w-5" /></a>
            </div>
          </div>

          {/* Links Columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Product</h3>
              <ul className="space-y-3">
                <li><a href="#" className="hover:text-foreground transition-colors">Perpetual Futures</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Markets</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Incentive program</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Institutions</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">API & developers</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Company</h3>
              <ul className="space-y-3">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Research</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Policy Center</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Brand Kit</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Help</h3>
              <ul className="space-y-3">
                <li><a href="#" className="hover:text-foreground transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">FAQ</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Fee schedule</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Trading hours</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Regulatory</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-16 border-t border-border pt-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs">
          <p>© 2026 Prophit Inc. - All rights reserved</p>
          <div className="flex flex-wrap gap-4">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Data Terms of Service</a>
            <a href="#" className="hover:text-foreground transition-colors">Trading Prohibitions</a>
            <a href="#" className="hover:text-foreground transition-colors">FAQ for Finance Professionals</a>
          </div>
        </div>
        
        <p className="mt-8 text-[11px] leading-5 text-muted-foreground text-justify">
          Trading on Prophit involves risk and may not be appropriate for all. Members risk losing their cost to enter any transaction, including fees. You should carefully consider whether trading on Prophit is appropriate for you in light of your investment experience and financial resources. Any trading decisions you make are solely your responsibility and at your own risk. Information is provided for convenience only on an &quot;AS IS&quot; basis. Past performance is not necessarily indicative of future results. Prophit is subject to applicable regulatory oversight.
        </p>
      </div>
    </footer>
  )
}

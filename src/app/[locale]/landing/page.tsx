'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      setStatus('success')
      setMessage('You have been added to the waitlist!')
      setEmail('')
    } catch (err: any) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
  }

  return (
    <div className="bg-residence-bg min-h-screen text-white font-sans selection:bg-residence-green selection:text-black">
      {/* Navbar Minimalist */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 border-b border-white/10 bg-residence-bg/80 backdrop-blur-md">
        <div className="text-xl font-bold tracking-tight">PROPHIT.</div>
        <button className="text-sm font-semibold tracking-wide uppercase px-5 py-2.5 bg-white text-black hover:bg-residence-green hover:text-black transition-colors rounded-full">
          Join Waitlist
        </button>
      </nav>

      <main className="pt-32 pb-24 px-6 md:px-12 lg:px-24 mx-auto max-w-[1440px]">
        
        {/* Hero Section */}
        <motion.div 
          className="min-h-[70vh] flex flex-col justify-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="overflow-hidden">
            <h1 className="text-6xl md:text-8xl lg:text-[140px] leading-[0.9] font-black tracking-tighter uppercase text-white">
              A PREDICTION<br />
              <span className="text-residence-green">MARKET</span> FOR THE<br />
              NEXT BILLIONS
            </h1>
          </motion.div>
          
          <motion.p variants={itemVariants} className="mt-10 max-w-2xl text-xl md:text-2xl font-medium text-gray-400 leading-tight">
            Be the first to experience Prophit. Secure your early access spot and start trading on the most advanced decentralized platform.
          </motion.p>
        </motion.div>

        {/* Form Section */}
        <motion.section 
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mt-24 pt-24 border-t border-white/10 grid grid-cols-1 lg:grid-cols-2 gap-16"
        >
          <div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter uppercase mb-6">
              Get Early <span className="text-residence-orange">Access</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-md">
              We are rolling out invites in batches. Drop your email below to reserve your spot on the waitlist.
            </p>
          </div>

          <div className="flex flex-col justify-center">
            <form onSubmit={handleSubmit} className="w-full">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="w-full flex-auto rounded-none border border-white/20 bg-transparent px-6 py-5 text-white placeholder-gray-500 focus:border-residence-green focus:outline-none focus:ring-0 text-lg transition-colors"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="flex-none bg-residence-orange px-8 py-5 text-lg font-bold uppercase tracking-wide text-black hover:bg-residence-green disabled:opacity-50 transition-colors"
                >
                  {status === 'loading' ? 'Joining...' : 'Submit'}
                </button>
              </div>
              
              <div className="mt-6 min-h-[24px]">
                {status === 'success' && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-residence-green font-medium tracking-wide">
                    {message}
                  </motion.p>
                )}
                {status === 'error' && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-red-500 font-medium tracking-wide">
                    {message}
                  </motion.p>
                )}
              </div>
            </form>
          </div>
        </motion.section>

      </main>
    </div>
  )
}

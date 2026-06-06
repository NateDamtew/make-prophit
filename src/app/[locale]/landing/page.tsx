'use client'

import { useState } from 'react'

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

  return (
    <div className="relative isolate px-6 pt-14 lg:px-8 flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background gradients for glassmorphism / modern vibe */}
      <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }}></div>
      </div>
      
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl mb-6">
          The Future of Prediction Markets
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-300">
          Be the first to experience Prophit. Join the waitlist to secure your early access spot and start trading on the most advanced decentralized platform.
        </p>
        
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <form onSubmit={handleSubmit} className="w-full max-w-md">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-3 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6 backdrop-blur-md"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="flex-none rounded-md bg-indigo-500 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 transition-all duration-200"
              >
                {status === 'loading' ? 'Joining...' : 'Join Waitlist'}
              </button>
            </div>
            
            {status === 'success' && (
              <p className="mt-4 text-sm text-green-400 font-medium">{message}</p>
            )}
            {status === 'error' && (
              <p className="mt-4 text-sm text-red-400 font-medium">{message}</p>
            )}
          </form>
        </div>
      </div>

      <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]" aria-hidden="true">
        <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }}></div>
      </div>
    </div>
  )
}

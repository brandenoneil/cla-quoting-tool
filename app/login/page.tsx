'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    if (result?.ok) {
      const rawCb = searchParams.get('callbackUrl')
      const next =
        rawCb && rawCb.startsWith('/') && !rawCb.startsWith('//') ? rawCb : '/'
      // Hard navigation so the session cookie from /api/auth/* is always sent on the next load
      // (avoids getting stuck on “Signing in…” if client-side routing races middleware).
      window.location.assign(next)
      return
    }

    setError('Sign-in did not finish. Try again or refresh the page.')
    setLoading(false)
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4 bg-[#061a31]">
      {/* Ambient layers */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0c3660] via-[#0A2E52] to-[#041326]" />
      <div
        className="pointer-events-none absolute -top-32 -right-24 h-[420px] w-[420px] rounded-full bg-brand-steel/25 blur-[100px] animate-cla-float-slow"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-20 h-[380px] w-[380px] rounded-full bg-brand-gold/12 blur-[90px] animate-cla-float-slow"
        style={{ animationDelay: '-3s' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[min(90vw,720px)] w-[min(90vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.04] animate-cla-shine"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10 animate-cla-rise">
          <div className="flex justify-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/logo-over-black.png"
              alt="Cutlite America"
              className="h-[4.75rem] w-auto drop-shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-transform duration-500 hover:scale-[1.02]"
            />
          </div>
          <div className="h-px w-28 mx-auto bg-gradient-to-r from-transparent via-[#B08D4E] to-transparent animate-cla-shine" />
        </div>

        {/* Login Card */}
        <div className="cla-glass-panel p-8 sm:p-10 shadow-cla-login animate-cla-scale-in" style={{ animationDelay: '80ms' }}>
          <div className="mb-8">
            <p className="cla-kicker text-brand-text-muted/90 mb-2">Cutlite America</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[#0A2E52]">Quote Builder</h2>
            <p className="text-sm text-brand-text-muted mt-2 leading-relaxed">Sign in with your internal credentials.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-text-muted mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="cla-input"
                placeholder="you@cutliteamerica.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-text-muted mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="cla-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3.5 bg-red-50/95 border border-red-200/80 rounded-xl text-sm text-red-700 animate-cla-scale-in">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="cla-btn-primary w-full py-3.5 mt-2 disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[#94B8D9]/85 text-[11px] tracking-[0.18em] uppercase mt-8 animate-cla-fade" style={{ animationDelay: '200ms' }}>
          Cutlite America, LLC · Internal tool
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A2E52] flex items-center justify-center p-4">
          <div className="flex items-center gap-3 text-[#94B8D9] text-sm">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />
            Loading…
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}

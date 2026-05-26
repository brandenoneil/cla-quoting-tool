'use client'

import type { ReactNode } from 'react'
import { signOut } from 'next-auth/react'
import BrandHeader from '@/components/BrandHeader'

interface Props {
  eyebrow?: string
  user?: { name?: string | null; email?: string | null }
  children?: ReactNode
}

export default function DealerBrandHeader({ eyebrow, user, children }: Props) {
  return (
    <BrandHeader logoHref="/dealer" logoHeight={36} eyebrow={eyebrow}>
      {children}
      <nav className="hidden lg:flex items-center gap-2 text-sm mr-1">
        <a href="/dealer" className="cla-btn-ghost">
          Dashboard
        </a>
        <span className="text-white/20">·</span>
        <a href="/dealer/price-check" className="cla-btn-ghost">
          Price check
        </a>
        <span className="text-white/20">·</span>
        <a href="/dealer/quotes/new" className="cla-btn-ghost">
          New request
        </a>
      </nav>
      {user && (
        <div className="flex items-center gap-2 pl-2 border-l border-white/15">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-gold to-amber-700 ring-2 ring-white/10 flex items-center justify-center text-white text-xs font-bold shadow-inner">
            {user.name?.[0]?.toUpperCase() || 'D'}
          </div>
          <span className="text-white text-sm hidden sm:inline max-w-[140px] truncate">{user.name || user.email}</span>
        </div>
      )}
      <button type="button" onClick={() => signOut({ callbackUrl: '/login' })} className="cla-btn-ghost text-sm">
        Sign out
      </button>
    </BrandHeader>
  )
}

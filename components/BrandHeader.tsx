import type { ReactNode } from 'react'

interface BrandHeaderProps {
  children?: ReactNode
  /** Narrow strip shown under the logo (e.g. "New Quote") */
  eyebrow?: string
  logoHeight?: number
  logoHref?: string
  className?: string
}

/**
 * Shared top chrome: navy gradient bar, subtle sheen, animated gold accent line.
 */
export default function BrandHeader({ children, eyebrow, logoHeight = 36, logoHref = '/', className = '' }: BrandHeaderProps) {
  return (
    <header className={`cla-header-shell sticky top-0 z-40 ${className}`}>
      <div className="cla-header-inner border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 shrink">
            <a href={logoHref} className="cla-logo-wrap group flex items-center gap-3 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A2E52] rounded-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logos/logo-over-black.png"
                alt="Cutlite America"
                className="w-auto transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                style={{ height: logoHeight, width: 'auto' }}
              />
              {eyebrow && (
                <span className="hidden sm:inline-flex text-[10px] font-semibold tracking-[0.2em] text-[#94B8D9] uppercase border-l border-white/20 pl-3 py-0.5">
                  {eyebrow}
                </span>
              )}
            </a>
          </div>
          {children ? <div className="flex items-center gap-3 sm:gap-4 shrink-0">{children}</div> : null}
        </div>
      </div>
      <div className="cla-gold-line h-px w-full" aria-hidden />
    </header>
  )
}

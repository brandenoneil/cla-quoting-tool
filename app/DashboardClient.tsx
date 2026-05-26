'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import ExpiryBadge from '@/components/ExpiryBadge'
import DealCard from '@/components/DealCard'
import { HUBSPOT_PORTAL_ID } from '@/types'
import BrandHeader from '@/components/BrandHeader'
import { canonicalLaserSource } from '@/lib/machineConstraints'
import type { Quote } from '@prisma/client'

interface Props {
  quotes: Quote[]
  pendingQuotes: Quote[]
  user: { name?: string; email?: string; role?: string }
}

interface EnrichedDeal {
  id: string
  properties: {
    dealname: string
    amount?: string
    dealstage: string
    hs_lastmodifieddate?: string
    dealer_company?: string
  }
  contact?: { properties: { firstname?: string; lastname?: string; email?: string } }
}

type ValidityFilter = 'all' | 'active' | 'expired'
type StageFilter = 'open' | 'closed-won' | 'closed-lost'

const EXPIRY_DAYS = 30

function isActive(createdAt: Date | string) {
  const expiry = new Date(new Date(createdAt).getTime() + EXPIRY_DAYS * 86400000)
  return expiry > new Date()
}

// Group quotes by hubspotDealId
function groupByDeal(quotes: Quote[]): Map<string, Quote[]> {
  const map = new Map<string, Quote[]>()
  for (const q of quotes) {
    const existing = map.get(q.hubspotDealId) ?? []
    existing.push(q)
    map.set(q.hubspotDealId, existing)
  }
  return map
}

export default function DashboardClient({ quotes: allQuotes, pendingQuotes, user }: Props) {
  const router = useRouter()

  // ── Hero deal search ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [deals, setDeals] = useState<EnrichedDeal[]>([])
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout>()
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Quote table filters ───────────────────────────────────────────────────
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>('all')
  const [stageFilter, setStageFilter] = useState<StageFilter | 'all'>('all')
  const [closedDeals, setClosedDeals] = useState<EnrichedDeal[]>([])
  const [loadingClosed, setLoadingClosed] = useState(false)

  // ── Fetch open deals for hero search ─────────────────────────────────────
  const fetchDeals = useCallback(async (q: string) => {
    setSearching(true)
    try {
      const res = await fetch(`/api/deals/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setDeals(data.deals || [])
      setSearchOpen(true)
    } catch {}
    finally { setSearching(false) }
  }, [])

  useEffect(() => {
    if (!searchQuery && !searchOpen) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchDeals(searchQuery), 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchQuery, fetchDeals, searchOpen])

  // ── Fetch closed deals when filter changes ────────────────────────────────
  useEffect(() => {
    if (stageFilter === 'all' || stageFilter === 'open' as any) {
      setClosedDeals([])
      return
    }
    const apiFilter = stageFilter === 'closed-won' ? 'won' : 'lost'
    setLoadingClosed(true)
    fetch(`/api/deals/closed?filter=${apiFilter}`)
      .then((r) => r.json())
      .then((d) => setClosedDeals(d.deals ?? []))
      .catch(() => {})
      .finally(() => setLoadingClosed(false))
  }, [stageFilter])

  // ── Compute filtered quotes ───────────────────────────────────────────────
  const closedDealIds = new Set(closedDeals.map((d) => d.id))

  const filteredQuotes = allQuotes.filter((q) => {
    // Validity filter
    if (validityFilter === 'active' && !isActive(q.createdAt)) return false
    if (validityFilter === 'expired' && isActive(q.createdAt)) return false

    // Stage filter
    if (stageFilter === 'closed-won' || stageFilter === 'closed-lost') {
      return closedDealIds.has(q.hubspotDealId)
    }

    return true
  })

  const dealGroups = groupByDeal(filteredQuotes)

  // ── Counts for filter badges ──────────────────────────────────────────────
  const activeCount = allQuotes.filter((q) => isActive(q.createdAt)).length
  const expiredCount = allQuotes.filter((q) => !isActive(q.createdAt)).length

  function handleDealSelect(deal: EnrichedDeal) {
    setSearchOpen(false)
    setSearchQuery('')
    router.push(`/quotes/new?dealId=${deal.id}`)
  }

  function handleSearchFocus() {
    setSearchOpen(true)
    fetchDeals(searchQuery)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.closest('.search-container')?.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="cla-page-canvas">
      <BrandHeader logoHeight={40}>
        {user.role === 'admin' && (
          <a href="/admin/users" className="cla-btn-ghost text-sm">
            Users
          </a>
        )}
        <div className="flex items-center gap-2 pl-2 border-l border-white/15">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-steel to-[#1559a8] ring-2 ring-white/15 flex items-center justify-center text-white text-xs font-bold shadow-inner transition-transform duration-300 hover:scale-105">
            {user.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="text-white text-sm hidden sm:inline max-w-[160px] truncate">{user.name || user.email}</span>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })} className="cla-btn-ghost text-sm">
          Sign out
        </button>
      </BrandHeader>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        {/* ── Hero search ── */}
        <div className="mb-12 animate-cla-rise">
          <p className="cla-kicker mb-2 animate-cla-fade cla-stagger-1">Quote Builder</p>
          <h1 className="cla-title mb-3 animate-cla-fade cla-stagger-2">
            Welcome back, {user.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-brand-text-muted text-sm mb-8 max-w-lg leading-relaxed animate-cla-fade cla-stagger-3">
            Search an open HubSpot deal to configure a precise Cutlite quote—engineered layouts, disciplined pricing,
            polished customer-ready documents.
          </p>

          <div className="relative max-w-xl search-container animate-cla-fade cla-stagger-4">
            <div className="relative group">
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={handleSearchFocus}
                placeholder="Search open deals — company, machine, stage…"
                className="cla-input pl-11 pr-12 py-4 shadow-cla-card group-hover:border-brand-steel/35"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-steel border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {searchOpen && deals.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 cla-glass-panel py-1 z-50 max-h-80 overflow-y-auto animate-cla-scale-in shadow-cla-card-hover">
                {deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} onSelect={handleDealSelect} />
                ))}
              </div>
            )}

            {searchOpen && deals.length === 0 && !searching && searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-2 cla-glass-panel z-50 p-5 text-center text-sm text-brand-text-muted animate-cla-scale-in">
                No open deals found for &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>

          <div className="mt-5">
            <a
              href="/quotes/new"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-steel hover:text-[#1559a8] transition-colors duration-200 group/link"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-steel/25 bg-white/80 text-brand-steel shadow-sm transition-all duration-200 group-hover/link:border-brand-steel/50 group-hover/link:shadow-md">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </span>
              Or start without a linked deal
            </a>
          </div>
        </div>

        {/* ── Pending Dealer Approvals ── */}
        {pendingQuotes.length > 0 && (
          <div className="mb-10 animate-cla-rise">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-display text-lg font-semibold text-[#0A2E52] tracking-tight">Quote requests</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm tabular-nums">
                {pendingQuotes.length}
              </span>
            </div>
            <div className="space-y-3">
              {pendingQuotes.map((q) => (
                <div
                  key={q.id}
                  className="cla-elevated px-5 py-4 flex flex-wrap items-center gap-4 border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white hover:shadow-cla-card-hover transition-shadow duration-300"
                >
                  <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 shadow-[0_0_0_4px_rgba(245,158,11,0.2)] animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-brand-steel">{q.quoteNumber}</span>
                      <span className="text-xs font-medium text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full">
                        Pending review
                      </span>
                    </div>
                    <p className="font-semibold text-[#0A2E52] mt-1">{q.company}</p>
                    <p className="text-xs text-brand-text-muted mt-0.5">
                      {q.machineModel} {q.machinePower} · {q.tier}
                      {(q as any).submittedByDealer ? ` · Dealer: ${(q as any).submittedByDealer}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-[#0A2E52] text-lg tabular-nums">${Math.round(q.totalAmount).toLocaleString()}</p>
                    <p className="text-xs text-brand-text-muted">{new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <a
                    href={`/quotes/${q.id}`}
                    className="px-4 py-2.5 bg-gradient-to-b from-[#0A2E52] to-[#082441] text-white text-xs font-semibold rounded-xl shadow-md hover:from-brand-steel hover:to-[#1559a8] transition-all duration-200 active:scale-[0.98] flex-shrink-0"
                  >
                    Review &amp; approve →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Quotes Section ── */}
        <div className="animate-cla-fade" style={{ animationDelay: '280ms' }}>
          {/* Section header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <p className="cla-kicker mb-1">Archive</p>
              <h2 className="font-display text-lg font-semibold text-[#0A2E52] tracking-tight">Quote library</h2>
            </div>
            <span className="text-xs text-brand-text-muted tabular-nums rounded-full border border-brand-rule-gray/70 bg-white/70 px-3 py-1">
              {filteredQuotes.length} of {allQuotes.length} quotes
            </span>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {/* Validity tabs */}
            <div className="flex bg-white/90 backdrop-blur-sm border border-brand-rule-gray/70 rounded-xl overflow-hidden text-xs shadow-sm">
              {([
                { key: 'all', label: 'All Quotes', count: allQuotes.length },
                { key: 'active', label: 'Active', count: activeCount },
                { key: 'expired', label: 'Expired', count: expiredCount },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setValidityFilter(key)}
                  className={`px-3.5 py-2.5 font-medium flex items-center gap-1.5 transition-all duration-200 border-r border-brand-rule-gray/50 last:border-r-0 ${
                    validityFilter === key
                      ? 'bg-[#0A2E52] text-white shadow-inner'
                      : 'text-brand-text-muted hover:bg-brand-warm-white/80'
                  }`}
                >
                  {key === 'active' && (
                    <span className={`w-1.5 h-1.5 rounded-full ${validityFilter === key ? 'bg-emerald-300' : 'bg-emerald-500'}`} />
                  )}
                  {key === 'expired' && (
                    <span className={`w-1.5 h-1.5 rounded-full ${validityFilter === key ? 'bg-red-300' : 'bg-red-400'}`} />
                  )}
                  {label}
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${validityFilter === key ? 'bg-white/20' : 'bg-brand-warm-white text-brand-text-mid'}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Deal stage filter */}
            <div className="flex bg-white/90 backdrop-blur-sm border border-brand-rule-gray/70 rounded-xl overflow-hidden text-xs shadow-sm">
              {([
                { key: 'all', label: 'All Stages' },
                { key: 'closed-won', label: '✓ Closed Won' },
                { key: 'closed-lost', label: '✕ Closed Lost' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStageFilter(key)}
                  className={`px-3.5 py-2.5 font-medium transition-all duration-200 border-r border-brand-rule-gray/50 last:border-r-0 ${
                    stageFilter === key
                      ? key === 'closed-won'
                        ? 'bg-emerald-600 text-white'
                        : key === 'closed-lost'
                        ? 'bg-red-600 text-white'
                        : 'bg-[#0A2E52] text-white'
                      : 'text-brand-text-muted hover:bg-brand-warm-white/80'
                  }`}
                >
                  {label}
                  {loadingClosed && key === stageFilter && (
                    <span className="ml-1 inline-block w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Closed stage info banner */}
          {(stageFilter === 'closed-won' || stageFilter === 'closed-lost') && !loadingClosed && (
            <div className="mb-4 px-4 py-3 bg-white/75 border border-brand-rule-gray/60 rounded-xl text-xs text-brand-text-muted flex items-center gap-2 shadow-sm">
              <svg className="w-3.5 h-3.5 shrink-0 text-brand-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Showing quotes for <strong className="text-[#0A2E52]">{closedDeals.length}</strong> {stageFilter === 'closed-won' ? 'Closed Won' : 'Closed Lost'} deals in your HubSpot pipeline.
            </div>
          )}

          {/* Empty state */}
          {filteredQuotes.length === 0 ? (
            <div className="cla-elevated p-14 text-center animate-cla-scale-in">
              <svg className="w-12 h-12 mx-auto text-brand-rule-gray mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {allQuotes.length === 0 ? (
                <>
                  <p className="text-brand-text-mid font-medium">No quotes yet</p>
                  <p className="text-brand-text-muted text-sm mt-2">Search for a deal above to begin your first configured quote.</p>
                </>
              ) : (
                <>
                  <p className="text-brand-text-mid font-medium">No quotes match these filters</p>
                  <button
                    type="button"
                    onClick={() => { setValidityFilter('all'); setStageFilter('all') }}
                    className="text-brand-steel text-sm mt-3 font-semibold hover:underline"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            // ── Grouped by deal ────────────────────────────────────────────────
            <div className="space-y-5">
              {Array.from(dealGroups.entries()).map(([dealId, dealQuotes], groupIdx) => {
                const first = dealQuotes[0]
                return (
                  <div
                    key={dealId}
                    className="cla-elevated overflow-hidden hover:shadow-cla-card-hover transition-shadow duration-300 animate-cla-rise"
                    style={{ animationDelay: `${Math.min(groupIdx, 6) * 50}ms` }}
                  >
                    <div className="px-5 py-3.5 bg-gradient-to-r from-brand-steel-light/95 to-white border-b border-brand-steel/10 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-semibold text-[#0A2E52] text-sm">{first.hubspotDealName}</span>
                        <span className="text-brand-text-muted text-xs ml-2">· {first.company}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-brand-text-muted tabular-nums">
                          {dealQuotes.length} quote{dealQuotes.length !== 1 ? 's' : ''}
                        </span>
                        {dealId && (
                          <a
                            href={`https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${dealId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#FF7A59] hover:text-orange-700 font-semibold transition-colors"
                          >
                            HubSpot ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-brand-rule-gray/40">
                      {dealQuotes.map((quote) => (
                        <QuoteRow key={quote.id} quote={quote} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuoteRow({ quote }: { quote: Quote }) {
  return (
    <div className="group/row px-5 py-3.5 flex flex-wrap items-center gap-3 text-sm bg-white/40 hover:bg-white/95 transition-colors duration-200">
      {/* Quote number */}
      <span className="font-mono text-xs font-semibold text-brand-steel w-28 flex-shrink-0">
        {quote.quoteNumber}
      </span>
      {/* Machine */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-brand-text-mid">{quote.machineModel}</span>
        <span className="text-brand-text-muted text-xs ml-2">{quote.machinePower} · {canonicalLaserSource(quote.laserSource)}</span>
      </div>
      {/* Total */}
      <span className="font-bold text-[#0A2E52] w-28 text-right flex-shrink-0 tabular-nums">
        {'$' + Math.round(quote.totalAmount).toLocaleString('en-US')}
      </span>
      {/* Tier */}
      <TierBadge tier={quote.tier} />
      {/* Status */}
      <StatusBadge status={quote.status} />
      {/* Expiry */}
      <ExpiryBadge createdAt={quote.createdAt} />
      {/* Date */}
      <span className="text-xs text-brand-text-muted flex-shrink-0 tabular-nums">
        {new Date(quote.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
      </span>
      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-90 group-hover/row:opacity-100 transition-opacity">
        <a
          href={`/quotes/${quote.id}`}
          className="px-2.5 py-1.5 text-xs font-medium border border-brand-rule-gray/70 rounded-lg text-brand-text-mid hover:border-brand-steel/40 hover:text-brand-steel hover:bg-brand-steel-light/40 transition-all duration-200"
        >
          View
        </a>
        <a
          href={`/api/quotes/${quote.id}/pdf`}
          className="px-2.5 py-1.5 text-xs font-medium border border-brand-rule-gray/70 rounded-lg text-brand-text-mid hover:border-brand-gold/50 hover:bg-amber-50/80 transition-all duration-200"
        >
          PDF ↓
        </a>
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  // tier column now stores the machineLabel ("Option A", "Option B", "Option C")
  const styles: Record<string, string> = {
    'Option A': 'bg-blue-100 text-blue-700',
    'Option B': 'bg-[#0A2E52]/10 text-[#0A2E52]',
    'Option C': 'bg-emerald-100 text-emerald-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[tier] ?? 'bg-gray-100 text-gray-600'}`}>
      {tier}
    </span>
  )
}

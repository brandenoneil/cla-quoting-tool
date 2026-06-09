'use client'

import { useState } from 'react'
import type { QuoteOption } from '@/types'

export interface PricingContext {
  model: string
  kw: number
  laser: string
  currentPrice: { list: number } | null
  historical: {
    avg: number | null
    count: number
    deals: { name: string; amount: number; closeDate: string | null; company: string }[]
  }
}

interface Props {
  options: QuoteOption[]
  selectedLabels: string[]
  onToggle: (option: QuoteOption) => void
  onContinue: () => void
  pricingContext?: PricingContext | null
  isDealer?: boolean
}

// Returns a ±10% range rounded to nearest $25K
function priceRange(total: number): string {
  const round = (n: number) => Math.round(n / 25000) * 25000
  const lo = round(total * 0.90)
  const hi = round(total * 1.10)
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    return '$' + Math.round(n).toLocaleString('en-US')
  }
  return `${fmt(lo)} – ${fmt(hi)}`
}

// One accent color per option slot — A, B, C
const OPTION_COLORS = [
  { border: 'border-[#1B6FC8]', badge: 'bg-[#1B6FC8] text-white', header: 'bg-[#E6F1FB]', text: 'text-[#1B6FC8]' },
  { border: 'border-[#0A2E52]', badge: 'bg-[#0A2E52] text-white', header: 'bg-[#0A2E52]/5',  text: 'text-[#0A2E52]' },
  { border: 'border-emerald-600', badge: 'bg-emerald-600 text-white', header: 'bg-emerald-50', text: 'text-emerald-700' },
]

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function delta(a: number, b: number) {
  const diff = a - b
  const pct = ((diff / b) * 100).toFixed(1)
  const sign = diff >= 0 ? '+' : ''
  return { diff, pct, sign }
}

export default function OptionCards({ options, selectedLabels, onToggle, onContinue, pricingContext, isDealer = false }: Props) {
  const [histExpanded, setHistExpanded] = useState(false)

  const hist = pricingContext?.historical
  const sheet = pricingContext?.currentPrice
  const hasContext = !!(hist?.avg || sheet)

  return (
    <div className="space-y-5">

      {/* ── Pricing Intelligence Panel (internal only) ── */}
      {hasContext && !isDealer && (
        <div className="rounded-xl border border-[#B08D4E]/40 bg-amber-50/60 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-[#B08D4E]/20">
            <div className="flex items-center gap-2">
              <span className="text-[#B08D4E] text-base">📊</span>
              <span className="text-sm font-semibold text-[#0A2E52]">Pricing Intelligence</span>
              {pricingContext && (
                <span className="text-xs text-gray-500">
                  — {pricingContext.model} {pricingContext.kw}kW {pricingContext.laser}
                </span>
              )}
            </div>
            {hist && hist.count > 0 && (
              <button
                onClick={() => setHistExpanded(v => !v)}
                className="text-xs text-[#1B6FC8] hover:underline"
              >
                {histExpanded ? 'Hide' : `View ${hist.count} deal${hist.count !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 divide-x divide-[#B08D4E]/20 md:grid-cols-3">
            <div className="px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Historical Avg (Closed Won)</p>
              {hist?.avg ? (
                <>
                  <p className="text-lg font-black text-[#0A2E52]">{fmt(hist.avg)}</p>
                  <p className="text-xs text-gray-400">{hist.count} deal{hist.count !== 1 ? 's' : ''}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">No closed deals found</p>
              )}
            </div>

            <div className="px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Sheet List Price (Feb 2026)</p>
              {sheet ? (
                <p className="text-lg font-black text-[#0A2E52]">{fmt(sheet.list)}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">Not in price sheet</p>
              )}
            </div>

            {hist?.avg && sheet && (
              <div className="px-4 py-3 hidden md:block">
                <p className="text-xs text-gray-500 mb-0.5">List vs Historical</p>
                {(() => {
                  const d = delta(sheet.list, hist.avg)
                  const isAbove = d.diff >= 0
                  return (
                    <>
                      <p className={`text-lg font-black ${isAbove ? 'text-emerald-600' : 'text-red-500'}`}>
                        {d.sign}{fmt(Math.abs(d.diff))}
                      </p>
                      <p className={`text-xs ${isAbove ? 'text-emerald-500' : 'text-red-400'}`}>
                        {d.sign}{d.pct}% vs avg
                      </p>
                    </>
                  )
                })()}
              </div>
            )}
          </div>

          {histExpanded && hist && hist.deals.length > 0 && (
            <div className="border-t border-[#B08D4E]/20 px-4 py-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Past Closed Won deals matching this model:</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {hist.deals.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-[#0A2E52] truncate block">{d.name}</span>
                      <span className="text-gray-400">{d.company}{d.closeDate ? ` · ${d.closeDate.slice(0, 10)}` : ''}</span>
                    </div>
                    <span className="font-bold text-gray-700 ml-3 flex-shrink-0">{fmt(d.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Option Cards ── */}
      <p className="text-sm font-semibold text-[#0A2E52] uppercase tracking-wide">
        Quote Options
      </p>
      <p className="text-sm text-gray-500 -mt-3">Select the option to build your quote document.</p>

      <div className={`grid grid-cols-1 gap-4 ${options.length > 1 ? 'md:grid-cols-' + Math.min(options.length, 3) : ''}`}>
        {options.map((option, idx) => {
          const colors = OPTION_COLORS[idx % OPTION_COLORS.length]
          const isSelected = selectedLabels.includes(option.machineLabel)
          const histDelta = hist?.avg ? delta(option.totalPrice, hist.avg) : null

          // Visible line items (exclude $0 included ones from count for "+ N more")
          const billableItems = option.lineItems.filter(i => !i.included)
          const includedItems = option.lineItems.filter(i => i.included)
          const SHOW_MAX = 5
          const shownBillable = billableItems.slice(0, SHOW_MAX)
          const hiddenCount = billableItems.length - shownBillable.length

          return (
            <button
              key={option.machineLabel || idx}
              onClick={() => onToggle(option)}
              className={`relative text-left rounded-2xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                isSelected ? `${colors.border} shadow-md` : 'border-gray-200'
              }`}
            >
              {/* Header */}
              <div className={`px-5 pt-4 pb-3 ${isSelected ? colors.header : 'bg-brand-warm-white/70'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    isSelected ? colors.badge : 'bg-gray-200 text-gray-600'
                  }`}>
                    {option.machineLabel || `Option ${String.fromCharCode(65 + idx)}`}
                  </span>
                  {option.notes?.includes('custom pricing') && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      Custom pricing
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-[#0A2E52] leading-tight">
                  {option.name || option.machineModel}
                </h3>
                {option.tagline && (
                  <p className="text-sm text-gray-500 mt-0.5">{option.tagline}</p>
                )}
              </div>

              {/* Price block */}
              <div className="px-5 py-4 border-b border-gray-100">
                {isDealer ? (
                  <>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Estimated Range</p>
                    <p className="text-2xl font-black text-[#0A2E52]">
                      {option.totalPrice > 0 ? priceRange(option.totalPrice) : 'TBD'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">USD · {option.deliveryWeeks} weeks delivery · Final price set by Cutlite America</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-black text-[#0A2E52]">
                      {option.totalPrice > 0 ? fmt(option.totalPrice) : 'TBD'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">USD · {option.deliveryWeeks} weeks delivery</p>
                    {histDelta && option.totalPrice > 0 && (
                      <p className={`text-xs mt-1 font-medium ${histDelta.diff >= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                        {histDelta.sign}{fmt(Math.abs(histDelta.diff))} vs historical avg
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Line items */}
              <div className="px-5 py-4 space-y-2">
                {shownBillable.map((item, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <svg className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700 font-medium truncate">{item.description}</span>
                    </div>
                    {!isDealer && <span className="text-gray-500 flex-shrink-0">{fmt(item.amount)}</span>}
                  </div>
                ))}

                {/* Included items (INC badge) */}
                {includedItems.map((item, i) => (
                  <div key={`inc-${i}`} className="flex items-start gap-1.5 text-sm">
                    <span className="mt-0.5 flex-shrink-0 inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                      INC
                    </span>
                    <span className="text-gray-500 truncate">{item.description}</span>
                  </div>
                ))}

                {hiddenCount > 0 && (
                  <p className="text-xs text-gray-400">+{hiddenCount} more items</p>
                )}
              </div>

              {/* Freight footer (internal only) */}
              {option.freight > 0 && !isDealer && (
                <div className="px-5 py-3 bg-brand-warm-white/60 border-t border-brand-rule-gray/40 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Freight (2.5%)</span>
                    <span>{fmt(option.freight)}</span>
                  </div>
                </div>
              )}

              {/* Selected state */}
              {isSelected && (
                <div className={`px-5 py-2 text-white text-sm text-center font-medium flex items-center justify-center gap-2 ${colors.badge.split(' ')[0]}`}>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Quote {selectedLabels.indexOf(option.machineLabel) + 1} of {selectedLabels.length}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedLabels.length > 0 && !isDealer && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-500 px-1">
            <span>
              {selectedLabels.length === 1
                ? '1 quote selected'
                : `${selectedLabels.length} quotes selected — all will be saved to this deal`}
            </span>
            <span className="text-xs text-gray-400">click a card to deselect</span>
          </div>
          <button
            onClick={onContinue}
            className="w-full py-4 bg-[#0A2E52] text-white rounded-xl font-semibold text-base hover:bg-[#1B6FC8] transition-colors"
          >
            {selectedLabels.length === 1
              ? 'Continue with 1 Quote →'
              : `Continue with ${selectedLabels.length} Quotes →`}
          </button>
        </div>
      )}
    </div>
  )
}

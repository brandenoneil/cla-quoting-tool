'use client'

import StageBadge from './StageBadge'
import type { HubSpotDeal } from '@/types'

interface EnrichedDeal extends HubSpotDeal {
  contact?: {
    properties: { firstname?: string; lastname?: string; email?: string; phone?: string }
  }
}

interface Props {
  deal: EnrichedDeal
  onSelect: (deal: EnrichedDeal) => void
  selected?: boolean
}

function formatAmount(amount?: string): string {
  if (!amount) return '—'
  const n = parseFloat(amount)
  if (isNaN(n)) return '—'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function relativeTime(isoDate?: string): string {
  if (!isoDate) return ''
  const diff = Date.now() - new Date(isoDate).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function DealCard({ deal, onSelect, selected }: Props) {
  const contactName = [
    deal.contact?.properties.firstname,
    deal.contact?.properties.lastname,
  ]
    .filter(Boolean)
    .join(' ')

  const contactEmail = deal.contact?.properties.email
  const dealer = deal.properties.dealer_company

  return (
    <button
      onClick={() => onSelect(deal)}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ease-cla-out hover:shadow-cla-card active:scale-[0.99] ${
        selected
          ? 'border-brand-steel bg-brand-steel-light/90 ring-2 ring-brand-steel/15'
          : 'border-brand-rule-gray/55 bg-white/95 hover:border-brand-steel/40 hover:bg-white hover:-translate-y-px hover:shadow-cla-card-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[#0A2E52] truncate">{deal.properties.dealname}</p>
            {dealer && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                {dealer}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StageBadge stageId={deal.properties.dealstage} />
            {contactName && (
              <span className="text-xs text-gray-500">
                {contactName}{contactEmail && ` · ${contactEmail}`}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-[#0A2E52]">{formatAmount(deal.properties.amount)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {relativeTime(deal.properties.hs_lastmodifieddate)}
          </p>
        </div>
      </div>
    </button>
  )
}

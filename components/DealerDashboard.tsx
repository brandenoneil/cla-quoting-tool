'use client'

import DealerBrandHeader from '@/components/DealerBrandHeader'
import { DEALER_CUSTOM_PRICING_MESSAGE, isCustomPricingOption } from '@/lib/sheetPricingWarnings'
import type { Quote } from '@prisma/client'

interface Props {
  requests: Quote[]
  user: { name?: string; email?: string }
}

// Map DB status → step index (0-based)
function statusToStep(status: string): number {
  if (status === 'PENDING_APPROVAL') return 0
  if (status === 'REVIEWING') return 1
  if (status === 'PUBLISHED' || status === 'SENT') return 2
  return 0
}

const STEPS = [
  { label: 'Submitted',       sub: 'Request received' },
  { label: 'Under Review',    sub: 'Team is reviewing' },
  { label: 'Approved & Sent', sub: 'Quote finalized' },
]

function priceRange(total: number): string {
  const round = (n: number) => Math.round(n / 25000) * 25000
  const lo = round(total * 0.90)
  const hi = round(total * 1.10)
  const f = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : '$' + Math.round(n).toLocaleString('en-US')
  return `${f(lo)} – ${f(hi)}`
}

function StatusTimeline({ status }: { status: string }) {
  const currentStep = statusToStep(status)

  return (
    <div className="w-full mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-start">
        {STEPS.map((step, idx) => {
          const done    = idx < currentStep
          const active  = idx === currentStep
          const last    = idx === STEPS.length - 1

          return (
            <div key={step.label} className="flex items-start flex-1">
              {/* Step node + label */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 0 }}>
                {/* Circle */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                  done    ? 'bg-[#0A2E52] border-[#0A2E52]'
                  : active ? 'bg-white border-[#1B6FC8] ring-4 ring-[#1B6FC8]/20'
                  : 'bg-white border-gray-200'
                }`}>
                  {done ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : active ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#1B6FC8]" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-gray-200" />
                  )}
                </div>

                {/* Label below */}
                <div className="mt-1.5 text-center px-1">
                  <p className={`text-[11px] font-semibold leading-tight ${
                    done ? 'text-[#0A2E52]' : active ? 'text-[#1B6FC8]' : 'text-gray-400'
                  }`}>
                    {step.label}
                  </p>
                  <p className={`text-[10px] mt-0.5 leading-tight ${active ? 'text-[#1B6FC8]/70' : 'text-gray-300'}`}>
                    {step.sub}
                  </p>
                </div>
              </div>

              {/* Connector line (not after last step) */}
              {!last && (
                <div className="flex-1 h-[2px] mt-3.5 mx-1">
                  <div className={`h-full rounded-full transition-all ${done ? 'bg-[#0A2E52]' : 'bg-gray-200'}`} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DealerDashboard({ requests, user }: Props) {
  const pending  = requests.filter(r => r.status === 'PENDING_APPROVAL')
  const reviewing = requests.filter(r => r.status === 'REVIEWING')
  const approved = requests.filter(r => r.status === 'PUBLISHED' || r.status === 'SENT')

  return (
    <div className="cla-page-canvas">
      <DealerBrandHeader user={user} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        {/* Welcome + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-10 animate-cla-rise">
          <div>
            <p className="cla-kicker mb-2 md:hidden">Dealer portal</p>
            <h1 className="cla-title mb-2">
              Welcome, {user.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-brand-text-muted text-sm max-w-xl leading-relaxed">
              Submit a quote request and our team will price and approve it for you.
            </p>
            <p className="text-sm mt-2">
              <a href="/dealer/price-check" className="font-semibold text-[#1B6FC8] hover:underline">
                Quick price check
              </a>
              <span className="text-gray-500"> — approximate configured totals from the estimator (not a formal quote).</span>
            </p>
          </div>
          <a
            href="/dealer/quotes/new"
            className="cla-btn-primary flex-shrink-0 self-start sm:self-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Quote Request
          </a>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { label: 'Awaiting Review',  count: pending.length + reviewing.length, color: 'text-amber-600', bg: 'bg-gradient-to-br from-amber-50 to-white border-amber-200/80' },
            { label: 'Approved & Sent',  count: approved.length,                   color: 'text-green-600', bg: 'bg-gradient-to-br from-emerald-50/90 to-white border-emerald-200/70' },
            { label: 'Total Requests',   count: requests.length,                   color: 'text-[#0A2E52]', bg: 'bg-white/90 border-brand-rule-gray/70 shadow-sm' },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`rounded-2xl border p-5 transition-all duration-300 hover:shadow-cla-card-hover animate-cla-rise ${s.bg}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <p className={`text-3xl font-black tabular-nums tracking-tight ${s.color}`}>{s.count}</p>
              <p className="text-xs text-brand-text-muted mt-1 font-medium uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Request list */}
        {requests.length === 0 ? (
          <div className="cla-elevated p-14 text-center animate-cla-scale-in">
            <svg className="w-12 h-12 mx-auto text-brand-rule-gray mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-brand-text-mid font-medium">No quote requests yet</p>
            <p className="text-brand-text-muted text-sm mt-2">Click &ldquo;New Quote Request&rdquo; to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-[#0A2E52] uppercase tracking-[0.2em]">Quote requests</h2>
            {requests.map(r => {
              const step = statusToStep(r.status)
              const isApproved = step === 2

              return (
                <div
                  key={r.id}
                  className={`cla-elevated p-5 md:p-6 transition-all duration-300 hover:shadow-cla-card-hover ${
                    isApproved ? 'border-emerald-200/90' : ''
                  }`}
                >
                  {/* Top row: info + price range */}
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-mono text-xs font-semibold text-[#1B6FC8]">{r.quoteNumber}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                      </div>
                      <p className="font-semibold text-[#0A2E52]">{r.company}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.machineModel} · {r.machinePower} · {r.packageName}
                      </p>
                    </div>

                    {/* Price summary */}
                    <div className="text-right flex-shrink-0 max-w-[140px]">
                      {isCustomPricingOption({
                        machineModel: r.machineModel,
                        machinePower: r.machinePower,
                        laserSource: r.laserSource,
                      }) ? (
                        <>
                          <p className="text-sm font-semibold text-amber-800 leading-snug">Custom pricing</p>
                          <p className="text-[10px] text-gray-500 mt-1 leading-snug">{DEALER_CUSTOM_PRICING_MESSAGE}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-400 mb-0.5">Estimated Range</p>
                          <p className="font-black text-[#0A2E52] text-base leading-tight">{priceRange(r.totalAmount)}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">~{r.deliveryWeeks} wk delivery</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 3-step status timeline */}
                  <StatusTimeline status={r.status} />

                  {/* Contextual note for approved state */}
                  {isApproved && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-100">
                      <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <p className="text-xs text-green-700 font-medium">
                        Your quote has been approved and sent. Your Cutlite America representative will be in touch shortly.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

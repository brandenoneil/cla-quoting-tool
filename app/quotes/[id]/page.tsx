import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import StatusBadge from '@/components/StatusBadge'
import QuotePublishButton from '@/components/QuotePublishButton'
import ApproveQuoteButton from '@/components/ApproveQuoteButton'
import DeleteQuoteButton from '@/components/DeleteQuoteButton'
import BrandHeader from '@/components/BrandHeader'
import type { LineItem } from '@/types'
import { HUBSPOT_PORTAL_ID } from '@/types'
import { canonicalLaserSource } from '@/lib/machineConstraints'
import { isPendingHubSpotDealId } from '@/lib/dealerHubSpotDeal'

function formatCurrency(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return null

  let quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) notFound()

  // Auto-transition: when an internal user opens a dealer request, mark it as REVIEWING
  // so the dealer's status tracker advances to "Under Review"
  if (quote.status === 'PENDING_APPROVAL' && (session.user as any)?.role !== 'dealer') {
    quote = await prisma.quote.update({
      where: { id: params.id },
      data: { status: 'REVIEWING' },
    })
  }

  const lineItems: LineItem[] = JSON.parse(quote.lineItemsJson)

  return (
    <div className="cla-page-canvas">
      <BrandHeader logoHeight={30} eyebrow={quote.quoteNumber}>
        <a href="/" className="cla-btn-ghost text-sm hidden md:inline">
          ← Dashboard
        </a>
        <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[min(100vw-10rem,520px)]">
          <DeleteQuoteButton
            quoteId={quote.id}
            quoteNumber={quote.quoteNumber}
            isPublished={!!quote.hubspotQuoteId}
          />
          <a
            href={`/quotes/${params.id}/edit`}
            className="px-3 py-1.5 border border-white/25 text-white text-xs rounded-lg hover:bg-white/10 transition-all duration-200 active:scale-[0.98]"
          >
            Edit
          </a>
          <a
            href={`/quotes/${params.id}/preview`}
            target="_blank"
            className="px-3 py-1.5 border border-white/25 text-white text-xs rounded-lg hover:bg-white/10 transition-all duration-200 active:scale-[0.98]"
          >
            Preview
          </a>
          <a
            href={`/api/quotes/${params.id}/pdf`}
            className="px-3 py-1.5 bg-gradient-to-b from-[#B08D4E] to-amber-800 text-white text-xs rounded-lg font-semibold hover:from-amber-600 hover:to-amber-900 shadow-md transition-all duration-200 active:scale-[0.98]"
          >
            PDF ↓
          </a>
          {quote.hubspotDealId && !isPendingHubSpotDealId(quote.hubspotDealId) && (
            <a
              href={`https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${quote.hubspotDealId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#FF7A59] text-white text-xs rounded-lg font-semibold hover:bg-orange-600 transition-all duration-200 active:scale-[0.98]"
            >
              HubSpot ↗
            </a>
          )}
        </div>
      </BrandHeader>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 animate-cla-rise">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quote summary */}
            <div className="cla-elevated p-6 md:p-7">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="cla-kicker mb-1 md:hidden">{quote.quoteNumber}</p>
                  <h1 className="font-display text-xl font-semibold text-[#0A2E52] tracking-tight">{quote.quoteNumber}</h1>
                  <p className="text-brand-text-muted text-sm mt-1">{quote.hubspotDealName}</p>
                </div>
                <StatusBadge status={quote.status} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Company</p>
                  <p className="font-medium text-gray-800">{quote.company}</p>
                </div>
                <div>
                  <p className="text-gray-500">Contact</p>
                  <p className="font-medium text-gray-800">{quote.contactName}</p>
                  <p className="text-[#1B6FC8] text-xs">{quote.contactEmail}</p>
                </div>
                <div>
                  <p className="text-gray-500">Machine</p>
                  <p className="font-medium text-gray-800">{quote.machineModel}</p>
                  <p className="text-gray-500 text-xs">{quote.machinePower} · {canonicalLaserSource(quote.laserSource)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Package</p>
                  <p className="font-medium text-gray-800">{quote.packageName}</p>
                  <p className="text-gray-500 text-xs">{quote.tier}</p>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="cla-elevated overflow-hidden">
              <div className="cla-panel-header">
                <h2 className="font-display font-semibold text-[#0A2E52]">Line items</h2>
              </div>
              <div className="divide-y divide-brand-rule-gray/40">
                {lineItems.map((item, i) => (
                  <div key={i} className="px-6 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 text-sm">{item.description}</p>
                      {item.detail && <p className="text-xs text-gray-400 mt-0.5">{item.detail}</p>}
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-xs text-gray-400">×{item.qty}</span>
                      {item.included ? (
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">Included</span>
                      ) : (
                        <span className="text-sm font-semibold text-gray-700">{formatCurrency(item.amount)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 bg-brand-warm-white/60 border-t border-brand-rule-gray/50">
                <div className="flex flex-col items-end gap-1 text-sm">
                  <div className="flex justify-between w-48">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
                  </div>
                  {quote.discountAmount > 0 && (
                    <div className="flex justify-between w-48 text-green-600">
                      <span>Discount</span>
                      <span className="font-medium">-{formatCurrency(quote.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between w-48">
                    <span className="text-gray-500">Freight</span>
                    <span className="font-medium">{formatCurrency(quote.freight)}</span>
                  </div>
                  <div className="flex justify-between w-48 pt-2 border-t border-gray-300 mt-1">
                    <span className="font-bold text-[#0A2E52]">Total</span>
                    <span className="font-black text-[#0A2E52] text-base">{formatCurrency(quote.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {quote.notes && (
              <div className="cla-elevated p-6">
                <h2 className="font-semibold text-[#0A2E52] mb-2">Notes</h2>
                <p className="text-sm text-gray-600">{quote.notes}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="cla-elevated p-5">
              <h3 className="font-semibold text-[#0A2E52] mb-3 text-sm">Quote Info</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Created</dt>
                  <dd className="font-medium">{new Date(quote.createdAt).toLocaleDateString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">By</dt>
                  <dd className="font-medium truncate ml-2">{quote.createdBy}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Delivery</dt>
                  <dd className="font-medium">~{quote.deliveryWeeks} weeks</dd>
                </div>
                {quote.hubspotQuoteId && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">HS Quote</dt>
                    <dd className="font-medium text-[#1B6FC8] text-xs">{quote.hubspotQuoteId}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="cla-highlight-total">
              <p className="cla-kicker mb-1">Total amount</p>
              <p className="text-2xl font-black text-[#0A2E52] tabular-nums">{formatCurrency(quote.totalAmount)}</p>
              <p className="text-xs text-brand-text-muted mt-1">{quote.tier} · {quote.packageName}</p>
            </div>

            {(quote.status === 'PENDING_APPROVAL' || quote.status === 'REVIEWING') && !quote.hubspotQuoteId ? (
              <ApproveQuoteButton
                quoteId={quote.id}
                dealerEmail={(quote as any).submittedByDealer}
              />
            ) : quote.hubspotQuoteId && !isPendingHubSpotDealId(quote.hubspotDealId) ? (
              <div className="cla-elevated p-5 border-[#1B6FC8]/20 bg-gradient-to-br from-blue-50/90 to-white">
                <p className="text-sm font-semibold text-[#0A2E52]">In HubSpot</p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  This quote is on the deal in HubSpot. Open the deal to review the draft and send to the customer.
                </p>
                <a
                  href={`https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${quote.hubspotDealId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs font-semibold text-[#1B6FC8] hover:underline"
                >
                  Open deal in HubSpot →
                </a>
              </div>
            ) : (
              <QuotePublishButton
                quoteId={quote.id}
                machineModel={quote.machineModel}
                companyName={quote.company}
                hubspotQuoteId={quote.hubspotQuoteId}
                hubspotDealId={quote.hubspotDealId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

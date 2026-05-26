import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import QuoteEditForm from '@/components/QuoteEditForm'
import BrandHeader from '@/components/BrandHeader'

export default async function QuoteEditPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) notFound()

  return (
    <div className="cla-page-canvas">
      <BrandHeader logoHeight={32} eyebrow={`Edit ${quote.quoteNumber}`}>
        <a href={`/quotes/${params.id}`} className="cla-btn-ghost text-sm">
          ← Back to quote
        </a>
      </BrandHeader>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="cla-elevated p-6 md:p-9 animate-cla-rise">
          <div className="mb-8">
            <p className="cla-kicker mb-2">Configuration</p>
            <h1 className="cla-section-heading">Edit quote</h1>
            <p className="cla-section-sub mb-0">
              {quote.quoteNumber} · {quote.hubspotDealName}
            </p>
          </div>
          <QuoteEditForm quote={quote as any} />
        </div>
      </div>
    </div>
  )
}

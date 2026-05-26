import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import QuoteDocument from '@/components/QuoteFlow/QuoteDocument'
import PrintButton from '@/components/PrintButton'
import BrandHeader from '@/components/BrandHeader'

export default async function QuotePreviewPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { pdf?: string }
}) {
  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) notFound()

  const isPdf = searchParams.pdf === 'true'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${isPdf ? '#fff' : '#f4f2ee'}; font-family: 'Inter', sans-serif; }
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          @page { margin: 0; size: letter; }
        }
      ` }} />

      {!isPdf && (
        <div className="no-print cla-page-canvas min-h-0">
          <BrandHeader logoHeight={30} eyebrow={quote.quoteNumber}>
            <a href="/" className="cla-btn-ghost text-sm hidden md:inline">
              ← Dashboard
            </a>
            <a href={`/quotes/${params.id}`} className="cla-header-action">
              Quote detail
            </a>
            <a
              href={`/api/quotes/${params.id}/pdf`}
              className="px-3 py-1.5 bg-gradient-to-b from-brand-gold to-amber-800 text-white text-xs rounded-lg font-semibold hover:from-amber-600 hover:to-amber-900 shadow-md transition-all duration-200 active:scale-[0.98]"
            >
              Download PDF
            </a>
            <PrintButton />
          </BrandHeader>
        </div>
      )}

      <div className={isPdf ? '' : 'cla-page-canvas py-8 px-4 sm:px-6 no-print'}>
        <div className={isPdf ? '' : 'animate-cla-rise'}>
          <QuoteDocument quote={quote} isPdf={isPdf} />
        </div>
      </div>
    </>
  )
}

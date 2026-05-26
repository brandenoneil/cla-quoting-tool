import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDealHistoryByCompany, enrichDeal, type DealEnrichment } from '@/lib/hubspot'
import { NextRequest } from 'next/server'

const STAGE_LABELS: Record<string, string> = {
  '168290368': 'Closed Won',
  '168290369': 'Closed Lost',
  '168290366': 'Prelim Proposal',
  '168290365': 'Initial Contact',
  '168290367': 'Final Proposal',
  '168290363': 'Opportunity Qualified',
  '168290364': 'Demo / Quote',
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const company = req.nextUrl.searchParams.get('company') ?? ''
  const excludeId = req.nextUrl.searchParams.get('excludeId') ?? undefined

  if (!company.trim()) return Response.json({ deals: [] })

  try {
    const deals = await getDealHistoryByCompany(company, excludeId, 10)

    // Enrich each deal in parallel (line items, notes, quotes)
    const enriched = await Promise.all(
      deals.map(async (d) => {
        let enrichment: DealEnrichment = { dealId: d.id, lineItems: [], notes: [], quotes: [] }
        try {
          enrichment = await enrichDeal(d.id)
        } catch { /* non-critical */ }

        return {
          id: d.id,
          name: d.properties?.dealname ?? '',
          stage: STAGE_LABELS[d.properties?.dealstage ?? ''] ?? d.properties?.dealstage ?? 'Unknown',
          amount: d.properties?.amount ? Number(d.properties.amount) : null,
          closeDate: d.properties?.closedate ?? null,
          company: d.properties?.dealer_company ?? '',
          lineItems: enrichment.lineItems,
          notes: enrichment.notes,
          quotes: enrichment.quotes,
        }
      })
    )

    return Response.json({ deals: enriched })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

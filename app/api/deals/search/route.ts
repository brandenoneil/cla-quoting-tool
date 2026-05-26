import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchDeals, getContact, getDeal } from '@/lib/hubspot'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const query = req.nextUrl.searchParams.get('q') || ''
  const dealId = req.nextUrl.searchParams.get('dealId')

  try {
    // Single deal lookup — used by ReviewForm to re-fetch contact
    if (dealId) {
      const deal = await getDeal(dealId)
      const contactIds = deal.associations?.contacts?.results?.map((r: any) => r.id) ?? []
      let contact = null
      if (contactIds.length > 0) {
        try { contact = await getContact(contactIds[0]) } catch {}
      }
      return Response.json({ deals: [{ ...deal, contact }] })
    }

    const deals = await searchDeals(query)

    // Enrich with contact details
    const enriched = await Promise.all(
      deals.map(async (deal) => {
        const contactIds = deal.associations?.contacts?.results?.map((r) => r.id) ?? []
        let contact = null
        if (contactIds.length > 0) {
          try {
            contact = await getContact(contactIds[0])
          } catch {
            // ignore
          }
        }
        return { ...deal, contact }
      })
    )

    return Response.json({ deals: enriched })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

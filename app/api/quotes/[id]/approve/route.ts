import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createHubSpotQuote,
  associateObjects,
  associateV3,
  createLineItem,
  createNote,
  updateDeal,
  getDeal,
} from '@/lib/hubspot'
import { NextRequest } from 'next/server'
import type { LineItem } from '@/types'

const PRELIM_PROPOSAL_STAGE = '168290366'
const EARLY_STAGES = ['168290363', '168290364', '168290365']

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const role = (session.user as any).role
  if (role === 'dealer') return new Response('Forbidden', { status: 403 })

  try {
    const quote = await prisma.quote.findUnique({ where: { id: params.id } })
    if (!quote) return Response.json({ error: 'Quote not found' }, { status: 404 })
    if (quote.status !== 'PENDING_APPROVAL') {
      return Response.json({ error: 'Quote is not pending approval' }, { status: 400 })
    }

    const lineItems: LineItem[] = JSON.parse(quote.lineItemsJson)
    const expirationDate = Date.now() + 30 * 86400000

    // 1. Create HubSpot Quote
    const hsQuote = await createHubSpotQuote({
      hs_title: `${quote.quoteNumber} — ${quote.company} — ${quote.machineModel}`,
      hs_expiration_date: expirationDate,
      hs_status: 'DRAFT',
      hs_currency: 'USD',
      hs_language: 'en',
      hs_sender_company_name: 'Cutlite America, LLC',
      hs_sender_company_address: '1075 Windward Ridge Parkway, Suite 120',
      hs_sender_company_city: 'Alpharetta',
      hs_sender_company_state: 'GA',
      hs_sender_company_zip: '30005',
      hs_sender_company_country: 'United States',
    })

    await new Promise((r) => setTimeout(r, 100))

    // 2. Associate quote → deal
    try {
      await associateObjects('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 64)
    } catch {
      try {
        await associateV3('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 'quote_to_deal')
      } catch {
        console.error('quote→deal association failed')
      }
    }

    await new Promise((r) => setTimeout(r, 100))

    // 3. Create line items and associate
    for (const item of lineItems) {
      const lineItem = await createLineItem({
        name: item.description,
        quantity: item.qty,
        price: item.unitPrice,
        amount: item.amount,
        description: item.detail,
      })
      await new Promise((r) => setTimeout(r, 100))
      try {
        await associateObjects('line_items', lineItem.id, 'quotes', hsQuote.id, 67)
      } catch {
        try {
          await associateV3('line_items', lineItem.id, 'quotes', hsQuote.id, 'line_item_to_quote')
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 100))
    }

    // 4. Advance deal stage if early
    try {
      const deal = await getDeal(quote.hubspotDealId)
      if (EARLY_STAGES.includes(deal.properties.dealstage)) {
        await updateDeal(quote.hubspotDealId, { dealstage: PRELIM_PROPOSAL_STAGE })
        await new Promise((r) => setTimeout(r, 100))
      }
    } catch {}

    // 5. Log approval note
    const noteBody = [
      `Quote ${quote.quoteNumber} APPROVED by ${session.user?.email}`,
      `Package: ${quote.tier} — ${quote.packageName}`,
      `Total: $${quote.totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      quote.submittedByDealer ? `Originally submitted by dealer: ${quote.submittedByDealer}` : '',
    ].filter(Boolean).join('\n')

    const note = await createNote(noteBody)
    await new Promise((r) => setTimeout(r, 100))
    try {
      await associateObjects('notes', note.id, 'deals', quote.hubspotDealId, 214)
    } catch {
      try { await associateV3('notes', note.id, 'deals', quote.hubspotDealId, 'note_to_deal') } catch {}
    }

    // 6. Update local DB
    const updated = await prisma.quote.update({
      where: { id: params.id },
      data: { hubspotQuoteId: hsQuote.id, status: 'PUBLISHED' },
    })

    return Response.json({
      success: true,
      hubspotQuoteId: hsQuote.id,
      dealLink: `https://app.hubspot.com/contacts/45270912/record/0-3/${quote.hubspotDealId}`,
      quote: updated,
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

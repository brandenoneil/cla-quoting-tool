import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createHubSpotQuote,
  associateObjects,
  createLineItem,
  updateDeal,
  createNote,
  associateV3,
} from '@/lib/hubspot'
import { NextRequest } from 'next/server'
import type { LineItem } from '@/types'

const PRELIM_PROPOSAL_STAGE = '168290366'
const EARLY_STAGES = ['168290363', '168290364', '168290365']

function isEarlierThanPrelim(stage: string): boolean {
  return EARLY_STAGES.includes(stage)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if ((session.user as any).role === 'dealer') return new Response('Forbidden', { status: 403 })

  const { quoteId, templateId } = await req.json()

  try {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId } })
    if (!quote) return Response.json({ error: 'Quote not found' }, { status: 404 })

    const lineItems: LineItem[] = JSON.parse(quote.lineItemsJson)
    const expirationDate = Date.now() + 30 * 86400000

    // 1. Create HubSpot Quote
    // Note: templates are linked via association AFTER creation, not via a property
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

    // 1b. Associate template → quote (non-critical — fails silently if type ID is wrong)
    if (templateId) {
      try {
        await associateObjects('quotes', hsQuote.id, 'quote_templates', templateId, '286')
      } catch {
        try {
          await associateV3('quotes', hsQuote.id, 'quote_templates', templateId, 'quote_to_quote_template')
        } catch {
          // Template association not supported via API for this portal — rep applies manually in HubSpot
        }
      }
      await new Promise((r) => setTimeout(r, 100))
    }

    // 2. Associate quote → deal
    // Type 64 = QUOTE_TO_DEAL (63 is the reverse: DEAL_TO_QUOTE)
    try {
      await associateObjects('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 64)
    } catch {
      try {
        await associateV3('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 'quote_to_deal')
      } catch {
        console.error('quote→deal association failed on both v4 and v3')
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

      // Type 67 = LINE_ITEM_TO_QUOTE
      try {
        await associateObjects('line_items', lineItem.id, 'quotes', hsQuote.id, 67)
      } catch {
        try {
          await associateV3('line_items', lineItem.id, 'quotes', hsQuote.id, 'line_item_to_quote')
        } catch {
          console.error('line_item→quote association failed on both v4 and v3')
        }
      }

      await new Promise((r) => setTimeout(r, 100))
    }

    // 4. Advance deal stage if currently early
    try {
      const { getDeal } = await import('@/lib/hubspot')
      const deal = await getDeal(quote.hubspotDealId)
      if (isEarlierThanPrelim(deal.properties.dealstage)) {
        await updateDeal(quote.hubspotDealId, { dealstage: PRELIM_PROPOSAL_STAGE })
        await new Promise((r) => setTimeout(r, 100))
      }
    } catch {
      // Non-critical
    }

    // 5. Log note on deal
    const noteBody = `Quote ${quote.quoteNumber} generated via Quote Builder\nPackage: ${quote.tier}\nTotal: $${quote.totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}\nPrepared by: ${session.user?.email}`
    const note = await createNote(noteBody)
    await new Promise((r) => setTimeout(r, 100))

    // Type 214 = NOTE_TO_DEAL
    try {
      await associateObjects('notes', note.id, 'deals', quote.hubspotDealId, 214)
    } catch {
      try {
        await associateV3('notes', note.id, 'deals', quote.hubspotDealId, 'note_to_deal')
      } catch {
        console.error('note→deal association failed on both v4 and v3')
      }
    }

    // 6. Update local DB
    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: { hubspotQuoteId: hsQuote.id, status: 'PUBLISHED' },
    })

    return Response.json({
      success: true,
      hubspotQuoteId: hsQuote.id,
      dealLink: `https://app.hubspot.com/contacts/45270912/record/0-3/${quote.hubspotDealId}`,
      templateId: templateId ?? null,
      quote: updated,
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

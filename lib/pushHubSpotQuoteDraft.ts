import { prisma } from '@/lib/prisma'
import {
  createHubSpotQuote,
  createLineItem,
  associateObjects,
  associateV3,
  associateQuoteTemplate,
  fetchQuoteTemplates,
  type QuoteTemplate,
} from '@/lib/hubspot'
import { suggestTemplate } from '@/lib/templateMatcher'

const SENDER_PROPS = {
  hs_currency: 'USD',
  hs_language: 'en',
  hs_sender_company_name: 'Cutlite America, LLC',
  hs_sender_company_address: '1075 Windward Ridge Parkway, Suite 120',
  hs_sender_company_city: 'Alpharetta',
  hs_sender_company_state: 'GA',
  hs_sender_company_zip: '30005',
  hs_sender_company_country: 'United States',
} as const

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function resolveTemplateId(
  machineModel: string,
  templates: QuoteTemplate[],
  overrideId?: string | null,
  companyName?: string
): string | null {
  if (overrideId) return overrideId
  return suggestTemplate(machineModel, templates, companyName)?.id ?? null
}

/**
 * Creates a HubSpot DRAFT quote on the deal with line items and an optional quote template.
 */
export async function pushQuoteDraftToHubSpot(
  quoteId: string,
  options?: {
    templateId?: string | null
    templates?: QuoteTemplate[]
  }
): Promise<{ hubspotQuoteId: string; templateId: string | null }> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } })
  if (!quote) throw new Error(`Quote not found: ${quoteId}`)

  const templates = options?.templates ?? (await fetchQuoteTemplates())
  const templateId =
    options?.templateId ?? resolveTemplateId(quote.machineModel, templates, null, quote.company)

  const lineItems: Array<{
    description: string
    detail: string
    qty: number
    unitPrice: number
    amount: number
  }> = JSON.parse(quote.lineItemsJson)

  const expirationDate = Date.now() + 30 * 86400000

  const hsQuote = await createHubSpotQuote({
    hs_title: `${quote.quoteNumber} — ${quote.company} — ${quote.machineModel}`,
    hs_expiration_date: expirationDate,
    hs_status: 'DRAFT',
    ...SENDER_PROPS,
  })

  await delay(100)

  if (templateId) {
    await associateQuoteTemplate(hsQuote.id, templateId)
    await delay(100)
  }

  try {
    await associateObjects('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 64)
  } catch {
    try {
      await associateV3('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 'quote_to_deal')
    } catch {
      throw new Error('quote→deal association failed')
    }
  }

  await delay(100)

  const billableItems = lineItems.filter((item) => item.amount > 0 || item.unitPrice > 0)

  for (const item of billableItems) {
    const lineItem = await createLineItem({
      name: item.description,
      quantity: item.qty,
      price: item.unitPrice,
      amount: item.amount,
      description: item.detail,
    })

    await delay(100)

    try {
      await associateObjects('line_items', lineItem.id, 'quotes', hsQuote.id, 67)
    } catch {
      try {
        await associateV3('line_items', lineItem.id, 'quotes', hsQuote.id, 'line_item_to_quote')
      } catch {
        throw new Error('line_item→quote association failed')
      }
    }

    await delay(100)
  }

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      hubspotQuoteId: hsQuote.id,
      hubspotTemplateId: templateId,
    },
  })

  return { hubspotQuoteId: hsQuote.id, templateId }
}

/** Applies a template to an existing HubSpot quote (e.g. drafts created before templates were linked). */
export async function applyTemplateToExistingHubSpotQuote(
  hsQuoteId: string,
  templateId: string
): Promise<void> {
  await associateQuoteTemplate(hsQuoteId, templateId)
}

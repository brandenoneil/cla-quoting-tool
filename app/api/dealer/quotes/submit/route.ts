import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createDeal, fetchQuoteTemplates } from '@/lib/hubspot'
import { DEALER_PIPELINE_ID, getPrimarySalesOwnerId } from '@/lib/hubspotConfig'
import { notifySalesTeamOfDealerQuote } from '@/lib/notifySalesTeam'
import { lookupExactPrice, parseKw } from '@/lib/pricingTable'
import { pushQuoteDraftToHubSpot, resolveTemplateId } from '@/lib/pushHubSpotQuoteDraft'
import { NextRequest } from 'next/server'
import type { QuoteOption } from '@/types'

const OPPORTUNITY_QUALIFIED_STAGE = '168290363'

function generateQuoteNumber(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `CLA-${year}-${rand}`
}

async function saveOneOption(
  option: QuoteOption,
  formData: any,
  dealId: string,
  dealName: string,
  dealerEmail: string,
  dealerCompany: string
) {
  let quoteNumber = generateQuoteNumber()
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.quote.findUnique({ where: { quoteNumber } })
    if (!existing) break
    quoteNumber = generateQuoteNumber()
  }

  return prisma.quote.create({
    data: {
      quoteNumber,
      hubspotDealId: dealId,
      hubspotDealName: dealName,
      company: formData.company,
      contactName: formData.contactName,
      contactEmail: formData.contactEmail,
      contactPhone: formData.contactPhone || '',
      machineModel: option.machineModel || '',
      machinePower: option.machinePower || '',
      laserSource: option.laserSource || '',
      bevelHead: option.bevelHead || 'No',
      deliveryWeeks: option.deliveryWeeks,
      tier: option.machineLabel || 'Option A',
      packageName: option.name,
      lineItemsJson: JSON.stringify(option.lineItems),
      subtotal: option.subtotal,
      discountAmount: option.discountAmount,
      freight: option.freight,
      totalAmount: option.totalPrice,
      status: 'PENDING_APPROVAL',
      notes: formData.notes || '',
      createdBy: dealerEmail,
      submittedByDealer: dealerEmail,
      dealerCompany,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if ((session.user as any).role !== 'dealer') {
    return new Response('Forbidden', { status: 403 })
  }

  const { formData, selectedOptions } = await req.json()
  const options: QuoteOption[] = selectedOptions ?? []
  if (options.length === 0) {
    return Response.json({ error: 'No options provided' }, { status: 400 })
  }

  const dealerEmail = session.user?.email || 'unknown'
  const dealerName = session.user?.name || dealerEmail
  const dealerCompany = (session.user as any)?.dealerCompany || ''
  const primaryOption = options[0]
  const dealName = `${formData.company} - ${primaryOption.machineModel}`
  const primaryOwnerId = getPrimarySalesOwnerId()

  const hsDeal = await createDeal({
    dealname: dealName,
    pipeline: DEALER_PIPELINE_ID,
    dealstage: OPPORTUNITY_QUALIFIED_STAGE,
    amount: String(Math.round(options.reduce((s, o) => s + o.totalPrice, 0) / options.length)),
    ...(primaryOwnerId ? { hubspot_owner_id: primaryOwnerId } : {}),
    ...(dealerCompany ? { dealer_company: dealerCompany } : {}),
  })
  const dealId = hsDeal.id

  await new Promise((r) => setTimeout(r, 150))

  const quotes = await Promise.all(
    options.map((opt) => saveOneOption(opt, formData, dealId, dealName, dealerEmail, dealerCompany))
  )

  const hubspotDraftErrors: string[] = []
  const pushedDrafts: Array<{
    quoteId: string
    quoteNumber: string
    hubspotQuoteId: string
    templateId: string | null
  }> = []

  let templates: Awaited<ReturnType<typeof fetchQuoteTemplates>> = []
  try {
    templates = await fetchQuoteTemplates()
  } catch (err: any) {
    hubspotDraftErrors.push(`Could not load HubSpot templates: ${err?.message ?? 'unknown error'}`)
  }

  for (const q of quotes) {
    try {
      const templateId = resolveTemplateId(q.machineModel, templates, null, formData.company)
      if (!templateId && templates.length > 0) {
        hubspotDraftErrors.push(
          `${q.quoteNumber}: no HubSpot template matched "${q.machineModel}" — quote pushed without template`
        )
      }

      const { hubspotQuoteId, templateId: appliedTemplateId } = await pushQuoteDraftToHubSpot(q.id, {
        templateId,
        templates,
      })
      pushedDrafts.push({
        quoteId: q.id,
        quoteNumber: q.quoteNumber,
        hubspotQuoteId,
        templateId: appliedTemplateId,
      })
    } catch (err: any) {
      hubspotDraftErrors.push(`${q.quoteNumber}: ${err?.message ?? 'Draft push failed'}`)
    }
  }

  const alertOptions = options.map((o, i) => {
    const kw = parseKw(o.machinePower)
    const customPricing = !lookupExactPrice(o.machineModel, o.laserSource, kw)
    const pushed = pushedDrafts.find((p) => p.quoteNumber === quotes[i]?.quoteNumber)
    return {
      machineLabel: o.machineLabel,
      machineModel: o.machineModel,
      machinePower: o.machinePower,
      name: o.name,
      totalPrice: o.totalPrice,
      quoteNumber: quotes[i]?.quoteNumber ?? '',
      hubspotQuoteId: pushed?.hubspotQuoteId ?? null,
      customPricing,
    }
  })

  try {
    await notifySalesTeamOfDealerQuote({
      dealId,
      dealName,
      dealerName,
      dealerEmail,
      dealerCompany,
      customerCompany: formData.company,
      contactName: formData.contactName,
      contactEmail: formData.contactEmail,
      options: alertOptions,
      hubspotDraftErrors,
    })
  } catch {
    /* non-fatal */
  }

  return Response.json({
    quotes: await prisma.quote.findMany({ where: { id: { in: quotes.map((q) => q.id) } } }),
    dealId,
    dealName,
    hubspotDraftsCreated: pushedDrafts.length,
    hubspotDraftErrors,
    templatesApplied: pushedDrafts.filter((p) => p.templateId).length,
  })
}

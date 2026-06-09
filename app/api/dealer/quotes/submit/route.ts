import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPendingHubSpotDealId } from '@/lib/dealerHubSpotDeal'
import { notifySalesTeamOfDealerQuote } from '@/lib/notifySalesTeam'
import { lookupExactPrice, parseKw } from '@/lib/pricingTable'
import { NextRequest } from 'next/server'
import type { QuoteOption } from '@/types'

export const maxDuration = 60

function generateQuoteNumber(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `CLA-${year}-${rand}`
}

async function saveOneOption(
  option: QuoteOption,
  formData: any,
  pendingDealId: string,
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
      hubspotDealId: pendingDealId,
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
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if ((session.user as any).role !== 'dealer') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
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
    const pendingDealId = createPendingHubSpotDealId()

    const quotes = await Promise.all(
      options.map((opt) =>
        saveOneOption(opt, formData, pendingDealId, dealName, dealerEmail, dealerCompany)
      )
    )

    const appBase = (process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
    const quoteReviewUrl = appBase ? `${appBase}/quotes/${quotes[0]!.id}` : undefined

    const alertOptions = options.map((o, i) => {
      const kw = parseKw(o.machinePower)
      const customPricing = !lookupExactPrice(o.machineModel, o.laserSource, kw)
      return {
        machineLabel: o.machineLabel,
        machineModel: o.machineModel,
        machinePower: o.machinePower,
        name: o.name,
        totalPrice: o.totalPrice,
        quoteNumber: quotes[i]?.quoteNumber ?? '',
        hubspotQuoteId: null,
        customPricing,
      }
    })

    try {
      await notifySalesTeamOfDealerQuote({
        dealName,
        dealerName,
        dealerEmail,
        dealerCompany,
        customerCompany: formData.company,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        options: alertOptions,
        quoteReviewUrl,
      })
    } catch {
      /* non-fatal — quote is saved locally for the sales queue */
    }

    return Response.json({
      quotes: await prisma.quote.findMany({ where: { id: { in: quotes.map((q) => q.id) } } }),
      dealName,
      hubspotDraftsCreated: 0,
      hubspotDraftErrors: [],
      templatesApplied: 0,
    })
  } catch (err: any) {
    console.error('[dealer/quotes/submit]', err)
    return Response.json(
      { error: err?.message ?? 'Failed to submit quote request' },
      { status: 500 }
    )
  }
}

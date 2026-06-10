import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createDealerHubSpotDeal } from '@/lib/dealerHubSpotDeal'
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
    const avgAmount = Math.round(
      options.reduce((s, o) => s + o.totalPrice, 0) / options.length
    )

    let hubspotSetup: Awaited<ReturnType<typeof createDealerHubSpotDeal>>
    try {
      hubspotSetup = await createDealerHubSpotDeal({
        dealName,
        amount: avgAmount,
        dealerCompany,
        customerCompany: formData.company,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
      })
    } catch (err: any) {
      return Response.json(
        {
          error:
            err?.message ??
            'Could not create HubSpot deal. Check HubSpot configuration and try again.',
        },
        { status: 502 }
      )
    }

    const dealId = hubspotSetup.dealId
    const hubspotDraftErrors: string[] = [...hubspotSetup.associationWarnings]

    if (hubspotSetup.ownerAssignmentSkipped) {
      console.warn('[dealer/quotes/submit] Jess Moon was not assigned as deal owner', {
        dealId,
        skippedProperties: hubspotSetup.skippedProperties,
      })
    }

    console.info('[dealer/quotes/submit] HubSpot deal created', {
      dealId,
      dealUrl: hubspotSetup.dealUrl,
      ownerAssignmentSkipped: hubspotSetup.ownerAssignmentSkipped,
    })

    await new Promise((r) => setTimeout(r, 150))

    const quotes = await Promise.all(
      options.map((opt) =>
        saveOneOption(opt, formData, dealId, dealName, dealerEmail, dealerCompany)
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
        dealId,
        dealName,
        dealerName,
        dealerEmail,
        dealerCompany,
        customerCompany: formData.company,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        options: alertOptions,
        quoteReviewUrl,
        hubspotDraftErrors,
      })
    } catch {
      /* non-fatal — quote is saved and deal exists in HubSpot */
    }

    return Response.json({
      quotes: await prisma.quote.findMany({ where: { id: { in: quotes.map((q) => q.id) } } }),
      dealId,
      dealName,
      hubspotDealUrl: hubspotSetup.dealUrl,
      hubspotDraftsCreated: 0,
      hubspotDraftErrors,
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

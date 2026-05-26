import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'
import type { QuoteOption } from '@/types'

function generateQuoteNumber(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `CLA-${year}-${rand}`
}

async function saveOneOption(
  option: QuoteOption,
  formData: any,
  dealContext: any,
  createdBy: string
) {
  // Unique quote number with collision retry
  let quoteNumber = generateQuoteNumber()
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.quote.findUnique({ where: { quoteNumber } })
    if (!existing) break
    quoteNumber = generateQuoteNumber()
  }

  return prisma.quote.create({
    data: {
      quoteNumber,
      hubspotDealId: dealContext.dealId,
      hubspotDealName: dealContext.dealName,
      company: formData.company,
      contactName: formData.contactName,
      contactEmail: formData.contactEmail,
      contactPhone: formData.contactPhone || '',
      machineModel: option.machineModel || formData.machines?.[0]?.machineModel || '',
      machinePower: option.machinePower || formData.machines?.[0]?.machinePower || '',
      laserSource: option.laserSource || formData.machines?.[0]?.laserSource || '',
      bevelHead: option.bevelHead || formData.machines?.[0]?.bevelHead || 'None',
      deliveryWeeks: option.deliveryWeeks,
      tier: option.machineLabel || 'Option A',
      packageName: option.name,
      lineItemsJson: JSON.stringify(option.lineItems),
      subtotal: option.subtotal,
      discountAmount: option.discountAmount,
      freight: option.freight,
      totalAmount: option.totalPrice,
      status: 'DRAFT',
      notes: formData.notes || '',
      createdBy,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if ((session.user as any).role === 'dealer') return new Response('Forbidden', { status: 403 })

  const { formData, selectedOption, selectedOptions, dealContext } = await req.json()
  const createdBy = session.user?.email || 'unknown'

  // Support both single (legacy) and multi-option saves
  const options: QuoteOption[] = selectedOptions ?? (selectedOption ? [selectedOption] : [])
  if (options.length === 0) return Response.json({ error: 'No options provided' }, { status: 400 })

  const quotes = await Promise.all(
    options.map(opt => saveOneOption(opt, formData, dealContext, createdBy))
  )

  // Return first quote for backward-compat, plus full array
  return Response.json({ quote: quotes[0], quotes })
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if ((session.user as any).role === 'dealer') return new Response('Forbidden', { status: 403 })

  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return Response.json({ quotes })
}

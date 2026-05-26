import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteHubSpotQuote } from '@/lib/hubspot'
import { NextRequest } from 'next/server'
import type { LineItem } from '@/types'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) return Response.json({ error: 'Not found' }, { status: 404 })

  // Dealers can only retrieve their own submitted quotes
  const email = session.user?.email
  if ((session.user as any).role === 'dealer' && quote.submittedByDealer !== email) {
    return new Response('Forbidden', { status: 403 })
  }

  return Response.json({ quote })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if ((session.user as any).role === 'dealer') return new Response('Forbidden', { status: 403 })

  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const {
    company, contactName, contactEmail, contactPhone,
    machineModel, machinePower, laserSource, bevelHead, deliveryWeeks,
    lineItems, discountAmount, notes,
  } = body

  const items: LineItem[] = lineItems ?? []

  // Recompute totals from line items
  const subtotal = items
    .filter((i) => !i.included)
    .reduce((sum, i) => sum + i.amount, 0)
  const freight = subtotal > 0 ? Math.round(subtotal * 0.025 * 100) / 100 : 0
  const totalAmount = subtotal - (discountAmount ?? 0) + freight

  const updated = await prisma.quote.update({
    where: { id: params.id },
    data: {
      company,
      contactName,
      contactEmail,
      contactPhone: contactPhone ?? '',
      machineModel,
      machinePower,
      laserSource,
      bevelHead,
      deliveryWeeks: Number(deliveryWeeks),
      lineItemsJson: JSON.stringify(items),
      subtotal,
      discountAmount: discountAmount ?? 0,
      freight,
      totalAmount,
      notes: notes ?? '',
    },
  })

  return Response.json({ quote: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if ((session.user as any).role === 'dealer') return new Response('Forbidden', { status: 403 })

  const quote = await prisma.quote.findUnique({ where: { id: params.id } })
  if (!quote) return Response.json({ error: 'Not found' }, { status: 404 })

  // If published, delete from HubSpot first
  if (quote.hubspotQuoteId) {
    try {
      await deleteHubSpotQuote(quote.hubspotQuoteId)
    } catch (err: any) {
      // Return the error — don't delete locally if HubSpot delete failed
      return Response.json({ error: `HubSpot delete failed: ${err.message}` }, { status: 502 })
    }
  }

  await prisma.quote.delete({ where: { id: params.id } })
  return Response.json({ success: true })
}

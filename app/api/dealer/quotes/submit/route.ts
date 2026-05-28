import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createDeal,
  createNote,
  createTask,
  createHubSpotQuote,
  createLineItem,
  associateObjects,
  associateV3,
} from '@/lib/hubspot'
import { NextRequest } from 'next/server'
import type { QuoteOption } from '@/types'

const OPPORTUNITY_QUALIFIED_STAGE = '168290363'
const PIPELINE_ID = '90932330'

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
      bevelHead: option.bevelHead || 'None',
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

async function pushDraftQuoteToHubSpot(quoteId: string): Promise<string> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } })
  if (!quote) throw new Error(`Quote not found: ${quoteId}`)

  const lineItems: Array<{ description: string; detail: string; qty: number; unitPrice: number; amount: number }> =
    JSON.parse(quote.lineItemsJson)

  const expirationDate = Date.now() + 30 * 86400000

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

  // Type 64 = QUOTE_TO_DEAL
  try {
    await associateObjects('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 64)
  } catch {
    try {
      await associateV3('quotes', hsQuote.id, 'deals', quote.hubspotDealId, 'quote_to_deal')
    } catch {
      throw new Error('quote→deal association failed')
    }
  }

  await new Promise((r) => setTimeout(r, 100))

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
        throw new Error('line_item→quote association failed')
      }
    }

    await new Promise((r) => setTimeout(r, 100))
  }

  await prisma.quote.update({
    where: { id: quote.id },
    data: { hubspotQuoteId: hsQuote.id },
  })

  return hsQuote.id
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

  // 1. Create HubSpot deal
  const hsDeal = await createDeal({
    dealname: dealName,
    pipeline: PIPELINE_ID,
    dealstage: OPPORTUNITY_QUALIFIED_STAGE,
    amount: String(Math.round(options.reduce((s, o) => s + o.totalPrice, 0) / options.length)),
  })
  const dealId = hsDeal.id

  await new Promise((r) => setTimeout(r, 150))

  // 2. Create a note on the deal with dealer details
  const noteBody = [
    `Quote request submitted via dealer portal`,
    `Dealer: ${dealerName} (${dealerEmail})${dealerCompany ? ` — ${dealerCompany}` : ''}`,
    `Customer: ${formData.company} · ${formData.contactName} · ${formData.contactEmail}`,
    `Machine(s): ${options.map(o => `${o.machineModel} ${o.machinePower} — ${o.name}`).join(', ')}`,
    `Options: ${options.length} (${options.map(o => o.machineLabel).join(', ')})`,
  ].join('\n')

  const note = await createNote(noteBody)
  await new Promise((r) => setTimeout(r, 100))

  try {
    await associateObjects('notes', note.id, 'deals', dealId, 214)
  } catch {
    try { await associateV3('notes', note.id, 'deals', dealId, 'note_to_deal') } catch {}
  }

  await new Promise((r) => setTimeout(r, 100))

  // 3. Create an action task for the internal team
  const taskSubject = `Review quote request: ${formData.company} — ${primaryOption.machineModel}`
  const taskBody = [
    `Dealer ${dealerName} submitted a quote request.`,
    `Customer: ${formData.company} (${formData.contactName})`,
    `Requested: ${options.map(o => `${o.machineLabel} ${o.machineModel} ${o.machinePower} = $${Math.round(o.totalPrice).toLocaleString()}`).join(' | ')}`,
    `Open the deal to review and approve the generated quote.`,
  ].join('\n')

  const task = await createTask(taskSubject, taskBody, 'HIGH')
  await new Promise((r) => setTimeout(r, 100))

  try {
    await associateObjects('tasks', task.id, 'deals', dealId, 216)
  } catch {
    try { await associateV3('tasks', task.id, 'deals', dealId, 'task_to_deal') } catch {}
  }

  await new Promise((r) => setTimeout(r, 100))

  // 4. Save all quote options to DB
  const quotes = await Promise.all(
    options.map(opt => saveOneOption(opt, formData, dealId, dealName, dealerEmail, dealerCompany))
  )

  // 5. Immediately push each saved quote option into HubSpot as DRAFT for inside-sales review.
  const hubspotDraftErrors: string[] = []
  const pushedDrafts: Array<{ quoteId: string; quoteNumber: string; hubspotQuoteId: string }> = []

  for (const q of quotes) {
    try {
      const hubspotQuoteId = await pushDraftQuoteToHubSpot(q.id)
      pushedDrafts.push({ quoteId: q.id, quoteNumber: q.quoteNumber, hubspotQuoteId })
    } catch (err: any) {
      hubspotDraftErrors.push(`${q.quoteNumber}: ${err?.message ?? 'Draft push failed'}`)
    }
  }

  // 6. Add result note on the deal for internal visibility
  const pushSummaryBody = [
    `Dealer request quote push summary`,
    `Draft quotes created in HubSpot: ${pushedDrafts.length}/${quotes.length}`,
    ...(hubspotDraftErrors.length ? [`Errors: ${hubspotDraftErrors.join(' | ')}`] : []),
  ].join('\n')
  try {
    const pushSummaryNote = await createNote(pushSummaryBody)
    await new Promise((r) => setTimeout(r, 100))
    try {
      await associateObjects('notes', pushSummaryNote.id, 'deals', dealId, 214)
    } catch {
      try { await associateV3('notes', pushSummaryNote.id, 'deals', dealId, 'note_to_deal') } catch {}
    }
  } catch {
    // non-fatal
  }

  return Response.json({
    quotes: await prisma.quote.findMany({ where: { id: { in: quotes.map((q) => q.id) } } }),
    dealId,
    dealName,
    hubspotDraftsCreated: pushedDrafts.length,
    hubspotDraftErrors,
  })
}

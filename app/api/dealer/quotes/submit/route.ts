import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createDeal,
  createNote,
  createTask,
  associateObjects,
  associateV3,
  fetchQuoteTemplates,
} from '@/lib/hubspot'
import { pushQuoteDraftToHubSpot, resolveTemplateId } from '@/lib/pushHubSpotQuoteDraft'
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if ((session.user as any).role !== 'dealer') {
    return new Response('Forbidden', { status: 403 })
  }

  const { formData, selectedOptions, templateId: sharedTemplateId } = await req.json()
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

  // 5. Push each quote to HubSpot with line items + matching quote template
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
      const templateId = sharedTemplateId || resolveTemplateId(q.machineModel, templates)
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

  // 6. Add result note on the deal for internal visibility
  const templateSummary = pushedDrafts
    .map((p) => {
      const tmpl = templates.find((t) => t.id === p.templateId)
      return `${p.quoteNumber}${tmpl ? ` (${tmpl.name})` : ''}`
    })
    .join(', ')

  const pushSummaryBody = [
    `Dealer request quote push summary`,
    `Draft quotes created in HubSpot: ${pushedDrafts.length}/${quotes.length}`,
    templateSummary ? `Templates: ${templateSummary}` : '',
    ...(hubspotDraftErrors.length ? [`Warnings: ${hubspotDraftErrors.join(' | ')}`] : []),
  ]
    .filter(Boolean)
    .join('\n')

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
    templatesApplied: pushedDrafts.filter((p) => p.templateId).length,
  })
}

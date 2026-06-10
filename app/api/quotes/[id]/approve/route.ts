import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  ensureHubSpotDealForDealerQuote,
  PRELIM_PROPOSAL_STAGE,
} from '@/lib/dealerHubSpotDeal'
import {
  associateObjects,
  associateV3,
  createNote,
  fetchQuoteTemplates,
  getDeal,
  updateDeal,
} from '@/lib/hubspot'
import { hubspotDealUrl } from '@/lib/hubspotConfig'
import {
  applyTemplateToExistingHubSpotQuote,
  pushQuoteDraftToHubSpot,
  resolveTemplateId,
} from '@/lib/pushHubSpotQuoteDraft'
import { NextRequest } from 'next/server'

const EARLY_STAGES = ['168290363', '168290364', '168290365']

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const role = (session.user as any).role
  if (role === 'dealer') return new Response('Forbidden', { status: 403 })

  try {
    let quote = await prisma.quote.findUnique({ where: { id: params.id } })
    if (!quote) return Response.json({ error: 'Quote not found' }, { status: 404 })

    const approvableStatuses = ['PENDING_APPROVAL', 'REVIEWING']
    if (!approvableStatuses.includes(quote.status)) {
      return Response.json(
        { error: `Quote cannot be approved from status "${quote.status}".` },
        { status: 400 }
      )
    }

    const hubspotDealId = await ensureHubSpotDealForDealerQuote(quote)
    quote = await prisma.quote.findUniqueOrThrow({ where: { id: params.id } })

    let hsQuoteId = quote.hubspotQuoteId ?? null
    const alreadyInHubSpot = Boolean(hsQuoteId)

    if (alreadyInHubSpot && hsQuoteId) {
      const updated = await prisma.quote.update({
        where: { id: params.id },
        data: { status: 'PUBLISHED' },
      })
      return Response.json({
        success: true,
        hubspotQuoteId: hsQuoteId,
        dealLink: hubspotDealUrl(hubspotDealId),
        quote: updated,
      })
    }

    let templates: Awaited<ReturnType<typeof fetchQuoteTemplates>> = []
    try {
      templates = await fetchQuoteTemplates()
    } catch {
      /* non-fatal */
    }
    const templateId =
      quote.hubspotTemplateId ||
      resolveTemplateId(quote.machineModel, templates, null, quote.company)

    if (!hsQuoteId) {
      const pushed = await pushQuoteDraftToHubSpot(quote.id, { templateId, templates })
      hsQuoteId = pushed.hubspotQuoteId
    } else if (templateId && !quote.hubspotTemplateId) {
      try {
        await applyTemplateToExistingHubSpotQuote(hsQuoteId, templateId)
        await new Promise((r) => setTimeout(r, 100))
      } catch {
        console.error('quote→template association failed on existing HubSpot quote')
      }
    }

    try {
      const deal = await getDeal(hubspotDealId)
      if (EARLY_STAGES.includes(deal.properties.dealstage)) {
        await updateDeal(hubspotDealId, { dealstage: PRELIM_PROPOSAL_STAGE })
        await new Promise((r) => setTimeout(r, 100))
      }
    } catch {}

    const noteBody = [
      alreadyInHubSpot
        ? `Quote ${quote.quoteNumber} APPROVED by ${session.user?.email} (HubSpot draft was already on deal).`
        : `Quote ${quote.quoteNumber} APPROVED — quote published to HubSpot deal by ${session.user?.email}`,
      `Package: ${quote.tier} — ${quote.packageName}`,
      `Total: $${quote.totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      quote.submittedByDealer ? `Originally submitted by dealer: ${quote.submittedByDealer}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const note = await createNote(noteBody)
    await new Promise((r) => setTimeout(r, 100))
    try {
      await associateObjects('notes', note.id, 'deals', hubspotDealId, 214)
    } catch {
      try {
        await associateV3('notes', note.id, 'deals', hubspotDealId, 'note_to_deal')
      } catch {}
    }

    const updated = await prisma.quote.update({
      where: { id: params.id },
      data: {
        hubspotQuoteId: hsQuoteId,
        hubspotTemplateId: templateId ?? quote.hubspotTemplateId,
        status: 'PUBLISHED',
      },
    })

    return Response.json({
      success: true,
      hubspotQuoteId: hsQuoteId,
      dealLink: hubspotDealUrl(hubspotDealId),
      quote: updated,
    })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

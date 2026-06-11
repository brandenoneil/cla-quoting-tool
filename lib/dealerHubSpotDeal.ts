import { prisma } from '@/lib/prisma'
import {
  assignJessMoonAsDealOwner,
  associateV3,
  createCompany,
  createContact,
  createDealResilient,
  getDeal,
  getJessMoonDealOwnerId,
  hubspotConfigured,
  searchCompanyByName,
  searchContactByEmail,
  updateDeal,
} from '@/lib/hubspot'
import { DEALER_PIPELINE_ID, hubspotDealUrl } from '@/lib/hubspotConfig'

export const OPPORTUNITY_QUALIFIED_STAGE = '168290363'
export const PRELIM_PROPOSAL_STAGE = '168290366'
export const PENDING_HUBSPOT_DEAL_PREFIX = 'pending:'

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function isPendingHubSpotDealId(dealId: string | null | undefined): boolean {
  return !dealId || dealId.startsWith(PENDING_HUBSPOT_DEAL_PREFIX)
}

export function createPendingHubSpotDealId(): string {
  return `${PENDING_HUBSPOT_DEAL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface DealerHubSpotDealInput {
  dealName: string
  amount: number
  /** Dealer org name (custom property dealer_company). */
  dealerCompany?: string
  /** Person who submitted the quote request (custom property dealer_rep). */
  dealerRep?: string
  customerCompany: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  /** Defaults to Opportunity Qualified; use Prelim Proposal when approving a dealer request. */
  dealstage?: string
}

export interface DealerHubSpotDealResult {
  dealId: string
  dealName: string
  dealUrl: string
  ownerAssignmentSkipped: boolean
  skippedProperties: string[]
  associationWarnings: string[]
}

/** Create a dealer deal in HubSpot with company + contact associations. Jess Moon is always deal owner. */
export async function createDealerHubSpotDeal(
  input: DealerHubSpotDealInput
): Promise<DealerHubSpotDealResult> {
  if (!hubspotConfigured()) {
    throw new Error(
      'HubSpot is not configured on the server. Set HUBSPOT_PRIVATE_APP_TOKEN in Vercel environment variables.'
    )
  }

  const jessOwnerId = await getJessMoonDealOwnerId()

  const dealProperties: Record<string, string | number> = {
    dealname: input.dealName,
    pipeline: DEALER_PIPELINE_ID,
    dealstage: input.dealstage ?? OPPORTUNITY_QUALIFIED_STAGE,
    amount: String(Math.round(input.amount)),
    closedate: new Date(Date.now() + 90 * 86400000).getTime(),
  }
  if (jessOwnerId) dealProperties.hubspot_owner_id = jessOwnerId
  if (input.dealerRep) dealProperties.dealer_rep = input.dealerRep
  if (input.dealerCompany) dealProperties.dealer_company = input.dealerCompany

  const { deal, ownerAssignmentSkipped, skippedProperties } =
    await createDealResilient(dealProperties)
  const dealId = deal.id

  let ownerAssigned = Boolean(jessOwnerId) && !ownerAssignmentSkipped
  if (!ownerAssigned) {
    ownerAssigned = await assignJessMoonAsDealOwner(dealId)
  }

  await delay(100)

  const associationWarnings: string[] = []

  try {
    let company = await searchCompanyByName(input.customerCompany)
    if (!company) {
      company = await createCompany({ name: input.customerCompany })
    }
    await delay(100)
    await associateV3('companies', company.id, 'deals', dealId, 'company_to_deal')
  } catch (err: any) {
    associationWarnings.push(
      `Could not link customer company "${input.customerCompany}" to the deal: ${err?.message ?? 'unknown error'}`
    )
  }

  if (input.contactEmail?.trim()) {
    try {
      let contact = await searchContactByEmail(input.contactEmail.trim())
      if (!contact) {
        const [firstName, ...rest] = (input.contactName || '').split(' ')
        contact = await createContact({
          firstname: firstName || '',
          lastname: rest.join(' ') || '',
          email: input.contactEmail.trim(),
          phone: input.contactPhone || '',
        })
      }
      await delay(100)
      await associateV3('contacts', contact.id, 'deals', dealId, 'contact_to_deal')
    } catch (err: any) {
      associationWarnings.push(
        `Could not link contact "${input.contactEmail}" to the deal: ${err?.message ?? 'unknown error'}`
      )
    }
  }

  try {
    await getDeal(dealId)
  } catch (err: any) {
    throw new Error(
      `HubSpot deal ${dealId} could not be verified after creation: ${err?.message ?? 'unknown error'}`
    )
  }

  return {
    dealId,
    dealName: input.dealName,
    dealUrl: hubspotDealUrl(dealId),
    ownerAssignmentSkipped: !ownerAssigned,
    skippedProperties,
    associationWarnings,
  }
}

export type DealerQuoteForHubSpot = {
  id: string
  hubspotDealId: string
  hubspotDealName: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string | null
  totalAmount: number
  dealerCompany: string | null
}

/** Create the HubSpot deal on first sales approval (dealer requests stay local until then). */
export async function ensureHubSpotDealForDealerQuote(
  quote: DealerQuoteForHubSpot
): Promise<string> {
  if (!isPendingHubSpotDealId(quote.hubspotDealId)) {
    await assignJessMoonAsDealOwner(quote.hubspotDealId)
    return quote.hubspotDealId
  }

  const setup = await createDealerHubSpotDeal({
    dealName: quote.hubspotDealName,
    amount: quote.totalAmount,
    dealerCompany: quote.dealerCompany ?? undefined,
    customerCompany: quote.company,
    contactName: quote.contactName,
    contactEmail: quote.contactEmail,
    contactPhone: quote.contactPhone ?? undefined,
    dealstage: PRELIM_PROPOSAL_STAGE,
  })

  await prisma.quote.updateMany({
    where: { hubspotDealId: quote.hubspotDealId },
    data: { hubspotDealId: setup.dealId },
  })

  try {
    await updateDeal(setup.dealId, { quote_tool_status: 'published' })
  } catch {
    /* custom property may not exist yet */
  }

  return setup.dealId
}

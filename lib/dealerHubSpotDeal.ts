import {
  associateV3,
  createCompany,
  createContact,
  createDealResilient,
  getDeal,
  hubspotConfigured,
  searchCompanyByName,
  searchContactByEmail,
} from '@/lib/hubspot'
import { DEALER_PIPELINE_ID, hubspotDealUrl } from '@/lib/hubspotConfig'

const OPPORTUNITY_QUALIFIED_STAGE = '168290363'

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export interface DealerHubSpotDealInput {
  dealName: string
  amount: number
  dealerCompany?: string
  primaryOwnerId?: string
  customerCompany: string
  contactName: string
  contactEmail: string
  contactPhone?: string
}

export interface DealerHubSpotDealResult {
  dealId: string
  dealName: string
  dealUrl: string
  ownerAssignmentSkipped: boolean
  skippedProperties: string[]
  associationWarnings: string[]
}

/** Create a dealer-request deal in HubSpot with company + contact associations. */
export async function createDealerHubSpotDeal(
  input: DealerHubSpotDealInput
): Promise<DealerHubSpotDealResult> {
  if (!hubspotConfigured()) {
    throw new Error(
      'HubSpot is not configured on the server. Set HUBSPOT_PRIVATE_APP_TOKEN in Vercel environment variables.'
    )
  }

  const dealProperties: Record<string, string | number> = {
    dealname: input.dealName,
    pipeline: DEALER_PIPELINE_ID,
    dealstage: OPPORTUNITY_QUALIFIED_STAGE,
    amount: String(Math.round(input.amount)),
    closedate: new Date(Date.now() + 90 * 86400000).getTime(),
  }
  if (input.primaryOwnerId) dealProperties.hubspot_owner_id = input.primaryOwnerId
  if (input.dealerCompany) dealProperties.dealer_company = input.dealerCompany

  const { deal, ownerAssignmentSkipped, skippedProperties } =
    await createDealResilient(dealProperties)
  const dealId = deal.id

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
    ownerAssignmentSkipped,
    skippedProperties,
    associationWarnings,
  }
}

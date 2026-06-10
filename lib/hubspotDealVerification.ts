import {
  getDeal,
  hubspotConfigured,
  listDealAssociationIds,
} from '@/lib/hubspot'
import {
  DEALER_PIPELINE_ID,
  hubspotDealUrl,
  JESS_MOON_DEAL_OWNER_ID,
} from '@/lib/hubspotConfig'
import { PRELIM_PROPOSAL_STAGE } from '@/lib/dealerHubSpotDeal'
import { STAGE_MAP } from '@/types'

export interface HubSpotVerificationCheck {
  id: string
  label: string
  passed: boolean
  detail: string
  critical: boolean
}

export interface HubSpotDealVerification {
  verified: boolean
  dealId: string
  dealName: string
  dealUrl: string
  checks: HubSpotVerificationCheck[]
}

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  critical = true
): HubSpotVerificationCheck {
  return { id, label, passed, detail, critical }
}

/** Re-read the deal from HubSpot and confirm it is ready for Jess to review and send. */
export async function verifyDealerSubmitHubSpotDeal(input: {
  dealId: string
  expectedDealName: string
  customerCompany?: string
  expectedQuoteCount?: number
  expectedDealAmount?: number
}): Promise<HubSpotDealVerification> {
  const dealUrl = hubspotDealUrl(input.dealId)
  const fail = (checks: HubSpotVerificationCheck[]): HubSpotDealVerification => ({
    verified: checks.filter((c) => c.critical).every((c) => c.passed),
    dealId: input.dealId,
    dealName: input.expectedDealName,
    dealUrl,
    checks,
  })

  if (!hubspotConfigured()) {
    return fail([
      check(
        'hubspot_configured',
        'CRM connection',
        false,
        'HubSpot is not configured on the server.',
      ),
    ])
  }

  const expectedOwnerId = process.env.HUBSPOT_JESS_OWNER_ID?.trim() || JESS_MOON_DEAL_OWNER_ID
  const expectedStageLabel = STAGE_MAP[PRELIM_PROPOSAL_STAGE]?.label ?? 'Prelim Proposal'
  const expectedQuotes = input.expectedQuoteCount ?? 1

  try {
    const [deal, contactIds, companyIds, quoteIds] = await Promise.all([
      getDeal(input.dealId),
      listDealAssociationIds(input.dealId, 'contacts'),
      listDealAssociationIds(input.dealId, 'companies'),
      listDealAssociationIds(input.dealId, 'quotes'),
    ])

    const props = deal.properties as Record<string, string | undefined>
    const pipeline = props.pipeline ?? ''
    const stage = props.dealstage ?? ''
    const ownerId = props.hubspot_owner_id ?? ''
    const dealName = props.dealname ?? ''
    const dealAmount = Math.round(Number(props.amount ?? 0))

    const checks: HubSpotVerificationCheck[] = [
      check('deal_found', 'Deal record found', true, `“${dealName || input.expectedDealName}” exists in HubSpot.`),
      check(
        'pipeline',
        'Correct sales pipeline',
        pipeline === DEALER_PIPELINE_ID,
        pipeline === DEALER_PIPELINE_ID
          ? 'Placed in the Cutlite sales pipeline.'
          : `Expected pipeline ${DEALER_PIPELINE_ID}; found ${pipeline || 'none'}.`
      ),
      check(
        'stage',
        'Ready for sales review',
        stage === PRELIM_PROPOSAL_STAGE,
        stage === PRELIM_PROPOSAL_STAGE
          ? `At “${expectedStageLabel}” — ready for Jess to review and send.`
          : `Expected “${expectedStageLabel}”; found ${STAGE_MAP[stage]?.label ?? (stage || 'unknown')}.`
      ),
      check(
        'owner',
        'Assigned to Cutlite sales',
        ownerId === expectedOwnerId,
        ownerId === expectedOwnerId
          ? 'Owned by Jess Moon (Cutlite sales).'
          : ownerId
            ? 'Deal owner does not match the expected Cutlite sales rep.'
            : 'No deal owner is assigned yet.'
      ),
      check(
        'quotes_linked',
        'Quote draft(s) on deal',
        quoteIds.length >= expectedQuotes,
        quoteIds.length >= expectedQuotes
          ? `${quoteIds.length} HubSpot quote draft${quoteIds.length === 1 ? '' : 's'} linked to the deal.`
          : `Expected ${expectedQuotes} quote draft(s); found ${quoteIds.length}.`
      ),
      ...(input.expectedDealAmount !== undefined
        ? [
            check(
              'deal_amount',
              'Deal amount',
              dealAmount === input.expectedDealAmount,
              input.expectedDealAmount === 0
                ? dealAmount === 0
                  ? '$0 — custom pricing; Jess will fill in the amount.'
                  : `Expected $0 for custom pricing; deal shows $${dealAmount.toLocaleString()}.`
                : dealAmount === input.expectedDealAmount
                  ? `$${dealAmount.toLocaleString()}.`
                  : `Expected $${input.expectedDealAmount.toLocaleString()}; deal shows $${dealAmount.toLocaleString()}.`
            ),
          ]
        : []),
      check(
        'deal_name',
        'Deal name matches request',
        dealName.trim() === input.expectedDealName.trim(),
        dealName.trim() === input.expectedDealName.trim()
          ? `“${dealName}”.`
          : `Expected “${input.expectedDealName}”; found “${dealName}”.`,
        false
      ),
      check(
        'company_linked',
        'Customer company linked',
        companyIds.length > 0,
        companyIds.length > 0
          ? input.customerCompany
            ? `Linked to ${input.customerCompany}.`
            : 'Company record is associated with the deal.'
          : 'No company is linked to this deal yet.',
        false
      ),
      check(
        'contact_linked',
        'Customer contact linked',
        contactIds.length > 0,
        contactIds.length > 0
          ? 'Contact record is associated with the deal.'
          : 'No contact is linked to this deal yet.',
        false
      ),
    ]

    return {
      verified: checks.filter((c) => c.critical).every((c) => c.passed),
      dealId: input.dealId,
      dealName: dealName || input.expectedDealName,
      dealUrl,
      checks,
    }
  } catch (err: any) {
    return fail([
      check(
        'deal_found',
        'Deal record found',
        false,
        err?.message ?? 'Could not read the deal back from HubSpot.',
      ),
    ])
  }
}

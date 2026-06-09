/** Cutlite America HubSpot portal — used for deal/quote deep links in alerts. */
export const HUBSPOT_PORTAL_ID = '45270912'

export const DEALER_PIPELINE_ID = '90932330'

/** Jess Moon — primary deal owner for all quoting-tool deals. */
export const JESS_MOON_DEAL_OWNER_ID = '77000806'

/** John Quinn — receives HubSpot tasks on dealer quote alerts (not deal co-owner). */
export const JOHN_QUINN_DEAL_OWNER_ID = '83328389'

export function hubspotDealUrl(dealId: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${dealId}`
}

export function hubspotQuoteUrl(quoteId: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-14/${quoteId}`
}

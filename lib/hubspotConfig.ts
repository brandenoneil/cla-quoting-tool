/** Cutlite America HubSpot portal — used for deal/quote deep links in alerts. */
export const HUBSPOT_PORTAL_ID = '45270912'

export const DEALER_PIPELINE_ID = '90932330'

/** Jess Moon / John Quinn — verify via GET /crm/v3/owners in your portal before setting env. */
export const DOCUMENTED_SALES_OWNER_IDS = ['96593046862', '158817869370'] as const

export function getSalesAlertOwnerIds(): string[] {
  const raw = process.env.SALES_ALERT_HUBSPOT_OWNER_IDS?.trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function getPrimarySalesOwnerId(): string | undefined {
  return getSalesAlertOwnerIds()[0]
}

export function hubspotDealUrl(dealId: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${dealId}`
}

export function hubspotQuoteUrl(quoteId: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-14/${quoteId}`
}

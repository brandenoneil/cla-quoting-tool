import { JESS_MOON_DEAL_OWNER_ID } from '@/lib/hubspotConfig'

const COMPANY_SENDER_PROPS = {
  hs_currency: 'USD',
  hs_language: 'en',
  hs_sender_company_name: 'Cutlite America, LLC',
  hs_sender_company_address: '1075 Windward Ridge Parkway, Suite 120',
  hs_sender_company_city: 'Alpharetta',
  hs_sender_company_state: 'GA',
  hs_sender_company_zip: '30005',
  hs_sender_company_country: 'United States',
} as const

/** Jess Moon — always the HubSpot quote sender (matches deal owner). */
export function getJessMoonQuoteSenderProps(): Record<string, string> {
  return {
    ...COMPANY_SENDER_PROPS,
    hs_quote_owner_id: JESS_MOON_DEAL_OWNER_ID,
    hs_sender_firstname: 'Jess',
    hs_sender_lastname: 'Moon',
    hs_sender_email:
      process.env.JESS_MOON_SENDER_EMAIL?.trim() || 'jmoon@cutliteamerica.com',
    hs_sender_phone: process.env.JESS_MOON_SENDER_PHONE?.trim() || '770-518-8800',
    hs_sender_jobtitle:
      process.env.JESS_MOON_SENDER_JOBTITLE?.trim() || 'Inside Sales Manager',
  }
}

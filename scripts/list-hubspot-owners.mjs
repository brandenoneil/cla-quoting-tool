#!/usr/bin/env node
/**
 * List HubSpot owners in your portal — use the `id` values for SALES_ALERT_HUBSPOT_OWNER_IDS.
 * First ID becomes the deal owner (Jess); second gets a task (John).
 *
 * Requires private app scope: crm.objects.owners.read
 *
 * If that scope is missing, set HUBSPOT_OWNER_LOOKUP_DEAL_ID to a deal id that already
 * has the correct owner assigned in HubSpot UI — the script will read hubspot_owner_id instead.
 *
 * Usage:
 *   npm run hubspot:list-owners
 *   HUBSPOT_OWNER_LOOKUP_DEAL_ID=123456789 npm run hubspot:list-owners
 */
import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim()
const LOOKUP_DEAL_ID = process.env.HUBSPOT_OWNER_LOOKUP_DEAL_ID?.trim()
const BASE = 'https://api.hubapi.com'

if (!TOKEN) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN')
  process.exit(1)
}

function printScopeHelp() {
  console.error(`
Your HubSpot private app token is missing the owners scope.

Fix (one time):
  1. HubSpot → Settings → Integrations → Private Apps → [your quoting tool app]
  2. Scopes tab → Add new scope → search "owners" → enable **crm.objects.owners.read**
  3. Save / Update the app, then copy the new access token into .env and Vercel
  4. Redeploy Vercel after updating HUBSPOT_PRIVATE_APP_TOKEN

Docs: https://developers.hubspot.com/docs/api-reference/crm/owners/v3

Workaround without adding scope:
  1. In HubSpot, open a deal and assign Jess Moon as deal owner (Save)
  2. Copy the deal id from the URL
  3. Run: HUBSPOT_OWNER_LOOKUP_DEAL_ID=<deal_id> npm run hubspot:list-owners
  Repeat with a John-owned deal to get his id, then set:
  SALES_ALERT_HUBSPOT_OWNER_IDS=<jess_id>,<john_id>
`)
}

async function hubspotGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  return { ok: res.ok, status: res.status, json, text }
}

async function listOwners() {
  const { ok, json, text } = await hubspotGet('/crm/v3/owners?limit=100&archived=false')
  if (!ok) {
    const missingScopes =
      json?.category === 'MISSING_SCOPES' ||
      text.includes('crm.objects.owners.read') ||
      text.includes('MISSING_SCOPES')

    if (missingScopes) {
      console.error('Failed to list owners: missing crm.objects.owners.read scope.')
      printScopeHelp()
      if (LOOKUP_DEAL_ID) {
        await lookupOwnerFromDeal(LOOKUP_DEAL_ID)
      }
      process.exit(1)
    }

    console.error('Failed to list owners:', text)
    process.exit(1)
  }
  return json.results ?? []
}

async function lookupOwnerFromDeal(dealId) {
  console.error(`\nTrying deal lookup for hubspot_owner_id (deal ${dealId})…\n`)
  const { ok, json, text } = await hubspotGet(
    `/crm/v3/objects/deals/${dealId}?properties=dealname,hubspot_owner_id`
  )
  if (!ok) {
    console.error('Deal lookup failed:', text)
    return
  }
  const ownerId = json?.properties?.hubspot_owner_id
  const dealName = json?.properties?.dealname ?? '(unnamed deal)'
  if (!ownerId) {
    console.error(`Deal "${dealName}" has no hubspot_owner_id — assign an owner in HubSpot first.`)
    return
  }
  console.log(`Deal: ${dealName}`)
  console.log(`  hubspot_owner_id=${ownerId}`)
  console.log('\nUse this id in SALES_ALERT_HUBSPOT_OWNER_IDS (Jess first, John second).')
}

const owners = await listOwners()
console.log(`Found ${owners.length} active owner(s):\n`)
for (const o of owners) {
  const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || '(no name)'
  console.log(`  id=${o.id}  userId=${o.userId ?? '—'}  ${name}  ${o.email ?? ''}`)
}
console.log('\nSet in Vercel (Jess first, John second):')
console.log('SALES_ALERT_HUBSPOT_OWNER_IDS=<jess_id>,<john_id>')
console.log('\nNote: use `id` above, not `userId` — HubSpot rejects userId for hubspot_owner_id.')

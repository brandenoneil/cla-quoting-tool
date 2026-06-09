#!/usr/bin/env node
/**
 * One-time setup: create deal properties used by dealer quote alerts.
 * Requires HUBSPOT_PRIVATE_APP_TOKEN with crm.schemas.deals.write (or admin).
 *
 * Usage: npm run hubspot:setup-alerts
 */
import 'dotenv/config'

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim()
const BASE = 'https://api.hubapi.com'

if (!TOKEN) {
  console.error('Missing HUBSPOT_PRIVATE_APP_TOKEN')
  process.exit(1)
}

async function hubspot(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const msg = json.message || json.status || res.statusText
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`)
    err.status = res.status
    throw err
  }
  return json
}

async function ensureProperty(def) {
  try {
    await hubspot('GET', `/crm/v3/properties/deals/${def.name}`)
    console.log(`✓ ${def.name} already exists`)
  } catch (err) {
    if (!String(err.message).includes('404')) throw err
    await hubspot('POST', '/crm/v3/properties/deals', def)
    console.log(`+ Created ${def.name}`)
  }
}

const PROPERTIES = [
  {
    name: 'quote_tool_status',
    label: 'Quote tool status',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'dealinformation',
    options: [
      { label: 'Pending', value: 'pending', displayOrder: 0, hidden: false },
      { label: 'Ready for review', value: 'ready_for_review', displayOrder: 1, hidden: false },
      { label: 'Published', value: 'published', displayOrder: 2, hidden: false },
    ],
  },
  {
    name: 'quote_tool_machine_summary',
    label: 'Quote tool machine summary',
    type: 'string',
    fieldType: 'text',
    groupName: 'dealinformation',
  },
]

console.log('Ensuring HubSpot deal properties for dealer quote alerts…')
try {
  for (const def of PROPERTIES) {
    await ensureProperty(def)
  }
  console.log('\nDone. Next: create the workflow in HubSpot (see docs/hubspot-dealer-alert-workflow.md).')
} catch (err) {
  if (err.status === 403) {
    console.error('\nHubSpot token lacks property-write scope.')
    console.error('Add crm.schemas.deals.write to your private app, or create properties manually:')
    console.error('  docs/hubspot-dealer-alert-workflow.md')
    process.exit(1)
  }
  throw err
}

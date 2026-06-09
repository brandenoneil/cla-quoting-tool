import type { HubSpotDeal } from '@/types'

const BASE_URL = 'https://api.hubapi.com'

export function hubspotConfigured(): boolean {
  return !!(process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? '').trim()
}

function getHeaders() {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) throw new Error('HUBSPOT_PRIVATE_APP_TOKEN is not set')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 1): Promise<Response> {
  const res = await fetch(url, options)
  if (!res.ok && retries > 0) {
    await delay(500)
    return fetchWithRetry(url, options, retries - 1)
  }
  return res
}

// ─── DEAL ENRICHMENT ─────────────────────────────────────────────────────────

export interface DealEnrichment {
  dealId: string
  lineItems: { description: string; quantity: number; price: number; name: string }[]
  notes: string[]
  quotes: { name: string; status: string; amount: number | null }[]
}

/**
 * For a single historical deal, fetch all associated line items, notes, and quotes.
 * Used to give Claude detailed configuration context (laser source, options, etc.)
 */
export async function enrichDeal(dealId: string): Promise<DealEnrichment> {
  const result: DealEnrichment = { dealId, lineItems: [], notes: [], quotes: [] }

  // Fetch line item IDs, note IDs, and quote IDs in parallel
  const [liRes, noteRes, quoteRes] = await Promise.allSettled([
    fetchWithRetry(
      `${BASE_URL}/crm/v3/objects/deals/${dealId}/associations/line_items`,
      { headers: getHeaders() }
    ),
    fetchWithRetry(
      `${BASE_URL}/crm/v3/objects/deals/${dealId}/associations/notes`,
      { headers: getHeaders() }
    ),
    fetchWithRetry(
      `${BASE_URL}/crm/v3/objects/deals/${dealId}/associations/quotes`,
      { headers: getHeaders() }
    ),
  ])

  // ── Line items ──
  if (liRes.status === 'fulfilled' && liRes.value.ok) {
    const liData = await liRes.value.json()
    const liIds: string[] = (liData.results ?? []).map((r: any) => r.id).slice(0, 20)
    if (liIds.length > 0) {
      try {
        const liDetails = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/line_items/batch/read`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            inputs: liIds.map((id) => ({ id })),
            properties: ['name', 'description', 'quantity', 'price', 'hs_product_id'],
          }),
        })
        if (liDetails.ok) {
          const liJson = await liDetails.json()
          result.lineItems = (liJson.results ?? []).map((li: any) => ({
            name: li.properties?.name ?? '',
            description: li.properties?.description ?? '',
            quantity: Number(li.properties?.quantity ?? 1),
            price: Number(li.properties?.price ?? 0),
          }))
        }
      } catch { /* ignore */ }
    }
  }

  // ── Notes ──
  if (noteRes.status === 'fulfilled' && noteRes.value.ok) {
    const noteData = await noteRes.value.json()
    const noteIds: string[] = (noteData.results ?? []).map((r: any) => r.id).slice(0, 10)
    if (noteIds.length > 0) {
      try {
        const noteDetails = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/notes/batch/read`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            inputs: noteIds.map((id) => ({ id })),
            properties: ['hs_note_body', 'hs_timestamp'],
          }),
        })
        if (noteDetails.ok) {
          const noteJson = await noteDetails.json()
          result.notes = (noteJson.results ?? [])
            .map((n: any) => (n.properties?.hs_note_body ?? '').replace(/<[^>]+>/g, ' ').trim())
            .filter((t: string) => t.length > 10)
        }
      } catch { /* ignore */ }
    }
  }

  // ── Quotes ──
  if (quoteRes.status === 'fulfilled' && quoteRes.value.ok) {
    const qData = await quoteRes.value.json()
    const qIds: string[] = (qData.results ?? []).map((r: any) => r.id).slice(0, 5)
    if (qIds.length > 0) {
      try {
        const qDetails = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/quotes/batch/read`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            inputs: qIds.map((id) => ({ id })),
            properties: ['hs_title', 'hs_status', 'hs_total_amount'],
          }),
        })
        if (qDetails.ok) {
          const qJson = await qDetails.json()
          result.quotes = (qJson.results ?? []).map((q: any) => ({
            name: q.properties?.hs_title ?? '',
            status: q.properties?.hs_status ?? '',
            amount: q.properties?.hs_total_amount ? Number(q.properties.hs_total_amount) : null,
          }))
        }
      } catch { /* ignore */ }
    }
  }

  return result
}

// ─── DEALS ───────────────────────────────────────────────────────────────────

export async function getDealHistoryByCompany(
  companyName: string,
  excludeDealId?: string,
  limit = 10
): Promise<HubSpotDeal[]> {
  if (!companyName.trim()) return []

  const props = ['dealname', 'amount', 'dealstage', 'closedate', 'dealer_company', 'hs_lastmodifieddate']
  const sorts = [{ propertyName: 'closedate', direction: 'DESCENDING' }]

  // Search across ALL pipelines using two OR'd filter groups:
  // 1. exact dealer_company field match
  // 2. first meaningful word of company name appears in deal name
  const firstWord = companyName.split(' ').find(w => w.length > 3) ?? companyName.split(' ')[0]
  const body = {
    filterGroups: [
      {
        filters: [
          { propertyName: 'dealer_company', operator: 'EQ', value: companyName },
        ],
      },
      {
        filters: [
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: firstWord },
        ],
      },
    ],
    properties: props,
    sorts,
    limit: limit * 2, // fetch more since we're broader, de-dup below
  }

  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/deals/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) return []
  const data = await res.json()
  const results: HubSpotDeal[] = data.results ?? []

  // De-duplicate by id and exclude current deal
  const seen = new Set<string>()
  return results.filter((d) => {
    if (excludeDealId && d.id === excludeDealId) return false
    if (seen.has(d.id)) return false
    seen.add(d.id)
    return true
  })
}

/**
 * Find Closed Won deals that mention a machine model keyword in dealname.
 * Returns deals with non-null amounts for historical pricing analysis.
 */
export async function getClosedWonDealsByModel(
  modelKeyword: string,
  limit = 25
): Promise<HubSpotDeal[]> {
  if (!modelKeyword.trim()) return []
  const body = {
    filterGroups: [
      {
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: '90932330' },
          { propertyName: 'dealstage', operator: 'EQ', value: '168290368' }, // Closed Won
          { propertyName: 'amount', operator: 'HAS_PROPERTY' },
          { propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: modelKeyword },
        ],
      },
    ],
    properties: ['dealname', 'amount', 'dealstage', 'closedate', 'dealer_company'],
    sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
    limit,
  }
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/deals/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.results ?? []).filter((d: HubSpotDeal) => {
    const amt = parseFloat(d.properties?.amount ?? '0')
    return amt > 10000
  })
}

export async function searchDealsByStages(
  stages: string[],
  query = '',
  limit = 50
): Promise<HubSpotDeal[]> {
  const filters: any[] = [
    { propertyName: 'pipeline', operator: 'EQ', value: '90932330' },
    { propertyName: 'dealstage', operator: 'IN', values: stages },
  ]
  if (query.trim()) {
    filters.push({ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: query })
  }

  const body = {
    filterGroups: [{ filters }],
    properties: ['dealname', 'amount', 'dealstage', 'closedate', 'hubspot_owner_id', 'dealer_company', 'hs_lastmodifieddate'],
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    limit,
    associations: ['contacts'],
  }

  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/deals/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`HubSpot deal stage search failed: ${await res.text()}`)
  const data = await res.json()
  return data.results ?? []
}

export async function searchDeals(query: string, page = 0): Promise<HubSpotDeal[]> {
  const filters = [
    { propertyName: 'pipeline', operator: 'EQ', value: '90932330' },
    { propertyName: 'dealstage', operator: 'NOT_IN', values: ['168290368', '168290369'] },
  ]

  if (query.trim()) {
    filters.push({ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: query } as any)
  }

  const body = {
    filterGroups: [{ filters }],
    properties: [
      'dealname', 'amount', 'dealstage', 'closedate',
      'hubspot_owner_id', 'dealer_company', 'hs_lastmodifieddate',
    ],
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    limit: 20,
    after: page * 20,
    associations: ['contacts'],
  }

  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/deals/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot deal search failed: ${err}`)
  }

  const data = await res.json()
  return data.results ?? []
}

export async function getDeal(dealId: string): Promise<HubSpotDeal> {
  const res = await fetchWithRetry(
    `${BASE_URL}/crm/v3/objects/deals/${dealId}?properties=dealname,amount,dealstage,closedate,hubspot_owner_id,dealer_company&associations=contacts`,
    { headers: getHeaders() }
  )
  if (!res.ok) throw new Error(`Failed to get deal: ${await res.text()}`)
  return res.json()
}

export async function updateDeal(dealId: string, properties: Record<string, string>) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) throw new Error(`Failed to update deal: ${await res.text()}`)
  return res.json()
}

export async function createDeal(properties: Record<string, string | number>) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/deals`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) throw new Error(`Failed to create deal: ${await res.text()}`)
  return res.json()
}

function isInvalidOwnerAssignmentError(message: string): boolean {
  return message.includes('hubspot_owner_id') || message.includes('INVALID_INTEGER')
}

/** Create a deal; if HubSpot rejects hubspot_owner_id, retry without owner assignment. */
export async function createDealResilient(
  properties: Record<string, string | number>
): Promise<{ deal: Awaited<ReturnType<typeof createDeal>>; ownerAssignmentSkipped: boolean }> {
  const ownerId = properties.hubspot_owner_id
  if (ownerId == null || ownerId === '') {
    return { deal: await createDeal(properties), ownerAssignmentSkipped: false }
  }

  try {
    return { deal: await createDeal(properties), ownerAssignmentSkipped: false }
  } catch (err: any) {
    const message = err?.message ?? ''
    if (!isInvalidOwnerAssignmentError(message)) throw err

    const { hubspot_owner_id: _removed, ...withoutOwner } = properties
    console.warn('[hubspot] createDeal: skipping invalid hubspot_owner_id', ownerId)
    return {
      deal: await createDeal(withoutOwner),
      ownerAssignmentSkipped: true,
    }
  }
}

// ─── CONTACTS ─────────────────────────────────────────────────────────────────

export async function getContact(contactId: string) {
  const res = await fetchWithRetry(
    `${BASE_URL}/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,phone`,
    { headers: getHeaders() }
  )
  if (!res.ok) throw new Error(`Failed to get contact: ${await res.text()}`)
  return res.json()
}

export async function searchContactByEmail(email: string) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['firstname', 'lastname', 'email', 'phone'],
      limit: 1,
    }),
  })
  if (!res.ok) throw new Error(`Failed to search contact: ${await res.text()}`)
  const data = await res.json()
  return data.results?.[0] ?? null
}

export async function createContact(properties: Record<string, string>) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/contacts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) throw new Error(`Failed to create contact: ${await res.text()}`)
  return res.json()
}

// ─── COMPANIES ────────────────────────────────────────────────────────────────

export async function searchCompanyByName(name: string) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/companies/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: name }] }],
      properties: ['name'],
      limit: 1,
    }),
  })
  if (!res.ok) throw new Error(`Failed to search company: ${await res.text()}`)
  const data = await res.json()
  return data.results?.[0] ?? null
}

export async function searchCompanies(query: string, limit = 10) {
  const raw = query.trim()
  if (!raw.length) return []

  /** CONTAINS_TOKEN behaves better than undocumented `query` field for portal-to-portal behavior */
  const firstToken =
    raw
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .find((w) => w.length >= 2) ?? raw.slice(0, 64)

  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/companies/search`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'name',
              operator: 'CONTAINS_TOKEN',
              value: firstToken,
            },
          ],
        },
      ],
      properties: ['name', 'city', 'state'],
      limit,
    }),
  })
  if (!res.ok) throw new Error(`Failed to search companies: ${await res.text()}`)
  const data = await res.json()
  return (data.results ?? []) as { id: string; properties: { name: string; city?: string; state?: string } }[]
}

export async function getCompanyPrimaryContact(companyId: string): Promise<{ name: string; email: string; phone: string } | null> {
  try {
    const assocRes = await fetchWithRetry(
      `${BASE_URL}/crm/v3/objects/companies/${companyId}/associations/contacts`,
      { headers: getHeaders() }
    )
    if (!assocRes.ok) return null
    const assocData = await assocRes.json()
    const contactId = assocData.results?.[0]?.id
    if (!contactId) return null
    const contact = await getContact(contactId)
    return {
      name: [contact.properties?.firstname, contact.properties?.lastname].filter(Boolean).join(' '),
      email: contact.properties?.email ?? '',
      phone: contact.properties?.phone ?? '',
    }
  } catch {
    return null
  }
}

export async function createCompany(properties: Record<string, string>) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/companies`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) throw new Error(`Failed to create company: ${await res.text()}`)
  return res.json()
}

// ─── ASSOCIATIONS ─────────────────────────────────────────────────────────────

export async function associateObjects(
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  associationType: string | number
) {
  const res = await fetchWithRetry(
    `${BASE_URL}/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`,
    {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: Number(associationType) }]),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    // Throw so callers' catch blocks can run fallback logic
    throw new Error(`Association failed (${fromType}→${toType}): ${err}`)
  }
}

// Legacy v3 association
export async function associateV3(
  fromType: string,
  fromId: string,
  toType: string,
  toId: string,
  assocType: string
) {
  const res = await fetchWithRetry(
    `${BASE_URL}/crm/v3/objects/${fromType}/${fromId}/associations/${toType}/${toId}/${assocType}`,
    { method: 'PUT', headers: getHeaders() }
  )
  if (!res.ok) {
    console.error(`V3 Association failed: ${await res.text()}`)
  }
}

// ─── QUOTES ──────────────────────────────────────────────────────────────────

export async function createHubSpotQuote(properties: Record<string, string | number>) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/quotes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) throw new Error(`Failed to create HubSpot quote: ${await res.text()}`)
  return res.json()
}

/** Links a HubSpot quote to a quote template (required for a finished quote document in HubSpot). */
export async function associateQuoteTemplate(hsQuoteId: string, templateId: string) {
  try {
    await associateObjects('quotes', hsQuoteId, 'quote_templates', templateId, 286)
  } catch {
    try {
      await associateV3('quotes', hsQuoteId, 'quote_templates', templateId, 'quote_to_quote_template')
    } catch {
      throw new Error('quote→template association failed')
    }
  }
}

// ─── LINE ITEMS ───────────────────────────────────────────────────────────────

export async function createLineItem(properties: Record<string, string | number>) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/line_items`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) throw new Error(`Failed to create line item: ${await res.text()}`)
  return res.json()
}

// ─── QUOTE TEMPLATES ──────────────────────────────────────────────────────────

export interface QuoteTemplate {
  id: string
  name: string
  status: string
}

export async function fetchQuoteTemplates(): Promise<QuoteTemplate[]> {
  const res = await fetchWithRetry(
    `${BASE_URL}/crm/v3/objects/quote_templates?limit=100&properties=hs_name,hs_status`,
    { headers: getHeaders() }
  )
  if (!res.ok) throw new Error(`Failed to fetch quote templates: ${await res.text()}`)
  const data = await res.json()
  return (data.results ?? []).map((t: any) => ({
    id: t.id,
    name: t.properties?.hs_name ?? '',
    status: t.properties?.hs_status ?? '',
  }))
}

// ─── NOTES ────────────────────────────────────────────────────────────────────

export async function createTask(
  subject: string,
  body: string,
  priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH',
  options?: { ownerId?: string; dueDate?: Date }
) {
  const properties: Record<string, string> = {
    hs_task_subject: subject,
    hs_task_body: body,
    hs_task_priority: priority,
    hs_task_status: 'NOT_STARTED',
    hs_timestamp: Date.now().toString(),
  }
  if (options?.ownerId) properties.hubspot_owner_id = options.ownerId
  if (options?.dueDate) properties.hs_timestamp = options.dueDate.getTime().toString()

  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/tasks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) throw new Error(`Failed to create task: ${await res.text()}`)
  return res.json()
}

export async function createNote(body: string) {
  const res = await fetchWithRetry(`${BASE_URL}/crm/v3/objects/notes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      properties: {
        hs_note_body: body,
        hs_timestamp: Date.now().toString(),
      },
    }),
  })
  if (!res.ok) throw new Error(`Failed to create note: ${await res.text()}`)
  return res.json()
}

export async function deleteHubSpotQuote(hubspotQuoteId: string): Promise<void> {
  const res = await fetchWithRetry(
    `${BASE_URL}/crm/v3/objects/quotes/${hubspotQuoteId}`,
    { method: 'DELETE', headers: getHeaders() }
  )
  // 204 = success, 404 = already gone — both are fine
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete HubSpot quote ${hubspotQuoteId}: ${await res.text()}`)
  }
}
